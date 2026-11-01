-- Smart Meta: owner tools for the shadow period (stage S5 of docs/notifications, part 3).
-- 1. Developer → Requests: the owner adds and removes members from the shadow beta (`private.push_beta`,
--    0006) from the app, instead of the SQL Editor.
-- 2. The owner's own account has no daily fuse (N-8), so testing can't run out of pushes (owner,
--    2026-10-31). Everyone else keeps it. The two dispatch functions are 0006's, with only that changed.
-- Every function checks who calls it; nothing is granted to `anon` (spec SE-1).

-- ——— the shadow beta, from Developer → Requests ———

-- Who is in it (members' ids), for the owner only.
create or replace function private.push_beta_members() returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can see this' using errcode = '42501';
  end if;
  return query select b.user_id from private.push_beta b;
end $$;

-- In or out, for a member only (the owner always gets pushes).
create or replace function private.set_push_beta(member uuid, beta boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can change this' using errcode = '42501';
  end if;
  if member is null or beta is null then
    raise exception 'missing member' using errcode = '22023';
  end if;
  if beta then
    if not exists (select 1 from public.members m where m.user_id = member) then
      raise exception 'not a member' using errcode = 'P0001';
    end if;
    insert into private.push_beta (user_id) values (member) on conflict do nothing;
  else
    delete from private.push_beta b where b.user_id = member;
  end if;
end $$;

create or replace function public.push_beta_members() returns setof uuid
language sql stable security invoker set search_path = '' as $$ select * from private.push_beta_members() $$;
create or replace function public.set_push_beta(member uuid, beta boolean) returns void
language sql security invoker set search_path = '' as $$ select private.set_push_beta(member, beta) $$;

revoke all on function private.push_beta_members(), private.set_push_beta(uuid, boolean) from public, anon;
grant execute on function private.push_beta_members(), private.set_push_beta(uuid, boolean) to authenticated;
revoke all on function public.push_beta_members(), public.set_push_beta(uuid, boolean) from public, anon;
grant execute on function public.push_beta_members(), public.set_push_beta(uuid, boolean) to authenticated;

-- ——— no fuse for the owner ———

create or replace function private.dispatch_claim(batch integer)
returns table (user_id uuid, id text, kind text, payload text, endpoint text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  cfg private.push_config;
  owner uuid := private.owner_id();
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
    if r.user_id is distinct from owner
       and (select count(*) from private.send_log l where l.user_id = r.user_id and l.status = 'sent' and l.at > now() - interval '1 day')
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

create or replace function private.dispatch_requests()
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text, lang text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  cfg private.push_config;
  owner uuid := private.owner_id();
  sub public.push_subscriptions;
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
  for r in
    select u.email::text as email
    from auth.users u
    where u.email_confirmed_at > greatest(cfg.requests_seen_at, now() - private.stale_after())
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
