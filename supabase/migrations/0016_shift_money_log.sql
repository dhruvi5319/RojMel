-- ============================================================================
--  The money log: what the manager writes in the book, every shift.
--
--  For each shift, and for each fuel, the meter says how much left the pump:
--
--      (closing − opening − test) × that day's rate = what was sold
--
--  And the money has to arrive in one of five ways:
--
--      cash + ATM + UPI + BPCL card + udhaar = what was accounted for
--
--  Those two totals must agree. When they do not, the difference belongs to
--  that shift — not to the day — because that is the shift whose filler has to
--  explain it. So it is recorded against the shift and survives the day close.
-- ============================================================================

alter table shifts
  add column if not exists variance_amount numeric(14,2),
  add column if not exists variance_note   text,
  add column if not exists variance_by     uuid references profiles(id),
  add column if not exists variance_at     timestamptz;

comment on column shifts.variance_amount is
  'Sold minus accounted for, as agreed when the shift was closed. Positive
   means the money was short of what the meters say left the pump.';

-- ------------------------------------------- what each fuel sold, by shift --
create or replace view v_shift_fuel_sales with (security_invoker = true) as
with sold as (
  -- litres through the nozzles
  select
    nr.shift_id,
    n.fuel_type_id,
    nr.opening_reading,
    nr.closing_reading,
    nr.test_litres   as test_quantity,
    nr.litres        as quantity,
    nr.sale_rate,
    nr.amount,
    n.name           as meter_name
  from nozzle_readings nr
  join nozzles n on n.id = nr.nozzle_id
  union all
  -- kilograms through the CNG dispensers
  select
    cr.shift_id,
    d.fuel_type_id,
    cr.opening_reading,
    cr.closing_reading,
    cr.test_kg,
    cr.kg,
    cr.sale_rate,
    cr.amount,
    d.name
  from cng_readings cr
  join cng_dispensers d on d.id = cr.dispenser_id
)
select
  sold.shift_id,
  s.station_id,
  s.business_date,
  sold.fuel_type_id,
  ft.name    as fuel_name,
  ft.name_gu as fuel_name_gu,
  ft.unit,
  ft.sort_order,
  count(*)                          as meters,
  sum(sold.quantity)                as quantity,
  sum(sold.test_quantity)           as test_quantity,
  sum(sold.amount)                  as amount,
  -- The rate the sale was actually priced at. More than one distinct rate for
  -- one fuel in one shift is worth seeing, not hiding.
  max(sold.sale_rate)               as sale_rate,
  count(distinct sold.sale_rate) > 1 as rates_differ
from sold
join shifts s     on s.id = sold.shift_id
join fuel_types ft on ft.id = sold.fuel_type_id
group by sold.shift_id, s.station_id, s.business_date, sold.fuel_type_id,
         ft.name, ft.name_gu, ft.unit, ft.sort_order;

-- ------------------------------------------ the two totals, side by side ---
create or replace view v_shift_money with (security_invoker = true) as
select
  s.id                as shift_id,
  s.station_id,
  s.business_date,
  s.name,
  s.sort_order,
  s.status,
  s.variance_amount,
  s.variance_note,

  coalesce(sale.amount, 0)      as total_sale,
  coalesce(sale.litres, 0)      as litres_sold,
  coalesce(sale.kg, 0)          as kg_sold,

  coalesce(c.cash, 0)           as cash,
  coalesce(c.card, 0)           as card,
  coalesce(c.upi, 0)            as upi,
  coalesce(c.bpcl, 0)           as bpcl,
  coalesce(u.udhaar, 0)         as udhaar,

  coalesce(c.cash, 0) + coalesce(c.card, 0) + coalesce(c.upi, 0)
    + coalesce(c.bpcl, 0) + coalesce(u.udhaar, 0)  as accounted,

  -- Positive means the money is short of what the meters say left the pump.
  coalesce(sale.amount, 0)
    - (coalesce(c.cash, 0) + coalesce(c.card, 0) + coalesce(c.upi, 0)
       + coalesce(c.bpcl, 0) + coalesce(u.udhaar, 0))  as difference
from shifts s
left join lateral (
  select sum(amount) amount,
         sum(case when unit = 'L'  then quantity else 0 end) litres,
         sum(case when unit = 'kg' then quantity else 0 end) kg
    from v_shift_fuel_sales f where f.shift_id = s.id
) sale on true
left join lateral (
  select sum(cash_amount) cash, sum(card_amount) card,
         sum(upi_amount) upi,   sum(bpcl_amount) bpcl
    from shift_collections sc where sc.shift_id = s.id
) c on true
left join lateral (
  select sum(amount) udhaar from credit_sales cs where cs.shift_id = s.id
) u on true;

revoke insert, update, delete on v_shift_fuel_sales, v_shift_money from authenticated;

-- ------------------------------------------- agreeing the difference -------
-- Writes the shift's own difference down, with whatever the manager says about
-- it. Recomputed from the views so the stored figure can never drift from the
-- readings it came from.
create or replace function record_shift_variance(p_shift_id uuid, p_note text default null)
  returns numeric language plpgsql as $fn$
declare v_diff numeric(14,2);
begin
  if not is_back_office() then raise exception 'Not allowed'; end if;

  select difference into v_diff
    from v_shift_money where shift_id = p_shift_id;

  if v_diff is null then
    raise exception 'No such shift';
  end if;

  update shifts
     set variance_amount = v_diff,
         variance_note   = p_note,
         variance_by     = auth.uid(),
         variance_at     = now()
   where id = p_shift_id and station_id = auth_station_id();

  return v_diff;
end
$fn$;

grant execute on function record_shift_variance to authenticated;
