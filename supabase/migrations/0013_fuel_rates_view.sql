-- ============================================================================
--  Today's rate, in one row per fuel.
--
--  Pump prices move daily, so setting the rate is a daily job, not a settings
--  job. This view is what the Today screen reads: the rate in force now, when
--  it was set, and whether that was today — so the app can tell someone the
--  rate is still yesterday's before a single litre is sold at it.
-- ============================================================================

create or replace view v_fuel_rates with (security_invoker = true) as
select
  ft.id          as fuel_type_id,
  ft.station_id,
  ft.name,
  ft.name_gu,
  ft.unit,
  ft.sort_order,
  ft.color,
  p.sale_rate,
  p.effective_from,
  -- Was this rate set for today's business day?
  (p.effective_from >= (now() at time zone 'Asia/Kolkata')::date)
    as set_today
from fuel_types ft
left join lateral (
  select sale_rate, effective_from
    from fuel_prices
   where fuel_type_id = ft.id
     and effective_from <= now()
   order by effective_from desc
   limit 1
) p on true
where ft.is_active;

revoke insert, update, delete on v_fuel_rates from authenticated;
