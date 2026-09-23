-- ============================================================================
--  The margin is the sum the screen shows.
--
--  Reports printed "Margin per litre ₹7.271" with "₹91.271 − ₹84.000" under
--  it as the working. The two rates were over different litres: the selling
--  rate averaged every litre that left the pump, the cost rate only the
--  litres with a priced tanker behind them. With one fuel unpriced — which
--  happens the moment a new fuel is added, or before the first invoice is
--  typed — the working no longer came to the answer, and a page that
--  contradicts itself about money is a page nobody trusts about money.
--
--  So the selling rate is published twice: over everything sold, which is a
--  real thing an owner wants to know, and over the priced slice, which is the
--  only one that may be subtracted from. The margin is now the difference of
--  the two rounded rates rather than the rounding of their difference, so the
--  sum on the screen is exact to the last paisa it prints.
-- ============================================================================

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
    -- The same average taken over the priced slice alone. The screen shows
    -- the margin as a subtraction, and it has to be the subtraction that
    -- produced it: avg_sale_rate covers every litre sold, the cost covers
    -- only the litres with a tanker behind them, and where a fuel had no
    -- priced tanker the two were over different litres — so the sum printed
    -- under the margin did not come to the margin printed above it.
    'avg_sale_rate_priced', case when v_pltr > 0 then round(v_pvalue / v_pltr, 3) end,
    'avg_cost_rate', case when v_pltr > 0 then round(v_lcost / v_pltr, 3) end,
    -- Taken as the difference of the two rounded rates, not rounded from the
    -- difference, so what the screen prints subtracts exactly.
    'gross_margin_per_litre',
      case when v_pltr > 0
           then round(v_pvalue / v_pltr, 3) - round(v_lcost / v_pltr, 3) end,
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
  'that happened to arrive in the same window. The per-litre figures come in '
  'two flavours: over everything sold, and over the slice whose cost is '
  'known, which is the one the margin subtracts from. Owner only.';
