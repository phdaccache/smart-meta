-- Smart Meta: push controls for the app (stage S5 of docs/notifications, part 3).
-- The kill switch from the phone (an owner-only row in Developer), and the app's beta flag: whether this
-- account is in the rollout, so Settings → Notifications shows only to accounts the server sends to.
-- Every function checks who calls it; nothing is granted to `anon` (spec SE-1).

-- What the app may know about pushes: the mode (0006: 'off' is the kill switch, 'shadow' sends only to the
-- owner and private.push_beta, 'on' to everyone), whether this account is in the rollout, and whether it's
-- the owner's. In the rollout: a member, unless the shadow period leaves them out. The kill switch doesn't
-- take anyone out: their settings stay, and pushes start again when it's turned back on.
create or replace function private.push_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mode', c.mode,
    'live', private.is_member() and (c.mode <> 'shadow' or private.push_live(auth.uid())),
    'owner', private.is_owner())
  from private.push_config c
$$;

-- Developer → Pushes, for the owner only (the same check as approving a request).
create or replace function private.set_push_mode(new_mode text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can change this' using errcode = '42501';
  end if;
  if new_mode is null or new_mode not in ('off', 'shadow', 'on') then
    raise exception 'no such mode' using errcode = '22023';
  end if;
  update private.push_config set mode = new_mode;
  return new_mode;
end $$;

-- The API: one wrapper per function, as in 0002.
create or replace function public.push_status() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.push_status() $$;
create or replace function public.set_push_mode(new_mode text) returns text
language sql security invoker set search_path = '' as $$ select private.set_push_mode(new_mode) $$;

revoke all on function private.push_status(), private.set_push_mode(text) from public, anon;
grant execute on function private.push_status(), private.set_push_mode(text) to authenticated;
revoke all on function public.push_status(), public.set_push_mode(text) from public, anon;
grant execute on function public.push_status(), public.set_push_mode(text) to authenticated;
