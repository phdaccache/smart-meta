-- Smart Meta: limits and upkeep (stage S4 of docs/notifications).
-- What one account may write, so a bug, a script or a stolen account can't fill the free 500 MB
-- (spec SY-5, SY-7, SY-9; plan §3.5). Hitting a limit refuses the whole write: the rows stay on the
-- phone, sync shows "Couldn't sync", and the usage alarm in the backups repo tells the owner first.
-- Every number lives in one function below (spec RE-5); change it there and in the spec's table.

-- ——— the numbers ———

-- N-2: rows per user in total. A row is one saved item; editing it doesn't add one.
create or replace function private.rows_max() returns integer
language sql immutable set search_path = '' as $$ select 30000 $$;

-- N-3: new rows per user per day (UTC). High on purpose: the first upload after approval and the
-- encryption migration send a lot at once.
create or replace function private.rows_per_day_max() returns integer
language sql immutable set search_path = '' as $$ select 5000 $$;

-- N-4: bytes in one record's `data` (64 KB).
create or replace function private.record_bytes_max() returns integer
language sql immutable set search_path = '' as $$ select 65536 $$;

-- N-18: how far in the future a write may be stamped (a phone with a wrong clock would always win).
create or replace function private.clock_ahead_max() returns interval
language sql immutable set search_path = '' as $$ select interval '5 minutes' $$;

-- N-19: deleted rows are purged after this.
create or replace function private.purge_after() returns interval
language sql immutable set search_path = '' as $$ select interval '90 days' $$;

-- ——— every write: size and clock ———

-- Messages start with a word the app logs ("limit", "clock"), never with content.
create or replace function private.records_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if octet_length(new.data::text) > private.record_bytes_max() then
    raise exception 'limit: record over % bytes', private.record_bytes_max() using errcode = '54000';
  end if;
  if new.updated_at > now() + private.clock_ahead_max() then
    raise exception 'clock: stamped % ahead of the server', new.updated_at - now() using errcode = '22008';
  end if;
  return new;
end $$;

drop trigger if exists records_guard on public.records;
create trigger records_guard before insert or update on public.records
  for each row execute function private.records_guard();

-- ——— new rows: per user, in total and per day ———

-- New rows per user per day, kept for the usage alarm too. Purged after 30 days. Not reachable
-- through the API (the `private` schema isn't exposed); only the definer functions below write it.
create table if not exists private.daily_rows (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null,
  rows    integer not null,
  primary key (user_id, day)
);
alter table private.daily_rows enable row level security;
revoke all on private.daily_rows from public, anon, authenticated;

-- Once per write, not per row: an upload of 200 records counts each user's rows once. Only rows
-- really inserted count (an upsert that updates an existing row isn't a new row).
create or replace function private.records_count_new() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  today date := (now() at time zone 'utc')::date;
  day_total integer;
begin
  for r in select user_id, count(*)::integer as n from new_rows group by user_id loop
    insert into private.daily_rows as d (user_id, day, rows) values (r.user_id, today, r.n)
      on conflict (user_id, day) do update set rows = d.rows + excluded.rows
      returning d.rows into day_total;
    if day_total > private.rows_per_day_max() then
      raise exception 'limit: over % new rows today', private.rows_per_day_max() using errcode = '54000';
    end if;
    if (select count(*) from public.records where user_id = r.user_id) > private.rows_max() then
      raise exception 'limit: over % rows', private.rows_max() using errcode = '54000';
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists records_count_new on public.records;
create trigger records_count_new after insert on public.records
  referencing new table as new_rows
  for each statement execute function private.records_count_new();


-- ——— purge: deleted rows after N-19, counts after 30 days ———

-- Tombstones stay long enough for every phone to hear of the deletion; a phone offline for longer
-- keeps its own copy, which is never deleted by this.
create or replace function private.purge() returns void
language sql security definer set search_path = '' as $$
  delete from public.records where deleted and updated_at < now() - private.purge_after();
  delete from private.daily_rows where day < (now() at time zone 'utc')::date - 30;
$$;

-- Triggers and the job run these as their owner; nobody calls them through the API.
revoke all on function private.rows_max(), private.rows_per_day_max(), private.record_bytes_max(),
  private.clock_ahead_max(), private.purge_after(), private.records_guard(), private.records_count_new(),
  private.purge() from public, anon, authenticated;

-- Every day at 05:00 UTC (02:00 in São Paulo). pg_cron comes with Supabase; S5's dispatcher uses it too.
create extension if not exists pg_cron;
select cron.schedule('smart-meta-purge', '0 5 * * *', 'select private.purge()');
