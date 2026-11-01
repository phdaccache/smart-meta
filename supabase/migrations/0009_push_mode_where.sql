-- Smart Meta: Developer → Pushes could not change the mode (stage S5 of docs/notifications, part 3).
-- Supabase's API refuses an UPDATE with no WHERE clause ("UPDATE requires a WHERE clause"), even on
-- push_config's single row, so 0008's set_push_mode failed from the app. Only that line changes.

create or replace function private.set_push_mode(new_mode text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then
    raise exception 'only the owner can change this' using errcode = '42501';
  end if;
  if new_mode is null or new_mode not in ('off', 'shadow', 'on') then
    raise exception 'no such mode' using errcode = '22023';
  end if;
  update private.push_config set mode = new_mode where only_row;
  return new_mode;
end $$;

revoke all on function private.set_push_mode(text) from public, anon;
grant execute on function private.set_push_mode(text) to authenticated;
