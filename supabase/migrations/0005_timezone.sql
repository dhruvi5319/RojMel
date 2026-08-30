-- ============================================================================
--  The pump keeps Indian time. Postgres on Supabase defaults to UTC, which
--  would make current_date roll over at 5:30 in the morning IST — so a night
--  shift and the first hours of trading would land on the wrong business day.
-- ============================================================================

do $do$
declare db text := current_database();
begin
  execute format('alter database %I set timezone to %L', db, 'Asia/Kolkata');
end
$do$;

alter role authenticated set timezone to 'Asia/Kolkata';

-- The business day the pump is currently trading in.
create or replace function today_ist() returns date
  language sql stable as $fn$
  select (now() at time zone 'Asia/Kolkata')::date
$fn$;

grant execute on function today_ist to authenticated;
