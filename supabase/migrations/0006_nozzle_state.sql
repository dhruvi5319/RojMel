-- ============================================================================
--  Everything the shift-entry screen needs about a nozzle in one row:
--  which fuel, today's rate, and where the meter was left last time — so the
--  opening reading fills itself in and nobody re-types it wrongly.
-- ============================================================================

create or replace view v_nozzle_state with (security_invoker = true) as
select
  n.id            as nozzle_id,
  n.station_id,
  n.name,
  n.sort_order,
  n.tank_id,
  t.name          as tank_name,
  n.fuel_type_id,
  ft.name         as fuel_name,
  ft.name_gu      as fuel_name_gu,
  ft.color        as fuel_color,
  current_rate(n.fuel_type_id)        as sale_rate,
  coalesce(lr.closing_reading, 0)     as last_closing,
  lr.business_date                    as last_reading_date
from nozzles n
join fuel_types ft on ft.id = n.fuel_type_id
join tanks t       on t.id = n.tank_id
left join lateral (
  select nr.closing_reading, s.business_date
    from nozzle_readings nr
    join shifts s on s.id = nr.shift_id
   where nr.nozzle_id = n.id
   order by s.business_date desc, s.sort_order desc, nr.created_at desc
   limit 1
) lr on true
where n.is_active;

revoke insert, update, delete on v_nozzle_state from authenticated;
