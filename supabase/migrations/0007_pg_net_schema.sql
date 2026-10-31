-- Smart Meta: moves `pg_net` out of `public` (stage S5). The first copy of 0006 installed it there, and
-- Security Advisor asks for extensions to live elsewhere (lint 0014). pg_net can't be moved, so it's
-- dropped and made again in `extensions`; its functions stay in `net`, which the cron job calls by name.
-- Pending HTTP calls and their logged responses go with it, which costs nothing: the next minute's call
-- comes anyway. Does nothing where pg_net is already outside `public` (a project that ran 0006 as it is now).

do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
