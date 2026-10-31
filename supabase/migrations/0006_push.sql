-- Smart Meta: push notifications (stage S5 of docs/notifications).
-- The app plans, the server delivers (plan §4): the phone uploads each planned push already encrypted
-- for its own subscription (plan §7.4), and every minute `pg_cron` calls the `dispatch` Edge Function
-- (supabase/functions/dispatch), which sends what's due through the functions below. The server never
-- sees a push's text, except the owner's "New request" one, which holds only the email (spec AC-5).
-- Every table has row-level security and explicit grants; nothing is granted to `anon` (spec SE-1).
-- Every number lives in one function below (spec RE-5); change it there and in the spec's table.

-- ——— the numbers ———

-- N-5: planned notifications waiting per user.
create or replace function private.pending_max() returns integer
language sql immutable set search_path = '' as $$ select 300 $$;

-- N-6: the phone plans 14 days ahead; the server takes up to 15.
create or replace function private.plan_ahead_max() returns interval
language sql immutable set search_path = '' as $$ select interval '15 days' $$;

-- N-9: a push later than this is dropped, never sent late. Also the push services' TTL.
create or replace function private.stale_after() returns interval
language sql immutable set search_path = '' as $$ select interval '15 minutes' $$;

-- N-8: the safety fuse, pushes per user in a day (the last 24 hours).
create or replace function private.fuse_max() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;

-- N-21: how long the send log is kept.
create or replace function private.send_log_keep() returns interval
language sql immutable set search_path = '' as $$ select interval '30 days' $$;

-- The owner's account id, by the same email hash as private.is_owner() (0002).
create or replace function private.owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where u.email_confirmed_at is not null
    and encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex')
        = 'b62a4c356a22ce19fe9b1e10ad382e3d37e1dde10d0543546e709729e90eae17'
$$;

-- ——— the switches (spec NO-16, NO-17) ———

-- One row. `mode`: 'off' is the kill switch (nothing is sent; what waits goes stale and is dropped);
-- 'shadow' sends only to the owner and the accounts in `push_beta`, and logs the rest as "would send"
-- (the shadow week, N-22); 'on' sends to everyone. Flip it in the SQL Editor:
--   update private.push_config set mode = 'off';
create table if not exists private.push_config (
  only_row         boolean     primary key default true check (only_row),
  mode             text        not null default 'shadow' check (mode in ('off', 'shadow', 'on')),
  -- Requests confirmed after this have had their push to the owner.
  requests_seen_at timestamptz not null default now()
);
insert into private.push_config (only_row) values (true) on conflict do nothing;

-- Accounts that get real pushes during the shadow period, besides the owner:
--   insert into private.push_beta (user_id) values ('<id>');
create table if not exists private.push_beta (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table private.push_config enable row level security;
alter table private.push_beta enable row level security;
drop policy if exists "not through the API" on private.push_config;
create policy "not through the API" on private.push_config for all to authenticated using (false) with check (false);
drop policy if exists "not through the API" on private.push_beta;
create policy "not through the API" on private.push_beta for all to authenticated using (false) with check (false);
revoke all on private.push_config, private.push_beta from public, anon, authenticated;

create or replace function private.push_live(who uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select who = private.owner_id() or exists (select 1 from private.push_beta b where b.user_id = who)
$$;

-- ——— push_subscriptions: one per account (spec NO-15) ———

-- The latest phone that turns notifications on replaces the row. `time_zone` and `lang` are metadata
-- for the server's own push (the owner's "New request"); `checked_at` is when the phone last checked its
-- permission and subscription (spec NO-23). `last_sent_at` and `last_error` are written by the dispatcher.
create table if not exists public.push_subscriptions (
  user_id      uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  endpoint     text        not null,
  p256dh       text        not null,
  auth         text        not null,
  time_zone    text        not null default 'UTC',
  lang         text        not null default 'en',
  checked_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error   text,
  -- Only the browsers' push services (the same list as PUSH_HOSTS in supabase/functions/_shared/webpush.ts):
  -- the dispatcher must never be made to post somewhere else.
  constraint push_endpoint check (
    char_length(endpoint) <= 1024
    and endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/[^[:space:]]*$'
  ),
  -- A P-256 point (65 bytes) and a 16-byte secret, base64url.
  constraint push_keys check (p256dh ~ '^[A-Za-z0-9_-]{87}$' and auth ~ '^[A-Za-z0-9_-]{22}$'),
  constraint push_time_zone check (char_length(time_zone) <= 64 and time_zone ~ '^[A-Za-z0-9_+/-]+$'),
  constraint push_lang check (lang in ('en', 'pt-BR')),
  constraint push_error check (last_error is null or char_length(last_error) <= 200)
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own subscription, members only" on public.push_subscriptions;
create policy "own subscription, members only" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.is_member()))
  with check ((select auth.uid()) = user_id and (select private.is_member()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, time_zone, lang, checked_at),
      update (endpoint, p256dh, auth, time_zone, lang, checked_at) on public.push_subscriptions to authenticated;

-- ——— scheduled_notifications: the plan, already encrypted ———

-- `id` is deterministic (`due:<taskId>:<fireAt>`, plan §4.1), so planning again updates instead of adding.
-- `payload` is the whole encrypted push body (base64url, at most 4,096 bytes); `sub_key` is the p256dh it
-- was encrypted for, so a push for a subscription that's gone is never sent. `tag` is the phone's own,
-- for telling what changed since its last upload (plan §4.1, "upload only the difference").
-- Sent and dropped rows stay for two days, so an upload that arrives late can't plan them again.
create table if not exists public.scheduled_notifications (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  fire_at    timestamptz not null,
  kind       text        not null,
  payload    text        not null,
  sub_key    text        not null,
  tag        text,
  status     text        not null default 'pending',
  -- When it was claimed ('sending'), sent or dropped.
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint scheduled_id check (char_length(id) <= 200 and id ~ '^[A-Za-z0-9:._-]+$'),
  constraint scheduled_kind check (kind in ('reminder', 'summary', 'review', 'goal-review', 'test')),
  -- 4,096 bytes are 5,462 base64url characters.
  constraint scheduled_payload check (char_length(payload) <= 5462 and payload ~ '^[A-Za-z0-9_-]+$'),
  constraint scheduled_sub_key check (sub_key ~ '^[A-Za-z0-9_-]{87}$'),
  constraint scheduled_tag check (tag is null or tag ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint scheduled_status check (status in ('pending', 'sending', 'sent', 'skipped', 'failed'))
);
create index if not exists scheduled_due on public.scheduled_notifications (fire_at) where status = 'pending';

alter table public.scheduled_notifications enable row level security;
drop policy if exists "own plan, members only" on public.scheduled_notifications;
create policy "own plan, members only" on public.scheduled_notifications
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.is_member()))
  with check ((select auth.uid()) = user_id and (select private.is_member()));
-- Only what hasn't gone out can be taken back: a sent row deleted could be planned and sent again.
drop policy if exists "only waiting rows are deleted" on public.scheduled_notifications;
create policy "only waiting rows are deleted" on public.scheduled_notifications
  as restrictive for delete to authenticated
  using (status = 'pending');
revoke all on public.scheduled_notifications from anon, authenticated;
grant select, delete on public.scheduled_notifications to authenticated;
-- An upsert sets every column it sends, `id` included.
grant insert (id, fire_at, kind, payload, sub_key, tag),
      update (id, fire_at, kind, payload, sub_key, tag) on public.scheduled_notifications to authenticated;

-- ——— the send log: no content (spec NO-16, NO-23) ———

-- Each push's fate: 'sent'; 'skipped' (reason late, fuse, shadow, old-subscription); 'failed' (reason
-- gone, lost, network, or the push service's HTTP status). The usage alarm counts 'sent' per day (N-20).
create table if not exists private.send_log (
  at      timestamptz not null default now(),
  user_id uuid        not null references auth.users (id) on delete cascade,
  kind    text        not null,
  fire_at timestamptz,
  status  text        not null check (status in ('sent', 'skipped', 'failed')),
  reason  text
);
create index if not exists send_log_user_at on private.send_log (user_id, at);
create index if not exists send_log_at on private.send_log (at);
alter table private.send_log enable row level security;
drop policy if exists "not through the API" on private.send_log;
create policy "not through the API" on private.send_log for all to authenticated using (false) with check (false);
revoke all on private.send_log from public, anon, authenticated;

-- ——— what the app may write ———

-- A write from the app (it has a signed-in user; the dispatcher and the SQL Editor don't). Messages
-- start with a word the app logs ("limit"), never with content.
create or replace function private.scheduled_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- Sent, dropped or being sent: kept as it is, so a plan uploaded late can't send it twice.
  if tg_op = 'UPDATE' and old.status <> 'pending' then
    return null;
  end if;
  new.status := 'pending';
  new.done_at := null;
  new.created_at := case when tg_op = 'UPDATE' then old.created_at else now() end;
  if new.fire_at > now() + private.plan_ahead_max() then
    raise exception 'limit: planned over % ahead', private.plan_ahead_max() using errcode = '54000';
  end if;
  if new.fire_at < now() - private.stale_after() then
    raise exception 'limit: planned in the past' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists scheduled_guard on public.scheduled_notifications;
create trigger scheduled_guard before insert or update on public.scheduled_notifications
  for each row execute function private.scheduled_guard();

-- N-5, once per write as in 0004: an upload of 100 rows counts each user once.
create or replace function private.scheduled_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select distinct user_id from new_rows loop
    if (select count(*) from public.scheduled_notifications s where s.user_id = r.user_id and s.status = 'pending')
       > private.pending_max() then
      raise exception 'limit: over % planned notifications', private.pending_max() using errcode = '54000';
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists scheduled_count on public.scheduled_notifications;
create trigger scheduled_count after insert on public.scheduled_notifications
  referencing new table as new_rows
  for each statement execute function private.scheduled_count();

-- A new subscription (another phone, or the browser renewed it) can't read pushes encrypted for the old
-- one: they go, and the phone plans again for the new keys.
create or replace function private.subscription_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if (new.endpoint, new.p256dh, new.auth) is not distinct from (old.endpoint, old.p256dh, old.auth) then
      return new;
    end if;
  end if;
  delete from public.scheduled_notifications s
  where s.user_id = coalesce(old.user_id, new.user_id) and s.status = 'pending';
  return coalesce(new, old);
end $$;

drop trigger if exists subscription_changed on public.push_subscriptions;
create trigger subscription_changed before update or delete on public.push_subscriptions
  for each row execute function private.subscription_changed();

-- ——— the dispatcher (supabase/functions/dispatch) ———

-- Picks what's due, at most `batch`, and marks it 'sending'. On the way: drops what's too late (N-9) or
-- was encrypted for a subscription that's gone, holds back what's past the fuse (N-8), and during the
-- shadow period only logs pushes for everyone but the owner and `push_beta`. A row claimed by a run that
-- never finished is failed after 5 minutes, not sent again: it may have gone out.
create or replace function private.dispatch_claim(batch integer)
returns table (user_id uuid, id text, kind text, payload text, endpoint text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  cfg private.push_config;
  r record;
begin
  select * into cfg from private.push_config c where c.only_row;
  if not found or cfg.mode = 'off' then
    return;
  end if;

  with lost as (
    update public.scheduled_notifications s set status = 'failed', done_at = now()
    where s.status = 'sending' and s.done_at < now() - interval '5 minutes'
    returning s.user_id, s.kind, s.fire_at
  )
  insert into private.send_log (user_id, kind, fire_at, status, reason)
  select l.user_id, l.kind, l.fire_at, 'failed', 'lost' from lost l;

  with late as (
    update public.scheduled_notifications s set status = 'skipped', done_at = now()
    where s.status = 'pending' and s.fire_at < now() - private.stale_after()
    returning s.user_id, s.kind, s.fire_at
  )
  insert into private.send_log (user_id, kind, fire_at, status, reason)
  select l.user_id, l.kind, l.fire_at, 'skipped', 'late' from late l;

  with orphan as (
    update public.scheduled_notifications s set status = 'skipped', done_at = now()
    where s.status = 'pending' and s.fire_at <= now()
      and not exists (select 1 from public.push_subscriptions p where p.user_id = s.user_id and p.p256dh = s.sub_key)
    returning s.user_id, s.kind, s.fire_at
  )
  insert into private.send_log (user_id, kind, fire_at, status, reason)
  select o.user_id, o.kind, o.fire_at, 'skipped', 'old-subscription' from orphan o;

  for r in
    select s.user_id, s.id, s.kind, s.fire_at, s.payload, p.endpoint
    from public.scheduled_notifications s
    join public.push_subscriptions p on p.user_id = s.user_id and p.p256dh = s.sub_key
    where s.status = 'pending' and s.fire_at <= now()
    order by s.fire_at, s.id
    limit batch
    for update of s skip locked
  loop
    if (select count(*) from private.send_log l where l.user_id = r.user_id and l.status = 'sent' and l.at > now() - interval '1 day')
       + (select count(*) from public.scheduled_notifications s where s.user_id = r.user_id and s.status = 'sending')
       >= private.fuse_max() then
      update public.scheduled_notifications s set status = 'skipped', done_at = now() where s.user_id = r.user_id and s.id = r.id;
      insert into private.send_log (user_id, kind, fire_at, status, reason) values (r.user_id, r.kind, r.fire_at, 'skipped', 'fuse');
    elsif cfg.mode = 'shadow' and not private.push_live(r.user_id) then
      update public.scheduled_notifications s set status = 'skipped', done_at = now() where s.user_id = r.user_id and s.id = r.id;
      insert into private.send_log (user_id, kind, fire_at, status, reason) values (r.user_id, r.kind, r.fire_at, 'skipped', 'shadow');
    else
      update public.scheduled_notifications s set status = 'sending', done_at = now() where s.user_id = r.user_id and s.id = r.id;
      user_id := r.user_id;
      id := r.id;
      kind := r.kind;
      payload := r.payload;
      endpoint := r.endpoint;
      return next;
    end if;
  end loop;
end $$;

-- The owner's push for each request confirmed since the last run (spec AC-5): the email and the owner's
-- subscription, for the dispatcher to encrypt. Not planned by a phone. Past the fuse, or too late, it's
-- dropped; with the kill switch on, requests pass without a push.
create or replace function private.dispatch_requests()
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text, lang text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  cfg private.push_config;
  owner uuid := private.owner_id();
  sub public.push_subscriptions;
  sent integer;
  r record;
begin
  select * into cfg from private.push_config c where c.only_row for update;
  if not found then
    return;
  end if;
  update private.push_config c set requests_seen_at = now() where c.only_row;
  if cfg.mode = 'off' or owner is null then
    return;
  end if;
  select * into sub from public.push_subscriptions p where p.user_id = owner;
  if not found then
    return;
  end if;
  sent := (select count(*) from private.send_log l where l.user_id = owner and l.status = 'sent' and l.at > now() - interval '1 day');
  for r in
    select u.email::text as email
    from auth.users u
    where u.email_confirmed_at > greatest(cfg.requests_seen_at, now() - private.stale_after())
      and u.email_confirmed_at <= now()
      and u.id <> owner
      and not exists (select 1 from public.members m where m.user_id = u.id)
    order by u.email_confirmed_at
  loop
    if sent >= private.fuse_max() then
      insert into private.send_log (user_id, kind, status, reason) values (owner, 'request', 'skipped', 'fuse');
    else
      sent := sent + 1;
      user_id := owner;
      email := r.email;
      endpoint := sub.endpoint;
      p256dh := sub.p256dh;
      auth := sub.auth;
      lang := sub.lang;
      return next;
    end if;
  end loop;
end $$;

-- What became of each push the dispatcher sent: [{ user_id, id (null for a request), kind, endpoint,
-- result: 'sent' | 'gone' | 'failed', code }]. A subscription the push service calls gone is deleted
-- (spec NO-27); the phone subscribes again when it next opens.
create or replace function private.dispatch_done(results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  fired timestamptz;
  why text;
begin
  for r in
    select * from jsonb_to_recordset(results) as x(user_id uuid, id text, kind text, endpoint text, result text, code integer)
  loop
    why := case r.result when 'sent' then null when 'gone' then 'gone'
             else coalesce('http ' || r.code, 'network') end;
    fired := null;
    if r.id is not null then
      update public.scheduled_notifications s
      set status = case when r.result = 'sent' then 'sent' else 'failed' end, done_at = now()
      where s.user_id = r.user_id and s.id = r.id and s.status = 'sending'
      returning s.fire_at into fired;
    end if;
    insert into private.send_log (user_id, kind, fire_at, status, reason)
    values (r.user_id, left(r.kind, 20), fired, case when r.result = 'sent' then 'sent' else 'failed' end, why);
    if r.result = 'gone' then
      delete from public.push_subscriptions p where p.user_id = r.user_id and p.endpoint = r.endpoint;
    elsif r.result = 'sent' then
      update public.push_subscriptions p set last_sent_at = now(), last_error = null
      where p.user_id = r.user_id and p.endpoint = r.endpoint;
    else
      update public.push_subscriptions p set last_error = left(now()::text || ' ' || why, 200)
      where p.user_id = r.user_id and p.endpoint = r.endpoint;
    end if;
  end loop;
end $$;

-- Only the dispatcher (connected as the database owner) and the triggers run these.
revoke all on function private.pending_max(), private.plan_ahead_max(), private.stale_after(), private.fuse_max(),
  private.send_log_keep(), private.owner_id(), private.push_live(uuid), private.scheduled_guard(),
  private.scheduled_count(), private.subscription_changed(), private.dispatch_claim(integer),
  private.dispatch_requests(), private.dispatch_done(jsonb)
  from public, anon, authenticated;

-- ——— purge: the send log after N-21, finished rows after two days ———

-- 0004's purge, with the push tables added.
create or replace function private.purge() returns void
language sql security definer set search_path = '' as $$
  delete from public.records where deleted and updated_at < now() - private.purge_after();
  delete from private.daily_rows where day < (now() at time zone 'utc')::date - 30;
  delete from private.send_log where at < now() - private.send_log_keep();
  delete from public.scheduled_notifications where status <> 'pending' and done_at < now() - interval '2 days';
$$;
revoke all on function private.purge() from public, anon, authenticated;

-- ——— every minute ———

-- The secret the cron job sends and the dispatch function checks (spec SE-6). Made here, kept in Vault,
-- never copied anywhere. The function's address is the one thing set by hand (see the S5 setup steps):
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/dispatch', 'dispatch_url');
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dispatch_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'dispatch_secret', 'Smart Meta: sent by the dispatch cron job, checked by the dispatch function');
  end if;
end $$;

create extension if not exists pg_net;
-- Without `dispatch_url` in Vault it does nothing.
select cron.schedule('smart-meta-dispatch', '* * * * *', $job$
  select net.http_post(
    url := u.decrypted_secret,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000)
  from vault.decrypted_secrets u, vault.decrypted_secrets s
  where u.name = 'dispatch_url' and s.name = 'dispatch_secret'
$job$);
