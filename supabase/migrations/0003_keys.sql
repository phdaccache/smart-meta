-- Smart Meta: end-to-end encryption (stage S3 of docs/notifications).
-- The phone encrypts every record with a random data key before it syncs. The server keeps that key only
-- locked, by the person's passkey (or a data password their password manager keeps), in `user_keys`, so
-- nobody with access to the database, the owner included, can read anyone's content (spec PR-1).
-- Safe to run again. Needs 0002 first.

-- ——— user_keys ———

-- One lock: the data key sealed (AES-GCM) by one way of unlocking it. See src/sync/crypto.ts.
create or replace function private.valid_lock(l jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(l) = 'object'
    and jsonb_typeof(l -> 'iv') = 'string' and (l ->> 'iv') ~ '^[A-Za-z0-9_-]{16}$'
    and jsonb_typeof(l -> 'ct') = 'string' and (l ->> 'ct') ~ '^[A-Za-z0-9_-]{64}$'
    and jsonb_typeof(l -> 'salt') = 'string' and (l ->> 'salt') ~ '^[A-Za-z0-9_-]{22,43}$'
    and case l ->> 'kind'
      when 'passkey' then
        l - array['kind', 'iv', 'ct', 'salt', 'credentialId'] = '{}'::jsonb
        and jsonb_typeof(l -> 'credentialId') = 'string' and (l ->> 'credentialId') ~ '^[A-Za-z0-9_-]+$'
        and char_length(l ->> 'credentialId') between 16 and 1400
      when 'password' then
        l - array['kind', 'iv', 'ct', 'salt', 'iterations'] = '{}'::jsonb
        and jsonb_typeof(l -> 'iterations') = 'number' and (l ->> 'iterations')::numeric between 100000 and 10000000
      else false
    end
$$;

create or replace function private.valid_locks(locks jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(locks) = 'array'
    and jsonb_array_length(locks) between 1 and 10
    and (select bool_and(private.valid_lock(l)) from jsonb_array_elements(locks) l)
$$;

create table if not exists public.user_keys (
  user_id     uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Which data key this is: records are sealed with it, and a phone holding another one stops.
  key_id      text        not null,
  -- The sharing key pair (spec PR-5), for social features later: its public half (SPKI) ...
  public_key  text        not null,
  -- ... and its private half, sealed with the data key ({ iv, ct }).
  private_key jsonb       not null,
  -- The data key, locked once per way to unlock it.
  locks       jsonb       not null,
  created_at  timestamptz not null default now(),
  constraint user_keys_key_id check (key_id ~ '^[A-Za-z0-9_-]{22}$'),
  constraint user_keys_public_key check (public_key ~ '^[A-Za-z0-9_-]{80,200}$'),
  constraint user_keys_private_key check (
    jsonb_typeof(private_key) = 'object'
    and private_key - array['iv', 'ct'] = '{}'::jsonb
    and (private_key ->> 'iv') ~ '^[A-Za-z0-9_-]{16}$'
    and (private_key ->> 'ct') ~ '^[A-Za-z0-9_-]+$' and char_length(private_key ->> 'ct') between 100 and 400
  ),
  constraint user_keys_locks check (private.valid_locks(locks))
);

-- Each member reads and makes their own row, once. Nobody changes or deletes it through the API: a stolen
-- session can't swap the key or lock its owner out. It goes with the account (`on delete cascade`).
alter table public.user_keys enable row level security;
drop policy if exists "own keys, members only" on public.user_keys;
create policy "own keys, members only" on public.user_keys
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.is_member()))
  with check ((select auth.uid()) = user_id and (select private.is_member()));
revoke all on public.user_keys from anon, authenticated;
grant select, insert on public.user_keys to authenticated;

revoke all on function private.valid_lock(jsonb), private.valid_locks(jsonb) from public, anon;
grant execute on function private.valid_lock(jsonb), private.valid_locks(jsonb) to authenticated;

-- ——— records: only ciphertext from now on ———

-- New writes must be sealed ({ e: 1, iv, ct }). Rows synced before this stay until the app seals them
-- (spec PR-6): `not valid` leaves existing rows alone and checks every insert and update.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'records_data_sealed' and conrelid = 'public.records'::regclass) then
    alter table public.records add constraint records_data_sealed check (
      jsonb_typeof(data) = 'object'
      and data - array['e', 'iv', 'ct'] = '{}'::jsonb
      and data -> 'e' = '1'::jsonb
      and (data ->> 'iv') ~ '^[A-Za-z0-9_-]{16}$'
      and (data ->> 'ct') ~ '^[A-Za-z0-9_-]+$'
    ) not valid;
  end if;
end $$;
