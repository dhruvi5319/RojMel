-- ============================================================================
--  What the fuel that was SOLD cost — not what this month's tankers cost.
--
--  margin_report() compared two different things: the litres that went out in
--  a window, and the litres that arrived in it. Tankers come when the tanks
--  need them — sixteen or seventeen a month, on no schedule — so the two are
--  never the same. A month that happened to catch two extra loads read as a
--  catastrophic loss; a single day with a tanker in it was worse, and a day
--  without one showed no margin at all, because litres_bought was zero.
--
--  The fix is the ordinary one: carry a running cost per fuel, moved each time
--  a tanker is decanted, and value the litres sold at the cost of the stock
--  they came out of.
--
--      new cost = (stock on hand x old cost + litres in x rate paid)
--                 / (stock on hand + litres in)
--
--  Tanker spend stays a real figure, but it is cash going out, not the cost of
--  what was sold, and the two are reported apart.
-- ============================================================================

-- ------------------------------------------------ every litre that arrived --
-- One row per delivery line, per fuel, in the order the tankers came, with the
-- rate actually paid for it. Owner only, because it reads the cost table.
create or replace view v_fuel_purchase_flow with (security_invoker = true) as
select
  fp.station_id,
  t.fuel_type_id,
  fp.delivery_date,
  fp.id                                             as purchase_id,
  fp.litres,
  fc.amount / nullif(fp.litres, 0)                  as rate_paid
from fuel_purchases fp
join tanks t on t.id = fp.tank_id
join fuel_purchase_costs fc on fc.purchase_id = fp.id
where fp.litres > 0
union all
-- CNG arrives on its own truck and is weighed in kilograms, but it is bought
-- and sold the same way, so it carries a cost like the rest. It has no tank
-- to hang a fuel type off, so it is found the way the rest of the app finds
-- it: the fuel measured in kilograms.
select
  cs.station_id,
  ft.id,
  cs.supply_date,
  cs.id,
  cs.kg_received,
  cc.amount / nullif(cs.kg_received, 0)
from cng_supply cs
join cng_supply_costs cc on cc.supply_id = cs.id
join fuel_types ft on ft.station_id = cs.station_id and ft.unit = 'kg'
where cs.kg_received > 0;

revoke insert, update, delete on v_fuel_purchase_flow from authenticated;
grant select on v_fuel_purchase_flow to authenticated;

-- ------------------------------------------------- every litre that went out --
create or replace view v_fuel_sales_flow with (security_invoker = true) as
select
  sh.station_id,
  nz.fuel_type_id,
  sh.business_date,
  sum(nr.litres)  as quantity,
  sum(nr.amount)  as sales_value
from nozzle_readings nr
join nozzles nz on nz.id = nr.nozzle_id
join shifts sh on sh.id = nr.shift_id
group by sh.station_id, nz.fuel_type_id, sh.business_date
union all
select
  sh.station_id,
  d.fuel_type_id,
  sh.business_date,
  sum(cr.kg),
  sum(cr.amount)
from cng_readings cr
join cng_dispensers d on d.id = cr.dispenser_id
join shifts sh on sh.id = cr.shift_id
group by sh.station_id, d.fuel_type_id, sh.business_date;

revoke insert, update, delete on v_fuel_sales_flow from authenticated;
grant select on v_fuel_sales_flow to authenticated;

-- --------------------------------------------- the cost carried per fuel ----
-- Walks a fuel's whole history in order — every tanker in, every day's sales
-- out — and moves the average cost at each arrival. Returns what a litre of
-- that fuel was worth on each day it was sold.
--
-- It is written as one function rather than a view because the running figure
-- depends on its own previous value, which is a loop and not a join.
drop function if exists fuel_cost_flow(uuid);

create or replace function fuel_cost_flow(p_fuel uuid)
  returns table (
    on_date       date,
    quantity_sold numeric,
    sales_value   numeric,
    unit_cost     numeric,
    cost_of_sales numeric
  )
  language plpgsql stable security definer set search_path = public as $fn$
declare
  v_stock numeric := 0;
  v_cost  numeric := 0;
  v_known boolean := false;
  r       record;
begin
  if not is_owner() then
    raise exception 'What fuel cost is owner only.';
  end if;

  -- A fuel nobody has ever recorded a tanker for has no cost, and nothing is
  -- not zero: zero cost would report the whole sale as profit. It comes back
  -- null, and the screens say so.
  select exists (select 1 from v_fuel_purchase_flow f
                  where f.station_id = auth_station_id() and f.fuel_type_id = p_fuel)
    into v_known;

  -- The tanks start somewhere. Their opening stock has no purchase behind it,
  -- so it carries the first rate paid until a tanker moves it.
  select coalesce(sum(t.opening_stock_litres), 0) into v_stock
    from tanks t
   where t.station_id = auth_station_id() and t.fuel_type_id = p_fuel;

  select coalesce(min(f.rate_paid), 0) into v_cost
    from v_fuel_purchase_flow f
   where f.station_id = auth_station_id() and f.fuel_type_id = p_fuel;

  for r in
    -- Arrivals and sales, in the order they happened. A tanker that lands on
    -- a trading day is taken in before that day's litres go out, which is the
    -- convention the depot invoice and the dip both assume.
    select d, kind, qty, value, rate from (
      select f.delivery_date as d, 0 as kind, f.litres as qty,
             null::numeric as value, f.rate_paid as rate
        from v_fuel_purchase_flow f
       where f.station_id = auth_station_id() and f.fuel_type_id = p_fuel
      union all
      select s.business_date, 1, s.quantity, s.sales_value, null
        from v_fuel_sales_flow s
       where s.station_id = auth_station_id() and s.fuel_type_id = p_fuel
    ) both_ways
    order by d, kind
  loop
    if r.kind = 0 then
      -- A tanker moves the running cost, weighted by what was already there.
      if v_stock + r.qty > 0 then
        v_cost := (v_stock * v_cost + r.qty * coalesce(r.rate, v_cost))
                  / (v_stock + r.qty);
      end if;
      v_stock := v_stock + r.qty;
    else
      on_date       := r.d;
      quantity_sold := r.qty;
      sales_value   := r.value;
      unit_cost     := case when v_known then round(v_cost, 4) end;
      cost_of_sales := case when v_known then round(r.qty * v_cost, 2) end;
      v_stock := greatest(v_stock - r.qty, 0);
      return next;
    end if;
  end loop;
end
$fn$;

revoke execute on function fuel_cost_flow(uuid) from public;
grant execute on function fuel_cost_flow(uuid) to authenticated;

comment on function fuel_cost_flow(uuid) is
  'What a litre of this fuel cost on each day it was sold, carried forward '
  'from the tankers it came out of. Owner only.';

-- ------------------------------------------------------ margin, per fuel ----
-- Petrol and diesel are different businesses with different margins and
-- different VAT; one blended number hides which of them is thin.
-- A table-returning function cannot be replaced when its columns change, and
-- this one gains cost_known, so it goes before it comes back.
drop function if exists margin_by_fuel(date, date);

create or replace function margin_by_fuel(p_from date, p_to date)
  returns table (
    fuel_type_id  uuid,
    fuel_name     text,
    unit          text,
    quantity_sold numeric,
    sales_value   numeric,
    cost_of_sales numeric,
    avg_sale_rate numeric,
    avg_cost_rate numeric,
    margin_per_unit numeric,
    /** false when no tanker of this fuel has ever been priced */
    cost_known    boolean
  )
  language plpgsql stable security definer set search_path = public as $fn$
declare f record;
begin
  if not is_owner() then
    raise exception 'Margin figures are owner only.';
  end if;

  for f in select ft.id, ft.name, ft.unit::text as unit
             from fuel_types ft
            where ft.station_id = auth_station_id()
            order by ft.sort_order
  loop
    select f.id, f.name, f.unit,
           coalesce(sum(c.quantity_sold), 0),
           coalesce(sum(c.sales_value), 0),
           -- Null all the way through where the cost is not known, rather
           -- than a zero that would read as free fuel.
           case when bool_and(c.unit_cost is not null) then sum(c.cost_of_sales) end,
           case when coalesce(sum(c.quantity_sold), 0) > 0
                then round(sum(c.sales_value) / sum(c.quantity_sold), 3) end,
           case when bool_and(c.unit_cost is not null)
                 and coalesce(sum(c.quantity_sold), 0) > 0
                then round(sum(c.cost_of_sales) / sum(c.quantity_sold), 3) end,
           case when bool_and(c.unit_cost is not null)
                 and coalesce(sum(c.quantity_sold), 0) > 0
                then round((sum(c.sales_value) - sum(c.cost_of_sales))
                           / sum(c.quantity_sold), 3) end,
           coalesce(bool_and(c.unit_cost is not null), true)
      into fuel_type_id, fuel_name, unit, quantity_sold, sales_value,
           cost_of_sales, avg_sale_rate, avg_cost_rate, margin_per_unit,
           cost_known
      from fuel_cost_flow(f.id) c
     where c.on_date between p_from and p_to;

    return next;
  end loop;
end
$fn$;

revoke execute on function margin_by_fuel(date, date) from public;
grant execute on function margin_by_fuel(date, date) to authenticated;

-- ------------------------------------------------- the report, put right ----
-- Same name and same shape, so every caller keeps working — but the cost it
-- reports is now the cost of the litres SOLD, and what the tankers cost this
-- month is reported beside it as what it is: cash out.
create or replace function margin_report(p_from date, p_to date)
  returns jsonb language plpgsql stable as $fn$
declare
  -- Money adds across the three fuels. Quantity does not: petrol and diesel
  -- are litres and CNG is kilograms, and a rate per "unit" that has added the
  -- two together is a number about nothing. So the per-litre figures below
  -- cover the liquid fuels, and the kilograms are carried beside them.
  v_ltr    numeric := 0;
  v_kg     numeric := 0;
  v_value  numeric := 0;
  v_cost   numeric := 0;
  v_lvalue numeric := 0;
  -- The priced slice: litres that have a tanker behind them, which is what
  -- the cost and margin figures may speak for. Selling is known for every
  -- litre; what it cost is not.
  v_pltr   numeric := 0;
  v_pvalue numeric := 0;
  v_lcost  numeric := 0;
  v_bought numeric := 0;
  v_spend  numeric := 0;
  v_exp    numeric := 0;
  v_wage   numeric := 0;
  v_blind  int     := 0;
  r        record;
begin
  if not is_owner() then raise exception 'Margin figures are owner only'; end if;

  for r in select * from margin_by_fuel(p_from, p_to) loop
    v_value := v_value + r.sales_value;
    if r.unit = 'kg' then
      v_kg := v_kg + r.quantity_sold;
    else
      v_ltr    := v_ltr    + r.quantity_sold;
      v_lvalue := v_lvalue + r.sales_value;
    end if;

    -- A fuel with no priced tanker behind it is left out of every cost and
    -- margin figure and counted instead, so the screen can name it rather
    -- than quietly averaging a zero into the rest. What it sold still counts:
    -- not knowing the cost does not unsell the litres.
    if r.cost_known then
      v_cost := v_cost + coalesce(r.cost_of_sales, 0);
      if r.unit <> 'kg' then
        v_pltr   := v_pltr   + r.quantity_sold;
        v_pvalue := v_pvalue + r.sales_value;
        v_lcost  := v_lcost  + coalesce(r.cost_of_sales, 0);
      end if;
    elsif r.quantity_sold > 0 then
      v_blind := v_blind + 1;
    end if;
  end loop;

  -- What arrived and what it cost. Kept because the owner still has to know
  -- what left the bank, but never subtracted from sales.
  select coalesce(sum(f.litres), 0), coalesce(sum(f.litres * f.rate_paid), 0)
    into v_bought, v_spend
    from v_fuel_purchase_flow f
   where f.station_id = auth_station_id()
     and f.delivery_date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_exp from expenses
   where business_date between p_from and p_to and station_id = auth_station_id();
  select coalesce(sum(amount), 0) into v_wage from staff_payments
   where payment_date between p_from and p_to and station_id = auth_station_id();

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'litres_sold',   v_ltr,
    'kg_sold',       v_kg,
    'sales_value',   v_value,
    -- What the fuel sold cost, carried from the tankers it came out of.
    'cost_of_sales', v_cost,
    'gross_profit',  v_value - v_cost,
    -- Per litre, so petrol and diesel only.
    'avg_sale_rate', case when v_ltr > 0 then round(v_lvalue / v_ltr, 3) end,
    'avg_cost_rate', case when v_pltr > 0 then round(v_lcost / v_pltr, 3) end,
    'gross_margin_per_litre',
      case when v_pltr > 0 then round((v_pvalue - v_lcost) / v_pltr, 3) end,
    -- Cash out on tankers in this window, which is a different question.
    'litres_bought', v_bought,
    'purchase_cost', v_spend,
    'operating_expenses', v_exp + v_wage,
    'net_after_costs', v_value - v_cost - v_exp - v_wage,
    -- How many fuels sold in this window have no tanker priced behind them,
    -- so the figures above cover less than the whole pump.
    'fuels_without_cost', v_blind
  );
end
$fn$;

grant execute on function margin_report(date, date) to authenticated;

comment on function margin_report(date, date) is
  'Sales against the cost of the fuel that was sold, not against the tankers '
  'that happened to arrive in the same window. Owner only.';
