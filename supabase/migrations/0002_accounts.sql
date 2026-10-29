-- Smart Meta: accounts (stage S2 of docs/notifications).
-- Who may sync: `members`, written only through approve_member(), which only the owner can call.
-- Anyone can sign up (email code + captcha), but a non-member can't read or write anything on the
-- server: their data stays on their phone until approved (spec AC-4, SE-5).
-- Every table has row-level security and explicit grants; nothing is granted to `anon` (spec SE-1).

-- Helpers live in a schema the API doesn't expose: policies call them, the app can't.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Spec N-1: members at most. The one place this number lives on the server (spec RE-5).
create or replace function private.members_max() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;

-- The owner, recognized by a hash of their email so the address isn't in this public repo
-- (the same hash as src/ui/developer.ts). Only a confirmed email counts.
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex')
          = 'b62a4c356a22ce19fe9b1e10ad382e3d37e1dde10d0543546e709729e90eae17'
  )
$$;

-- ——— members ———

-- Everyone who had an account before this migration was already syncing: they stay in. Only the first
-- run does this, so running the file again never lets in someone who signed up since.
do $$
begin
  if to_regclass('public.members') is null then
    create table public.members (
      user_id     uuid        primary key references auth.users (id) on delete cascade,
      approved_at timestamptz not null default now()
    );
    insert into public.members (user_id) select id from auth.users;
  end if;
end $$;

-- No policies: nobody reads or writes it through the API. The functions below do.
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select, insert, delete on public.members to service_role;

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid())
$$;

-- ——— records: members only ———

drop policy if exists "own records" on public.records;
drop policy if exists "own records, members only" on public.records;
create policy "own records, members only" on public.records
  for all to authenticated
  using (auth.uid() = user_id and (select private.is_member()))
  with check (auth.uid() = user_id and (select private.is_member()));

-- ——— profiles ———

create table if not exists public.profiles (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  name       text        not null default '',
  -- { emoji, color, look, pattern }: see src/lib/avatar.ts.
  avatar     jsonb,
  updated_at timestamptz not null default now(),
  constraint profiles_name check (char_length(name) <= 40 and name !~ '[\u0001-\u001f\u007f<>]'),
  constraint profiles_avatar check (
    avatar is null or (
      jsonb_typeof(avatar) = 'object'
      and avatar ?& array['emoji', 'color', 'look', 'pattern']
      and avatar - array['emoji', 'color', 'look', 'pattern'] = '{}'::jsonb
      and jsonb_typeof(avatar -> 'emoji') = 'string'
      -- One emoji: a short run of symbols, no letters, digits, spaces, control characters or markup.
      and char_length(avatar ->> 'emoji') between 1 and 16
      and (avatar ->> 'emoji') !~ '[[:alnum:][:space:]\u0001-\u001f\u007f<>&"''\\]'
      and avatar ->> 'color' in ('red', 'orange', 'yellow', 'green', 'mint', 'teal', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray')
      and avatar ->> 'look' in ('gradient', 'solid', 'soft')
      and avatar ->> 'pattern' in ('none', 'dots', 'stripes', 'grid', 'waves', 'sunburst')
    )
  )
);

-- Each member reads and writes their own profile; nobody else's yet (social comes later).
-- A non-member's name and avatar wait on the phone with everything else.
alter table public.profiles enable row level security;
drop policy if exists "own profile, members only" on public.profiles;
create policy "own profile, members only" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id and (select private.is_member()))
  with check (auth.uid() = user_id and (select private.is_member()));
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- ——— what the app calls ———

-- Where this account stands: 'member', 'waiting', or 'full' (waiting, and the list is at the cap).
-- The owner is let in the first time they ask.
create or replace function public.my_access() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if private.is_member() then
    return 'member';
  end if;
  if private.is_owner() then
    insert into public.members (user_id) values (auth.uid()) on conflict do nothing;
    return 'member';
  end if;
  if (select count(*) from public.members) >= private.members_max() then
    return 'full';
  end if;
  return 'waiting';
end $$;

-- The owner's Requests list: everyone with a confirmed email who isn't a member yet, oldest first.
create or replace function public.pending_requests()
returns table (user_id uuid, email text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can see requests' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.members m where m.user_id = u.id)
    order by u.created_at;
end $$;

-- The rest of Requests: who's in, newest first (at most the cap, so all of them).
create or replace function public.members_overview()
returns table (email text, approved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can see members' using errcode = '42501';
  end if;
  return query
    select u.email::text, m.approved_at
    from public.members m join auth.users u on u.id = m.user_id
    order by m.approved_at desc;
end $$;

-- One tap in Requests. Refuses anyone but the owner, and past the cap.
create or replace function public.approve_member(member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can approve' using errcode = '42501';
  end if;
  -- One approval at a time, so two quick taps can't both slip under the cap.
  lock table public.members in share row exclusive mode;
  if exists (select 1 from public.members m where m.user_id = member) then
    return;
  end if;
  if (select count(*) from public.members) >= private.members_max() then
    raise exception 'the list is full' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = member and u.email_confirmed_at is not null) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  insert into public.members (user_id) values (member);
end $$;

-- Settings → Delete account: the account and, by `on delete cascade`, its records, membership and
-- profile. Later tables (keys, push) cascade from auth.users too.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function private.members_max(), private.is_owner(), private.is_member() from public, anon;
grant execute on function private.members_max(), private.is_owner(), private.is_member() to authenticated;
revoke all on function public.my_access(), public.pending_requests(), public.members_overview(), public.approve_member(uuid),
  public.delete_my_account()
  from public, anon;
grant execute on function public.my_access(), public.pending_requests(), public.members_overview(), public.approve_member(uuid),
  public.delete_my_account()
  to authenticated;
