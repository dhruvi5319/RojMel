-- ============================================================================
--  Reporting aggregates. Sales figures are open to the back office; anything
--  that reveals buying cost stays in margin_report(), which is owner-only.
-- ============================================================================

create or replace function sales_by_day(p_from date, p_to date)
  returns table (
    business_date date,
    litres_sold   numeric,
    meter_sales   numeric,
    credit_sales  numeric,
    collected     numeric,
    expenses      numeric,
    deposited     numeric
  )
  language sql stable as $fn$
  select
    d::date,
    coalesce(s.ltr, 0),
    coalesce(s.amt, 0),
    coalesce(c.amt, 0),
    coalesce(k.amt, 0),
    coalesce(e.amt, 0),
    coalesce(b.amt, 0)
  from generate_series(p_from, p_to, interval '1 day') d
  left join lateral (
    select sum(nr.litres) ltr, sum(nr.amount) amt
      from nozzle_readings nr join shifts sh on sh.id = nr.shift_id
     where sh.business_date = d::date and sh.station_id = auth_station_id()
  ) s on true
  left join lateral (
    select sum(amount) amt from credit_sales
     where business_date = d::date and station_id = auth_station_id()
  ) c on true
  left join lateral (
    select sum(sc.cash_amount + sc.upi_amount + sc.card_amount) amt
      from shift_collections sc join shifts sh on sh.id = sc.shift_id
     where sh.business_date = d::date and sh.station_id = auth_station_id()
  ) k on true
  left join lateral (
    select sum(amount) amt from expenses
     where business_date = d::date and station_id = auth_station_id()
  ) e on true
  left join lateral (
    select sum(amount) amt from bank_deposits
     where deposit_date = d::date and station_id = auth_station_id()
  ) b on true
  order by d
$fn$;

create or replace function sales_by_fuel(p_from date, p_to date)
  returns table (
    fuel_type_id uuid,
    fuel_name    text,
    litres_sold  numeric,
    sales_value  numeric,
    avg_rate     numeric
  )
  language sql stable as $fn$
  select
    ft.id,
    ft.name,
    coalesce(sum(nr.litres), 0),
    coalesce(sum(nr.amount), 0),
    case when coalesce(sum(nr.litres), 0) > 0
         then round(sum(nr.amount) / sum(nr.litres), 3) end
  from fuel_types ft
  left join nozzles n       on n.fuel_type_id = ft.id
  left join nozzle_readings nr on nr.nozzle_id = n.id
  left join shifts sh       on sh.id = nr.shift_id
                           and sh.business_date between p_from and p_to
  where ft.station_id = auth_station_id()
    and (nr.id is null or sh.id is not null)
  group by ft.id, ft.name, ft.sort_order
  order by ft.sort_order
$fn$;

grant execute on function sales_by_day, sales_by_fuel to authenticated;
