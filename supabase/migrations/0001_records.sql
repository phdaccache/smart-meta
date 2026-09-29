-- Smart Meta: one table holds every synced record as JSON.
-- The app's own schema versioning lives in `data_version` (see src/lib/migrations.ts);
-- Postgres-side changes go in new numbered files here. Never edit an applied file.

create sequence if not exists public.records_seq;

create table if not exists public.records (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection   text        not null,
  id           text        not null,
  data         jsonb       not null,
  updated_at   timestamptz not null,       -- client write time, used for last-write-wins
  deleted      boolean     not null default false,
  data_version integer     not null default 1,
  seq          bigint      not null default nextval('public.records_seq'), -- pull cursor
  primary key (user_id, collection, id)
);

create index if not exists records_user_seq on public.records (user_id, seq);

-- Last write wins, and every accepted write moves to the end of the pull cursor.
create or replace function public.records_before_update() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- stale write: keep the newer row
  end if;
  new.seq := nextval('public.records_seq');
  return new;
end $$;

drop trigger if exists records_before_update on public.records;
create trigger records_before_update before update on public.records
  for each row execute function public.records_before_update();

alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on sequence public.records_seq to authenticated;
