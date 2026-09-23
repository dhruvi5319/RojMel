-- ============================================================================
--  How long the fuel lasts, and how the tankers actually come.
--
--  Stock was shown as a percentage of the tank, and the dashboard warned below
--  twenty per cent. But twenty per cent of a diesel tank and twenty per cent of
--  a petrol tank are very different amounts of trading, and neither says the
--  thing the owner needs: is there enough to get to the next tanker.
--
--  Tankers come sixteen or seventeen times a month, when the tanks need them
--  and not on a calendar — so the answer is days of cover at what this pump has
--  actually been selling, and the rhythm the tankers have been arriving in.
--
--  No cost anywhere in here: the manager checks the day against stock, so she
--  reads all of it.
-- ============================================================================

-- ------------------------------------------------- how long the tank lasts --
create or replace view v_tank_cover with (security_invoker = true) as
with sold_per_day as (
  -- Only days that traded. Averaging in the days the pump was shut would make
  -- the fuel look like it lasts longer than it does.
  select n.tank_id, sh.business_date, sum(nr.litres) as litres
    from nozzle_readings nr
    join nozzles n  on n.id = nr.nozzle_id
    join shifts  sh on sh.id = nr.shift_id
   where sh.business_date > pump_day() - 15
     and sh.business_date <= pump_day()
   group by n.tank_id, sh.business_date
  having sum(nr.litres) > 0
),
rate as (
  select tank_id, avg(litres) as per_day, count(*)::int as days_counted
    from sold_per_day group by tank_id
),
last_in as (
  select tank_id, max(delivery_date) as last_delivery
    from fuel_purchases group by tank_id
)
select
  ts.tank_id,
  ts.station_id,
  ts.name,
  ts.fuel_type_id,
  ts.fuel_name,
  ts.capacity_litres,
  ts.book_stock_litres,
  ts.last_dip_litres,
  ts.last_dip_date,
  ts.last_dip_variance,
  round(coalesce(r.per_day, 0), 2)                     as litres_per_day,
  coalesce(r.days_counted, 0)                          as days_counted,
  -- Null where the pump has not sold any of this fuel lately: no rate, no
  -- honest answer, and a made-up one would be worse than none.
  case when coalesce(r.per_day, 0) > 0
       then round(ts.book_stock_litres / r.per_day, 1) end as days_left,
  case when coalesce(r.per_day, 0) > 0
       then (pump_day() + (ts.book_stock_litres / r.per_day)::int) end as runs_out_on,
  l.last_delivery,
  case when l.last_delivery is not null
       then (pump_day() - l.last_delivery) end         as days_since_delivery
from v_tank_stock ts
left join rate r    on r.tank_id = ts.tank_id
left join last_in l on l.tank_id = ts.tank_id;

revoke insert, update, delete on v_tank_cover from authenticated;
grant select on v_tank_cover to authenticated;

comment on view v_tank_cover is
  'Days of cover at what this pump has actually been selling, rather than a '
  'percentage of a tank. Null days_left where nothing has sold lately.';

-- ------------------------------------------------ how the tankers arrive ----
create or replace view v_fuel_supply with (security_invoker = true) as
with trips as (
  -- One row per tanker per fuel: a trip that filled two tanks of the same
  -- fuel is one arrival, not two.
  select
    fp.station_id,
    t.fuel_type_id,
    fp.delivery_date,
    sum(fp.litres) as litres
  from fuel_purchases fp
  join tanks t on t.id = fp.tank_id
  group by fp.station_id, t.fuel_type_id, fp.delivery_date
),
gaps as (
  select
    station_id,
    fuel_type_id,
    delivery_date,
    litres,
    delivery_date - lag(delivery_date) over (
      partition by station_id, fuel_type_id order by delivery_date) as gap_days
  from trips
)
select
  g.station_id,
  g.fuel_type_id,
  ft.name                                                as fuel_name,
  count(*) filter (
    where g.delivery_date >= date_trunc('month', pump_day())::date)::int as trips_this_month,
  sum(g.litres) filter (
    where g.delivery_date >= date_trunc('month', pump_day())::date)      as litres_this_month,
  max(g.delivery_date)                                   as last_delivery,
  round(avg(g.gap_days) filter (where g.gap_days is not null), 1) as usual_gap_days,
  max(g.gap_days)                                        as longest_gap_days
from gaps g
join fuel_types ft on ft.id = g.fuel_type_id
group by g.station_id, g.fuel_type_id, ft.name;

revoke insert, update, delete on v_fuel_supply from authenticated;
grant select on v_fuel_supply to authenticated;

comment on view v_fuel_supply is
  'The rhythm the tankers actually arrive in — how many this month, how long '
  'between them, and when the last one came. There is no schedule to compare '
  'against; there is only the rhythm.';
