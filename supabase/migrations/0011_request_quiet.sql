-- Smart Meta: quiet hours for the owner's "New request" push (stage S6 of docs/notifications).
-- Every other push is planned on the phone, which applies quiet hours itself. This one the server starts when
-- someone signs up, and the settings are encrypted, so the owner's phone tells the server the owner's own
-- quiet hours here (owner, 2026-11-01). Only the owner's: nobody else's hours ever reach the server.
-- Safe to run again. Needs 0010 first.

alter table private.push_config
  add column if not exists request_quiet_from time,
  add column if not exists request_quiet_to time;

-- Whether a time falls in quiet hours: to the minute they end, not including it, and across midnight. As
-- afterQuiet() in src/lib/planner.ts. No hours, or both the same: never.
create or replace function private.in_quiet(t time, quiet_from time, quiet_to time) returns boolean
language sql immutable set search_path = '' as $$
  select quiet_from is not null and quiet_to is not null and quiet_from <> quiet_to and case
    when quiet_from < quiet_to then t >= quiet_from and t < quiet_to
    else t >= quiet_from or t < quiet_to
  end
$$;

-- The owner's phone, when they change. Both null: off.
create or replace function private.set_request_quiet(quiet_from text, quiet_to text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can change this' using errcode = '42501';
  end if;
  if (quiet_from is null) <> (quiet_to is null)
     or quiet_from !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or quiet_to !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'not a time' using errcode = '22023';
  end if;
  update private.push_config c
    set request_quiet_from = quiet_from::time, request_quiet_to = quiet_to::time
    where c.only_row;
end $$;

-- 0010's, with quiet hours: during them it sends nothing and leaves `requests_seen_at` where it is, so what came
-- in waits, and looks back that much further when they end. Still the same rows: anyone approved meanwhile is out.
create or replace function private.dispatch_requests()
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text, lang text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  cfg private.push_config;
  owner uuid := private.owner_id();
  sub public.push_subscriptions;
  here time;
  held interval := interval '0';
  r record;
begin
  select * into cfg from private.push_config c where c.only_row for update;
  if not found then
    return;
  end if;
  if cfg.mode = 'off' or owner is null then
    update private.push_config c set requests_seen_at = now() where c.only_row;
    return;
  end if;
  select * into sub from public.push_subscriptions p where p.user_id = owner;
  if not found then
    update private.push_config c set requests_seen_at = now() where c.only_row;
    return;
  end if;
  -- The phone's time zone. One the server doesn't know: no quiet hours, rather than no pushes.
  begin
    here := (now() at time zone sub.time_zone)::time;
  exception when others then
    here := null;
  end;
  if here is not null and private.in_quiet(here, cfg.request_quiet_from, cfg.request_quiet_to) then
    return;
  end if;
  if cfg.request_quiet_from is not null and cfg.request_quiet_to is not null and cfg.request_quiet_from <> cfg.request_quiet_to then
    held := cfg.request_quiet_to - cfg.request_quiet_from;
    if held < interval '0' then
      held := held + interval '24 hours';
    end if;
  end if;
  update private.push_config c set requests_seen_at = now() where c.only_row;
  for r in
    select u.email::text as email
    from auth.users u
    where u.email_confirmed_at > greatest(cfg.requests_seen_at, now() - private.stale_after() - held)
      and u.email_confirmed_at <= now()
      and u.id <> owner
      and not exists (select 1 from public.members m where m.user_id = u.id)
    order by u.email_confirmed_at
  loop
    user_id := owner;
    email := r.email;
    endpoint := sub.endpoint;
    p256dh := sub.p256dh;
    auth := sub.auth;
    lang := sub.lang;
    return next;
  end loop;
end $$;

-- The API: one wrapper, as in 0002.
create or replace function public.set_request_quiet(quiet_from text, quiet_to text) returns void
language sql security invoker set search_path = '' as $$ select private.set_request_quiet(quiet_from, quiet_to) $$;

revoke all on function private.in_quiet(time, time, time) from public, anon, authenticated;
revoke all on function private.set_request_quiet(text, text) from public, anon;
grant execute on function private.set_request_quiet(text, text) to authenticated;
revoke all on function public.set_request_quiet(text, text) from public, anon;
grant execute on function public.set_request_quiet(text, text) to authenticated;
