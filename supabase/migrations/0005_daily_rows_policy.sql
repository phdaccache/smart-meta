-- Smart Meta: says outright that nobody reaches `private.daily_rows` through the API (stage S4).
-- It already couldn't (no grants, schema not exposed); Security Advisor asks for the policy to be written
-- down, as `members` does in 0002. The limits and the purge write it as its owner, which RLS doesn't stop.

drop policy if exists "not through the API" on private.daily_rows;
create policy "not through the API" on private.daily_rows for all to authenticated using (false) with check (false);
