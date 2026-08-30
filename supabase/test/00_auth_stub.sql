-- Local-only stand-in for the parts of Supabase's auth schema the migrations
-- touch, so the schema can be tested without a Supabase instance.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Supabase grants these on a real project; the stub has to do it itself.
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
