-- ============================================================================
--  The day's figures, now that a pump sells three fuels in two units and takes
--  money four ways.
--
--  Sales are still counted once: every litre and every kilogram that left a
--  nozzle or a dispenser. Credit slips remain the slice of that which went out
--  on udhaar, never an addition to it. BPCL card joins cash, ATM and UPI on
--  the collections side — it is paid for, just not by the person at the pump.
-- ============================================================================

create or replace function day_summary(p_date date)
  returns jsonb language sql stable as $fn$
with liquid as (
  select coalesce(sum(nr.amount), 0) amt, coalesce(sum(nr.litres), 0) ltr
    from nozzle_readings nr
    join shifts s on s.id = nr.shift_id
   where s.business_date = p_date and s.station_id = auth_station_id()
),
gas as (
  select coalesce(sum(cr.amount), 0) amt, coalesce(sum(cr.kg), 0) kg
    from cng_readings cr
    join shifts s on s.id = cr.shift_id
   where s.business_date = p_date and s.station_id = auth_station_id()
),
credit as (
  select coalesce(sum(amount), 0) amt
    from credit_sales
   where business_date = p_date and station_id = auth_station_id()
),
coll as (
  select coalesce(sum(c.cash_amount), 0) cash,
         coalesce(sum(c.upi_amount), 0)  upi,
         coalesce(sum(c.card_amount), 0) card,
         coalesce(sum(c.bpcl_amount), 0) bpcl
    from shift_collections c
    join shifts s on s.id = c.shift_id
   where s.business_date = p_date and s.station_id = auth_station_id()
),
recv as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from payments
   where payment_date = p_date and station_id = auth_station_id()
),
exp as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from expenses
   where business_date = p_date and station_id = auth_station_id()
),
pay as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from staff_payments
   where payment_date = p_date and station_id = auth_station_id()
),
dep as (
  select coalesce(sum(amount), 0) amt
    from bank_deposits
   where deposit_date = p_date and station_id = auth_station_id()
),
closing as (
  select opening_cash, counted_cash, status, notes, owner_remarks
    from day_closings
   where business_date = p_date and station_id = auth_station_id()
)
select jsonb_build_object(
  'date',              p_date,
  'litres_sold',       liquid.ltr,
  'kg_sold',           gas.kg,
  'liquid_sales',      liquid.amt,
  'cng_sales',         gas.amt,
  'meter_sales',       liquid.amt + gas.amt,
  'credit_sales',      credit.amt,
  'counter_sales',     liquid.amt + gas.amt - credit.amt,
  'collected_cash',    coll.cash,
  'collected_upi',     coll.upi,
  'collected_card',    coll.card,
  'collected_bpcl',    coll.bpcl,
  'collected_total',   coll.cash + coll.upi + coll.card + coll.bpcl,
  -- positive means the fillers handed over less than the meters say they owed
  'collection_short',  (liquid.amt + gas.amt - credit.amt)
                         - (coll.cash + coll.upi + coll.card + coll.bpcl),
  'customer_receipts', recv.total,
  'receipts_cash',     recv.cash,
  'expenses',          exp.total,
  'expenses_cash',     exp.cash,
  'staff_paid',        pay.total,
  'staff_paid_cash',   pay.cash,
  'deposited',         dep.amt,
  'opening_cash',      coalesce(closing.opening_cash, 0),
  'counted_cash',      closing.counted_cash,
  -- Only cash reaches the box. ATM, UPI and BPCL settle to the bank.
  'expected_cash',     coalesce(closing.opening_cash, 0) + coll.cash + recv.cash
                         - exp.cash - pay.cash - dep.amt,
  'status',            coalesce(closing.status::text, 'draft'),
  'notes',             closing.notes,
  'owner_remarks',     closing.owner_remarks
)
from liquid, gas, credit, coll, recv, exp, pay, dep
left join closing on true
$fn$;

-- ------------------------------------------------------- reporting --------
-- Both gain a column, and Postgres will not change a function's return type
-- in place, so the old shapes are dropped first.
drop function if exists sales_by_day(date, date);
drop function if exists sales_by_fuel(date, date);

create function sales_by_day(p_from date, p_to date)
  returns table (
    business_date date,
    litres_sold   numeric,
    kg_sold       numeric,
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
    coalesce(g.kg, 0),
    coalesce(s.amt, 0) + coalesce(g.amt, 0),
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
    select sum(cr.kg) kg, sum(cr.amount) amt
      from cng_readings cr join shifts sh on sh.id = cr.shift_id
     where sh.business_date = d::date and sh.station_id = auth_station_id()
  ) g on true
  left join lateral (
    select sum(amount) amt from credit_sales
     where business_date = d::date and station_id = auth_station_id()
  ) c on true
  left join lateral (
    select sum(sc.cash_amount + sc.upi_amount + sc.card_amount + sc.bpcl_amount) amt
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

-- Per fuel, in whatever that fuel is measured in.
create function sales_by_fuel(p_from date, p_to date)
  returns table (
    fuel_type_id uuid,
    fuel_name    text,
    unit         text,
    quantity     numeric,
    sales_value  numeric,
    avg_rate     numeric
  )
  language sql stable as $fn$
  with sold as (
    select n.fuel_type_id, nr.litres qty, nr.amount amt
      from nozzle_readings nr
      join nozzles n  on n.id = nr.nozzle_id
      join shifts sh  on sh.id = nr.shift_id
     where sh.business_date between p_from and p_to
       and sh.station_id = auth_station_id()
    union all
    select d.fuel_type_id, cr.kg qty, cr.amount amt
      from cng_readings cr
      join cng_dispensers d on d.id = cr.dispenser_id
      join shifts sh        on sh.id = cr.shift_id
     where sh.business_date between p_from and p_to
       and sh.station_id = auth_station_id()
  )
  select
    ft.id, ft.name, ft.unit,
    coalesce(sum(sold.qty), 0),
    coalesce(sum(sold.amt), 0),
    case when coalesce(sum(sold.qty), 0) > 0
         then round(sum(sold.amt) / sum(sold.qty), 3) end
  from fuel_types ft
  left join sold on sold.fuel_type_id = ft.id
  where ft.station_id = auth_station_id()
  group by ft.id, ft.name, ft.unit, ft.sort_order
  order by ft.sort_order
$fn$;

grant execute on function day_summary, sales_by_day, sales_by_fuel to authenticated;
