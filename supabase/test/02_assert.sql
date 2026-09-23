-- ============================================================================
--  Assertions. Every number below was worked out by hand from 01_seed.sql:
--
--    P1 petrol  1000 -> 1200, 2 L test poured back  = 198 L @ 96.50 = 19,107.00
--    D1 diesel  5000 -> 5500                        = 500 L @ 89.20 = 44,600.00
--    C1 cng     5000 -> 5100                        = 100 kg @ 79.67 =  7,967.00
--    meter sales                                                    = 71,674.00
--    of which on udhaar: 300 L diesel @ 89.20                       = 26,760.00
--    so owed by the filler across all four modes                    = 44,914.00
--    handed over: 30,000 cash + 6,947 UPI + 7,967 BPCL card         = 44,914.00
--
--  The BPCL card pays for the CNG, so the day tallies — but the cash box is
--  unchanged by it, which is the point of the 'cash box' assertions below.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- ------------------------------------------------------------- MANAGER ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

select assert_eq(auth_role()::text, 'manager', 'manager role resolves');

select assert_eq((day_summary(current_date)->>'meter_sales')::numeric,     71674.00::numeric, 'meter sales across all three fuels');
select assert_eq((day_summary(current_date)->>'liquid_sales')::numeric,    63707.00::numeric, 'petrol and diesel');
select assert_eq((day_summary(current_date)->>'cng_sales')::numeric,        7967.00::numeric, 'cng');
select assert_eq((day_summary(current_date)->>'litres_sold')::numeric,       698.000::numeric, 'litres sold (test fuel excluded)');
select assert_eq((day_summary(current_date)->>'kg_sold')::numeric,           100.000::numeric, 'kilograms of cng sold');
select assert_eq((day_summary(current_date)->>'credit_sales')::numeric,    26760.00::numeric, 'credit sales');
select assert_eq((day_summary(current_date)->>'counter_sales')::numeric,   44914.00::numeric, 'counter sales = meter - credit');
select assert_eq((day_summary(current_date)->>'collected_total')::numeric, 44914.00::numeric, 'collected across four modes');
select assert_eq((day_summary(current_date)->>'collected_bpcl')::numeric,   7967.00::numeric, 'bpcl card collected');
select assert_eq((day_summary(current_date)->>'collection_short')::numeric,    0.00::numeric, 'filler is square');
select assert_eq((day_summary(current_date)->>'deposited')::numeric,       40000.00::numeric, 'deposited to bank');
-- 0 opening + 30,000 cash collected + 20,000 received - 500 expense - 40,000 banked.
-- The 6,947 UPI and 7,967 BPCL are collected but settle to the bank, so
-- neither appears here. That is the whole reason the figure is unchanged.
select assert_eq((day_summary(current_date)->>'expected_cash')::numeric,    9500.00::numeric, 'cash box ignores UPI and BPCL');
select assert_eq((day_summary(current_date)->>'counted_cash')::numeric,     9500.00::numeric, 'cash actually counted');

-- 50,000 brought over from the book + 26,760 taken - 20,000 paid
select assert_eq((select balance from v_customer_balances where name = 'Shree Transport'),
                 56760.00::numeric, 'customer balance');
select assert_eq((select unbilled_amount from v_customer_balances where name = 'Shree Transport'),
                 26760.00::numeric, 'unbilled slips');

-- Diesel: 8,000 opening + 5,970 actually decanted - 500 sold. Stock follows
-- what reached the tank, not what the challan claimed. The 300 credit litres
-- are part of that 500, not on top of it.
select assert_eq((select book_stock_litres from v_tank_stock where name = 'Tank 2 Diesel'),
                 13470.000::numeric, 'diesel stock follows what was decanted');
-- Petrol: 5,000 opening + 3,985 off the same tanker's other compartment
-- - 198 sold, the 2 test litres having gone back in.
select assert_eq((select book_stock_litres from v_tank_stock where name = 'Tank 1 Petrol'),
                 8787.000::numeric, 'petrol stock (test fuel went back in)');

-- The permission line that matters: no sight of what fuel cost.
select assert_eq((select count(*) from fuel_purchase_costs), 0::bigint, 'manager sees no purchase costs');
select assert_eq((select count(*) from fuel_purchases), 2::bigint, 'manager still sees the delivery itself');

-- ------------------------------ the changeover is the pump's own setting -----
-- 7am is only what a new pump starts with. Move it and the working day moves
-- with it, because pump_day() reads the station rather than a constant.
--
-- As the owner: the pump's details are his, and a manager's update here would
-- be refused by RLS without raising — which is exactly how this assertion
-- failed the first time it was written.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update stations set day_starts_at = '08:00', night_starts_at = '20:00'
 where id = '11111111-1111-1111-1111-111111111111';
select assert_eq(pump_day('2026-09-20 07:30+05:30'::timestamptz), '2026-09-19'::date,
                 '7.30am is still the night before, once the pump hands over at 8');
select assert_eq(pump_shift('2026-09-20 07:30+05:30'::timestamptz), 'Night',
                 'and the shift reads the same setting');
select assert_eq(pump_shift('2026-09-20 08:00+05:30'::timestamptz), 'Day',
                 'the day shift starts when the pump says it does');
update stations set day_starts_at = '07:00', night_starts_at = '19:00'
 where id = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- --------------------------------------- the pump's day rolls at 7am ---------
-- The night shift runs 7pm to 7am, so at 2am the forecourt is still working
-- the shift that started last evening and what it sells belongs to that day's
-- book. Without this a slip written at 2am lands on tomorrow and splits one
-- night's takings across two days, so neither tallies.
select assert_eq(pump_day('2026-09-20 02:30+05:30'::timestamptz), '2026-09-19'::date,
                 '2.30am belongs to the day before');
select assert_eq(pump_day('2026-09-20 06:59+05:30'::timestamptz), '2026-09-19'::date,
                 'and so does 6.59am, the last minute of the night shift');
select assert_eq(pump_day('2026-09-20 07:00+05:30'::timestamptz), '2026-09-20'::date,
                 'the day turns over at 7am, when the day shift starts');
select assert_eq(pump_day('2026-09-20 23:30+05:30'::timestamptz), '2026-09-20'::date,
                 'and the night shift before midnight is still that day');

-- ------------------------- record_meter_reading(), superseded but kept ------
-- 0035's one-walk-at-the-start function still exists and nothing has changed
-- its behaviour, so this stays as a regression check on it. The app itself
-- calls record_shift_closing() now (below) — the filler finishing writes
-- their own closing, and start_shift() inherits it for whoever comes next,
-- because waiting for the next filler to show up was never really optional.
do $do$
declare v_day uuid; v_night uuid; v_nz uuid;
begin
  select id into v_day   from shifts where business_date = current_date and name = 'Day';
  select id into v_night from shifts where business_date = current_date and name = 'Night';
  select id into v_nz    from nozzles where name = 'P1';

  if v_night is null then
    insert into shifts (station_id, business_date, name, sort_order, status)
    values ('11111111-1111-1111-1111-111111111111', current_date, 'Night', 2, 'open')
    returning id into v_night;
  end if;

  -- 7am on the day shift: every nozzle reads 1000
  perform record_meter_reading(v_day,
    jsonb_build_array(jsonb_build_object('nozzle_id', v_nz, 'reading', 1000)));
  -- 7pm, the night shift coming on: the same nozzle reads 1250
  perform record_meter_reading(v_night,
    jsonb_build_array(jsonb_build_object('nozzle_id', v_nz, 'reading', 1250)));
end
$do$;

select assert_eq((select closing_reading from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date and name = 'Day')
                     and nozzle_id = (select id from nozzles where name = 'P1')),
                 1250.000::numeric,
                 'the night shift''s reading closed the day shift');
select assert_eq((select opening_reading from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date and name = 'Night')
                     and nozzle_id = (select id from nozzles where name = 'P1')),
                 1250.000::numeric,
                 'and opened its own, off the same number');
-- A shift that has only just started has sold nothing, not a negative amount.
select assert_eq((select litres from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date and name = 'Night')
                     and nozzle_id = (select id from nozzles where name = 'P1')),
                 0.000::numeric, 'and it has sold nothing yet');

-- ------------------------ the shift that is finishing closes itself ---------
-- A filler cannot wait on whoever is coming on next to settle their own
-- hissab, so the closing reading is theirs to take, and the next shift
-- simply inherits it the moment it opens — nobody re-walks a number nothing
-- has moved.
do $do$
declare v_d1 uuid; v_d2 uuid; v_nz uuid; v_far date := current_date + 100;
begin
  select id into v_nz from nozzles where name = 'D1';

  select id into v_d1 from start_shift('Day', v_far);
  perform record_shift_closing(v_d1,
    jsonb_build_array(jsonb_build_object('nozzle_id', v_nz, 'reading', 90000)));

  select id into v_d2 from start_shift('Night', v_far);
end
$do$;

select assert_eq((select confirmed from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date + 100 and name = 'Day')
                     and nozzle_id = (select id from nozzles where name = 'D1')),
                 true, 'closing it yourself marks it confirmed');
select assert_eq((select opening_reading from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date + 100 and name = 'Night')
                     and nozzle_id = (select id from nozzles where name = 'D1')),
                 90000.000::numeric,
                 'the next shift opens on exactly what the last one closed at');
select assert_eq((select confirmed from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date + 100 and name = 'Night')
                     and nozzle_id = (select id from nozzles where name = 'D1')),
                 false,
                 'but inherited is not the same as somebody having actually looked — '
                 'nobody has confirmed the night shift''s own reading yet');

-- The filler finishing the night shift closes it themselves too, and it
-- never reaches back to touch the day shift it opened from.
select record_shift_closing(
    (select id from shifts where business_date = current_date + 100 and name = 'Night'),
    jsonb_build_array(jsonb_build_object('nozzle_id',
      (select id from nozzles where name = 'D1'), 'reading', 90400)));
select assert_eq((select litres from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date + 100 and name = 'Night')
                     and nozzle_id = (select id from nozzles where name = 'D1')),
                 400.000::numeric, 'the night shift sold what it actually sold');
select assert_eq((select closing_reading from nozzle_readings
                   where shift_id = (select id from shifts
                                      where business_date = current_date + 100 and name = 'Day')
                     and nozzle_id = (select id from nozzles where name = 'D1')),
                 90000.000::numeric,
                 'closing the night shift never rewrites the day shift''s own closing');

-- A meter cannot go backwards, whoever is closing it.
select assert_raises($$ select record_shift_closing(
    (select id from shifts where business_date = current_date + 100 and name = 'Night'),
    jsonb_build_array(jsonb_build_object('nozzle_id',
      (select id from nozzles where name = 'D1'), 'reading', 100))) $$,
  'a closing reading below the opening');

-- ------------------------------------------------ two shifts, day and night --
-- The pump runs two, and a slip belongs to one of them: udhaar not on a shift
-- makes that shift look short by exactly the amount written during it.
select assert_eq((select count(*) from ensure_day_shifts(current_date)), 2::bigint,
                 'a day has its two shifts');
select assert_eq((select string_agg(name, ',' order by sort_order)
                    from ensure_day_shifts(current_date)),
                 'Day,Night', 'named for the halves of the day');
select assert_eq((select count(*) from ensure_day_shifts(current_date)), 2::bigint,
                 'and asking twice does not open four');

-- A slip written with no shift named still lands on one, so no udhaar floats
-- free of both fillers.
insert into credit_sales (customer_id, business_date, fuel_type_id, quantity, sale_rate)
  values ('c1111111-0000-0000-0000-000000000001', current_date,
          'f1111111-0000-0000-0000-000000000002', 10, 89.40);
select assert_eq((select count(*) from credit_sales
                   where business_date = current_date and shift_id is null),
                 0::bigint, 'no slip is left off a shift');

-- ------------------------------------------------- the depot's invoice ------
-- Taken off a real BPCL tax invoice: one tanker, 5 KL of petrol and 15 KL of
-- diesel, 29 Aug 2026. If these figures ever stop matching, the app is telling
-- an owner he owes a different amount from the paper in his hand.
--
-- The catch the arithmetic has to get right: CESS is charged on the value plus
-- the delivery charge PLUS the VAT. Charging it on the value alone understates
-- this one load by about two thousand rupees.
select assert_eq((purchase_invoice_line(406633.46, 3999.10, 13.7, 4) ->> 'vat')::numeric,
                 56256.66::numeric, 'petrol VAT at 13.7% matches the invoice');
select assert_eq((purchase_invoice_line(406633.46, 3999.10, 13.7, 4) ->> 'cess')::numeric,
                 18675.57::numeric, 'petrol CESS is charged on the VAT too');
select assert_eq((purchase_invoice_line(1177615.73, 11968.80, 14.9, 4) ->> 'vat')::numeric,
                 177248.09::numeric, 'diesel VAT at 14.9% matches the invoice');
select assert_eq((purchase_invoice_line(1177615.73, 11968.80, 14.9, 4) ->> 'cess')::numeric,
                 54673.30::numeric, 'diesel CESS matches the invoice');

-- and the whole paper tallies, rounding line included
select assert_eq(
  (purchase_invoice_line(406633.46, 3999.10, 13.7, 4) ->> 'amount')::numeric
  + (purchase_invoice_line(1177615.73, 11968.80, 14.9, 4) ->> 'amount')::numeric
  + 0.29,
  1907071.00::numeric, 'the tanker''s invoice comes to what the paper says');

-- The basic amount is copied, never recomputed: 5 KL at the printed
-- 81,326.69/KL is 406,633.45, and the invoice says 406,633.46, because the
-- depot bills a per-litre rate carried further than it prints.
select assert_eq(round(5 * 81326.69, 2), 406633.45::numeric,
                 'the printed rate does not reproduce the printed amount');

-- Neither rate is ever assumed. VAT differs by product on one invoice and both
-- rates move, so a delivery's figures must come out of its own row and nothing
-- else. Same function, four different pairs of rates.
select assert_eq((purchase_invoice_line(100000, 0, 13.7, 4) ->> 'amount')::numeric,
                 118248.00::numeric, 'a 13.7% VAT line');
select assert_eq((purchase_invoice_line(100000, 0, 14.9, 4) ->> 'amount')::numeric,
                 119496.00::numeric, 'a 14.9% VAT line is different');
select assert_eq((purchase_invoice_line(100000, 0, 14.9, 0) ->> 'amount')::numeric,
                 114900.00::numeric, 'and a load with no cess at all');
select assert_eq((purchase_invoice_line(100000, 0, 0, 0) ->> 'amount')::numeric,
                 100000.00::numeric, 'and one with neither');
select assert_eq((purchase_invoice_line(100000, 0, 15.5, 2.5) ->> 'amount')::numeric,
                 118387.50::numeric, 'a rate the state has not used yet still works');

-- ---------------------------------------------------- one tanker, two tanks --
-- A tanker comes from the depot with compartments and decants into more than
-- one of our tanks. The compartments are not written down; the tanks are, and
-- they all hang off the one trip.
select assert_eq((select count(*) from fuel_deliveries), 1::bigint,
                 'the two loads came off one tanker');
select assert_eq((select tanks_filled from v_tanker_visits where tanker_number = 'GJ18TT9999'),
                 2::bigint, 'the trip filled two tanks');
select assert_eq((select fuels from v_tanker_visits where tanker_number = 'GJ18TT9999'),
                 'Diesel + Petrol', 'and brought both products');
select assert_eq((select litres from v_tanker_visits where tanker_number = 'GJ18TT9999'),
                 9955.000::numeric, 'the trip dropped both loads together');
-- The date lives on the trip; the line is kept in step so the stock
-- arithmetic and the index can read it without the two ever disagreeing.
select assert_eq((select count(distinct delivery_date) from fuel_purchases), 1::bigint,
                 'every line carries its tanker''s date');
select assert_raises($$ select margin_report(current_date - 30, current_date) $$, 'manager margin report');

-- Things she is meant to be able to do.
insert into customers (name) values ('Test Transport');
insert into bank_deposits (bank_name, amount) values ('SBI', 1000);
insert into fuel_prices (fuel_type_id, sale_rate) values ('f1111111-0000-0000-0000-000000000001', 97.100);
select assert_eq(current_rate('f1111111-0000-0000-0000-000000000001'), 97.100::numeric, 'manager can move the rate');

-- Tenant isolation.
select assert_eq((select count(*) from customers where name = 'Rival Roadlines'), 0::bigint, 'other pump is invisible');
rollback;

-- ------------------------------------------------------------- COUNTER ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

select assert_eq((select count(*) from nozzles), 2::bigint, 'counter sees the nozzles');
select assert_eq((select count(*) from staff),   1::bigint, 'counter sees the filler list');
select assert_eq((select count(*) from expenses),      0::bigint, 'counter sees no expenses');
select assert_eq((select count(*) from bank_deposits), 0::bigint, 'counter sees no deposits');
select assert_eq((select count(*) from payments),      0::bigint, 'counter sees no receipts');
select assert_eq((select count(*) from invoices),      0::bigint, 'counter sees no invoices');
select assert_eq((select count(*) from fuel_purchase_costs), 0::bigint, 'counter sees no costs');
select assert_eq((select count(*) from v_customer_balances), 0::bigint, 'counter sees no balances');

-- pump_day(), not current_date: the counter's RLS gates this write on the
-- pump's own working day, which is still yesterday's before day_starts_at —
-- current_date already rolled over then, and the two disagreeing for a few
-- hours every night is exactly the case this line means to write through.
insert into credit_sales (business_date, customer_id, fuel_type_id, quantity, sale_rate, slip_number)
  values (pump_day(), 'c1111111-0000-0000-0000-000000000001',
          'f1111111-0000-0000-0000-000000000002', 50, 89.200, 'S-002');
select assert_eq((select count(*) from credit_sales), 2::bigint, 'counter can write a slip');
select assert_raises($$ insert into expenses (category, amount) values ('x', 1) $$, 'counter writing an expense');

-- The card machine and the UPI QR are handled at the nozzle, by whoever is
-- serving, so the counter writes this shift's own figure for them too — not
-- a per-filler one, the shift's row, the one with no name against it.
insert into shift_collections (shift_id, staff_id, card_amount, upi_amount, bpcl_amount)
  values ('11111111-0000-0000-0000-0000000000c1', null, 500, 300, 0)
  on conflict (shift_id, staff_id) do update
    set card_amount = excluded.card_amount, upi_amount = excluded.upi_amount;
select assert_eq((select card_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1' and staff_id is null),
                 500.00::numeric, 'the counter can write the shift''s own card total');
select assert_eq((select upi_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1' and staff_id is null),
                 300.00::numeric, 'and its UPI total');
rollback;

-- --------------------------------------------------------------- OWNER ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select assert_eq((select count(*) from fuel_purchase_costs), 1::bigint, 'owner sees purchase costs');
select assert_eq((margin_report(current_date, current_date)->>'avg_sale_rate')::numeric,
                 91.271::numeric, 'owner sees the average selling rate');

-- ---------------------------------- what the fuel SOLD cost, not what arrived --
-- The tanker on this day brought 5,970 L at 84.000 and cost 5,01,480. Only 500 L
-- of diesel went out. The old report subtracted the whole tanker from the day's
-- sales and called the difference a loss; tankers come when the tanks need them,
-- sixteen or seventeen a month, so that number meant nothing.
select assert_eq((select cost_of_sales from margin_by_fuel(current_date, current_date)
                   where fuel_name = 'Diesel'),
                 42000.00::numeric, 'the diesel sold cost 500 L at 84.000');
select assert_eq((select margin_per_unit from margin_by_fuel(current_date, current_date)
                   where fuel_name = 'Diesel'),
                 5.200::numeric, 'so the margin is 89.20 less 84.00');
select assert_eq((margin_report(current_date, current_date)->>'cost_of_sales')::numeric,
                 42000.00::numeric, 'the day''s cost of sales');
select assert_eq((margin_report(current_date, current_date)->>'gross_profit')::numeric,
                 29674.00::numeric, 'and the day made money, tanker or no tanker');
-- The tanker is still reported, as the cash it is.
select assert_eq((margin_report(current_date, current_date)->>'purchase_cost')::numeric,
                 501480.00::numeric, 'what the tankers cost is kept, apart');
select assert_eq((margin_report(current_date, current_date)->>'litres_bought')::numeric,
                 5970.000::numeric, 'and the litres they brought');

-- The cost carries to a day no tanker comes, which is most days.
insert into shifts (id, station_id, business_date, name, sort_order, status)
  values ('11111111-0000-0000-0000-0000000000d9', '11111111-1111-1111-1111-111111111111',
          current_date + 1, 'Day', 1, 'open');
insert into nozzle_readings (station_id, shift_id, nozzle_id, opening_reading,
                             closing_reading, test_litres, sale_rate)
  values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000d9',
          '11111111-0000-0000-0000-0000000000d1', 5500, 5600, 0, 89.200);
select assert_eq((select unit_cost from fuel_cost_flow('f1111111-0000-0000-0000-000000000002')
                   where on_date = current_date + 1),
                 84.0000::numeric, 'a day with no tanker still knows what its fuel cost');
select assert_eq((margin_report(current_date + 1, current_date + 1)
                    ->>'gross_margin_per_litre')::numeric,
                 5.200::numeric, 'and still has a margin, where before it had none');

-- A fuel nobody has priced a tanker for is not free fuel. Petrol has no cost
-- row in this pump's books, so it is left out of the cost figures and counted,
-- rather than averaged in at nothing and reported as pure profit.
select assert_eq((select cost_of_sales from margin_by_fuel(current_date, current_date)
                   where fuel_name = 'Petrol'),
                 null::numeric, 'a fuel with no priced tanker has no cost, not zero');
select assert_eq((select cost_known from margin_by_fuel(current_date, current_date)
                   where fuel_name = 'Petrol'),
                 false, 'and says so');
select assert_eq((margin_report(current_date, current_date)->>'fuels_without_cost')::int,
                 2::int, 'the report counts what it cannot speak for');
-- but the litres still sold, and the selling rate still covers all of them
select assert_eq((margin_report(current_date, current_date)->>'litres_sold')::numeric,
                 698.000::numeric, 'not knowing a cost does not unsell the litres');

-- Reports shows the margin as a subtraction, and the two rates it subtracts
-- have to be over the same litres. Petrol is unpriced in this window, so the
-- average over everything sold (91.271) is not the one that may be taken
-- away from: the priced slice is 500 L of diesel at 89.200, and 89.200 less
-- 84.000 is the 5.200 printed above the sum.
select assert_eq((margin_report(current_date, current_date)->>'avg_sale_rate_priced')::numeric,
                 89.200::numeric, 'the selling rate over the litres whose cost is known');
select assert_eq(
  (margin_report(current_date, current_date)->>'avg_sale_rate_priced')::numeric
    - (margin_report(current_date, current_date)->>'avg_cost_rate')::numeric,
  (margin_report(current_date, current_date)->>'gross_margin_per_litre')::numeric,
  'and the working on the screen comes to the answer above it');

-- Invoicing the month's slips.
-- Run the insert to completion before reading it back: a statement's snapshot
-- predates any DML its own function calls perform.
create temp table t_inv on commit drop as
  select generate_invoice('c1111111-0000-0000-0000-000000000001',
                          current_date - 30, current_date, 0) as id;
select assert_eq((select total from invoices where id = (select id from t_inv)),
                 26760.00::numeric, 'invoice totals the unbilled slips');
select assert_eq((select invoice_number from invoices limit 1),
                 'RP/' || fiscal_year_label(current_date) || '/0001', 'invoice number');
select assert_eq((select unbilled_amount from v_customer_balances where name = 'Shree Transport'),
                 0::numeric, 'slips are now billed');
select assert_eq((select balance from v_customer_balances where name = 'Shree Transport'),
                 56760.00::numeric, 'invoicing does not change what is owed');

-- Paying it off moves the invoice status by itself.
insert into payments (customer_id, invoice_id, amount, mode)
  select 'c1111111-0000-0000-0000-000000000001', id, 26760, 'bank_transfer' from invoices limit 1;
select assert_eq((select status::text from invoices limit 1), 'paid', 'invoice settles itself');
rollback;

-- ----------------------------------------------- APPROVAL LOCKS THE DAY ----
-- The seed's day_closings row lives at current_date (01_seed.sql), so the
-- approval and the lookups here stay on current_date too — but expenses.
-- business_date defaults to pump_day(), which is still yesterday's before
-- day_starts_at, so the inserts below say business_date explicitly rather
-- than trust the default to land on the day just approved.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select approve_day(current_date, 'Checked with manager, all tallied');
select assert_eq((select status::text from day_closings where business_date = current_date),
                 'approved', 'day approved');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_raises($$
  insert into expenses (category, amount, business_date) values ('late', 100, current_date) $$,
  'manager editing an approved day');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into expenses (category, amount, business_date) values ('owner correction', 100, current_date);
select reopen_day(current_date, 'missed a diesel slip');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into expenses (category, amount, business_date) values ('after reopen', 50, current_date);
select assert_eq((select count(*) from expenses), 3::bigint, 'manager can post again after reopen');
rollback;

-- ----------------------------------------------------- THE OTHER TENANT ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select assert_eq((select count(*) from customers), 1::bigint, 'rival sees only their own customer');
select assert_eq((day_summary(current_date)->>'meter_sales')::numeric, 0::numeric, 'rival sees no sales of ours');
select assert_eq((select count(*) from v_tank_stock), 0::bigint, 'rival sees none of our tanks');
rollback;



-- ------------------------------------------- nozzle state feeds the form ---
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_eq((select last_closing from v_nozzle_state where name = 'P1'),
                 1200.000::numeric, 'P1 opening prefills from last closing');
select assert_eq((select sale_rate from v_nozzle_state where name = 'D1'),
                 89.200::numeric, 'D1 carries the live rate');
select assert_eq((select count(*) from v_nozzle_state), 2::bigint, 'both nozzles listed');
rollback;

-- ------------------------------------------------ running cash position ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
-- 30,000 collected + 20,000 received - 500 expense - 40,000 banked
select assert_eq((cash_position()->>'in_hand')::numeric, 9500.00::numeric,
                 'cash box position');
rollback;

-- ----------------------------------------------------------- reporting ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_eq((select meter_sales from sales_by_day(current_date, current_date)),
                 71674.00::numeric, 'sales_by_day matches the day');
select assert_eq((select count(*) from sales_by_day(current_date - 6, current_date)),
                 7::bigint, 'a week of rows even where nothing traded');
select assert_eq((select sales_value from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'Diesel'),
                 44600.00::numeric, 'diesel sales split out');
select assert_eq((select quantity from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'Petrol'),
                 198.000::numeric, 'petrol litres split out');
select assert_eq((select unit from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'CNG'), 'kg', 'cng reports in kilograms');
select assert_eq((select quantity from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'CNG'), 100.000::numeric, 'cng quantity');
select assert_eq((select sales_value from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'CNG'), 7967.00::numeric, 'cng value');
select assert_eq((select kg_sold from sales_by_day(current_date, current_date)),
                 100.000::numeric, 'sales_by_day carries kilograms');
rollback;

-- --------------------------------- stock every shift, and the tanker's dip --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- A dip now belongs to a shift, so a tank can be dipped more than once a day:
-- one at the end of each shift, plus a day-end dip that belongs to no shift.
insert into tank_dips (tank_id, business_date, shift_id, dip_litres)
  values ('11111111-0000-0000-0000-00000000000b', current_date, null, 7450);
insert into tank_dips (tank_id, business_date, shift_id, dip_litres)
  values ('11111111-0000-0000-0000-00000000000b', current_date,
          '11111111-0000-0000-0000-0000000000c1', 7480);
select assert_eq((select count(*) from tank_dips
                   where tank_id = '11111111-0000-0000-0000-00000000000b'),
                 2::bigint, 'a day-end dip and a shift dip can coexist');
select assert_raises($$
  insert into tank_dips (tank_id, business_date, shift_id, dip_litres)
  values ('11111111-0000-0000-0000-00000000000b', current_date,
          '11111111-0000-0000-0000-0000000000c1', 9999) $$,
  'the same shift cannot be dipped twice');
select assert_raises($$
  insert into tank_dips (tank_id, business_date, shift_id, dip_litres)
  values ('11111111-0000-0000-0000-00000000000b', current_date, null, 9999) $$,
  'nor the day-end dip');

-- Ordered 6,000 · challan 6,000 · into the diesel tank 5,970. The same trip
-- also dropped petrol, so a delivery line is named by its tank, not its tanker.
select assert_eq((select invoice_variance from v_deliveries
                   where tanker_number = 'GJ18TT9999' and tank_name = 'Tank 2 Diesel'),
                 -30.000::numeric, 'short against the challan');
select assert_eq((select order_variance from v_deliveries
                   where tanker_number = 'GJ18TT9999' and tank_name = 'Tank 2 Diesel'),
                 -30.000::numeric, 'short against the order');
select assert_eq((select tanker_dip_litres from v_deliveries
                   where tanker_number = 'GJ18TT9999' and tank_name = 'Tank 2 Diesel'),
                 5980.000::numeric, 'the tanker dip at rest is kept');
select assert_eq((select seals_intact from v_deliveries
                   where tanker_number = 'GJ18TT9999' and tank_name = 'Tank 2 Diesel'),
                 true, 'seal check is kept');

-- Gas cost is margin, so the manager must not see it.
select assert_eq((select count(*) from cng_supply_costs), 0::bigint,
                 'manager sees no gas cost');
rollback;

-- ------------------------------------------------- VAT stays owner-only ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select vat_amount from fuel_purchase_costs limit 1),
                 100296.00::numeric, 'owner sees the VAT on the purchase');
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_eq((select count(*) from fuel_purchase_costs), 0::bigint,
                 'manager still sees no purchase cost or VAT');
rollback;


-- ------------------------------------------------ every write is recorded --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- The trail is owner-only, so the counting is done with the owner's eyes
-- while the writing is done with the manager's hands.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
create temp table t_before on commit drop as select count(*) n from audit_log;

set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into expenses (category, amount) values ('Audited spend', 321);
update expenses set amount = 456 where category = 'Audited spend';
delete from expenses where category = 'Audited spend';

set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select count(*) from audit_log) - (select n from t_before),
                 3::bigint, 'insert, update and delete each leave a line');
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

update customers set credit_limit = 999999
 where id = 'c1111111-0000-0000-0000-000000000001';

set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
-- An update records only what moved, as [was, now].
select assert_eq(
  (select details -> 'credit_limit' ->> 1 from audit_log
    where entity = 'customers' and action = 'update'
    order by id desc limit 1),
  '999999.00', 'an update records the new value');
select assert_eq(
  (select details -> 'credit_limit' ->> 0 from audit_log
    where entity = 'customers' and action = 'update'
    order by id desc limit 1),
  '200000.00', 'and the value it replaced');
select assert_eq(
  (select actor_role::text from audit_log
    where entity = 'customers' order by id desc limit 1),
  'manager', 'and who did it');

-- An update that changes nothing is not worth a line.
create temp table t_noop on commit drop as select count(*) n from audit_log;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update customers set credit_limit = 999999
 where id = 'c1111111-0000-0000-0000-000000000001';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select count(*) from audit_log) - (select n from t_noop),
                 0::bigint, 'a no-op update writes nothing');

-- A counter PIN must not sit in the log.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into staff (name, pin) values ('Pin Test', '4321');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select details ->> 'pin' from audit_log
                   where entity = 'staff' order by id desc limit 1),
                 '***', 'a PIN is redacted');
rollback;

-- Only the owner may read the trail back.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_eq((select count(*) from v_audit), 0::bigint, 'manager reads no audit');
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select count(*) > 0 from v_audit), true, 'owner reads the audit');
rollback;


-- ------------------------------ the equipment is the owner's, prices hers --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

select assert_eq((select count(*) > 0 from nozzles), true, 'manager reads the nozzles');
select assert_raises($$ insert into nozzles (tank_id, fuel_type_id, name)
  values ('11111111-0000-0000-0000-00000000000a',
          'f1111111-0000-0000-0000-000000000001', 'X9') $$,
  'manager adding a nozzle');
-- Row level security answers a forbidden UPDATE or DELETE by matching no
-- rows rather than raising, so these assert the row count, not an error.
-- This is exactly why every action in the app goes through changed().
create temp table t_upd on commit drop as
  with u as (update nozzles set name = 'ZZ' where name = 'P1' returning 1)
  select count(*) n from u;
select assert_eq((select n from t_upd), 0::bigint, 'manager renames no nozzle');

create temp table t_del on commit drop as
  with d as (delete from tanks where name = 'Tank 1 Petrol' returning 1)
  select count(*) n from d;
select assert_eq((select n from t_del), 0::bigint, 'manager deletes no tank');
select assert_eq((select count(*) from nozzles where name = 'P1'), 1::bigint,
                 'and P1 is untouched');

-- but the daily price is still hers
insert into fuel_prices (fuel_type_id, sale_rate)
  values ('f1111111-0000-0000-0000-000000000002', 90.500);
select assert_eq(current_rate('f1111111-0000-0000-0000-000000000002'),
                 90.500::numeric, 'manager still sets the rate');
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into nozzles (tank_id, fuel_type_id, name)
  values ('11111111-0000-0000-0000-00000000000a',
          'f1111111-0000-0000-0000-000000000001', 'P9');
select assert_eq((select count(*) from nozzles where name = 'P9'), 1::bigint,
                 'owner adds a nozzle');
update nozzles set name = 'P9b' where name = 'P9';
select assert_eq((select count(*) from nozzles where name = 'P9b'), 1::bigint,
                 'owner renames it');
delete from nozzles where name = 'P9b';
select assert_eq((select count(*) from nozzles where name = 'P9b'), 0::bigint,
                 'owner deletes an unused one');

-- but not one that has already priced a sale
select assert_raises($$ delete from nozzles where name = 'P1' $$,
  'deleting a nozzle that has readings');
rollback;


-- ------------------------------ the money log: the book, one shift at a time --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- Petrol 198 L @ 96.50 = 19,107 · Diesel 500 L @ 89.20 = 44,600
-- CNG    100 kg @ 79.67 = 7,967      → sold 71,674
select assert_eq((select amount from v_shift_fuel_sales
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and fuel_name = 'Petrol'),
                 19107.00::numeric, 'petrol sold this shift');
select assert_eq((select quantity from v_shift_fuel_sales
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and fuel_name = 'CNG'),
                 100.000::numeric, 'cng kilograms this shift');
select assert_eq((select unit from v_shift_fuel_sales
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and fuel_name = 'CNG'), 'kg', 'and in kilograms');
select assert_eq((select sale_rate from v_shift_fuel_sales
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and fuel_name = 'Diesel'),
                 89.200::numeric, 'priced at the day''s rate');

-- cash 30,000 + UPI 6,947 + BPCL 7,967 + udhaar 26,760 = 71,674
select assert_eq((select total_sale from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 71674.00::numeric, 'sold, all three fuels');
select assert_eq((select udhaar from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 26760.00::numeric, 'udhaar counts as a way money arrived');
select assert_eq((select accounted from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 71674.00::numeric, 'accounted for, across five ways');
select assert_eq((select difference from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 0.00::numeric, 'the shift balances');

-- The difference belongs to the shift, and is written down.
select assert_eq(record_shift_variance('11111111-0000-0000-0000-0000000000c1',
                                       'Counted with Ramesh'),
                 0.00::numeric, 'the difference is recorded');
select assert_eq((select variance_note from shifts
                   where id = '11111111-0000-0000-0000-0000000000c1'),
                 'Counted with Ramesh', 'along with what was said about it');

-- Take 500 out of the filler's cash and the shift must show it short by that.
update shift_collections set cash_amount = cash_amount - 500
 where shift_id = '11111111-0000-0000-0000-0000000000c1'
   and staff_id is not null;
select assert_eq((select difference from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 500.00::numeric, 'short cash shows as a shift difference');
select assert_eq(record_shift_variance('11111111-0000-0000-0000-0000000000c1', 'Short'),
                 500.00::numeric, 'and is recorded against that shift');
rollback;


-- ------------------------------------- the day book, one row per trading day --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

select assert_eq((select total_sale from v_day_book where business_date = current_date),
                 71674.00::numeric, 'the day book totals the day');
select assert_eq((select udhaar from v_day_book where business_date = current_date),
                 26760.00::numeric, 'and carries the udhaar');
select assert_eq((select difference from v_day_book where business_date = current_date),
                 0.00::numeric, 'and whether it balanced');
select assert_eq((select status from v_day_book where business_date = current_date),
                 'submitted', 'and how far it has got');
select assert_eq((select count(*) from day_book_month(current_date)), 1::bigint,
                 'a month lists only the days that traded');
select assert_eq((select count(*) from day_book_month((current_date - interval '2 months')::date)),
                 0::bigint, 'a month with no trading is empty, not an error');
rollback;


-- ------------------------------ the shift's own takings, with no filler named --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- The shift's own row sits beside the filler's, and both count.
select assert_eq((select count(*) from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 2::bigint, 'a shift row sits beside the filler row');
update shift_collections set cash_amount = 1000
 where shift_id = '11111111-0000-0000-0000-0000000000c1' and staff_id is null;
select assert_eq((select cash from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 31000.00::numeric, 'and both count toward the shift');

-- but only ever one unattributed row
select assert_raises($$
  insert into shift_collections (shift_id, staff_id, cash_amount)
  values ('11111111-0000-0000-0000-0000000000c1', null, 999) $$,
  'a second shift-level row');

-- Cash is the filler's; the account-settled modes are the shift's.
select assert_raises($$
  update shift_collections set upi_amount = 100
   where shift_id = '11111111-0000-0000-0000-0000000000c1'
     and staff_id is not null $$,
  'UPI recorded against a filler');
select assert_raises($$
  insert into shift_collections (shift_id, staff_id, cash_amount, bpcl_amount)
  values ('11111111-0000-0000-0000-0000000000c1',
          '11111111-0000-0000-0000-00000000000f', 10, 20) $$,
  'a BPCL card recorded against a filler');
select assert_eq((select upi from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 6947.00::numeric, 'the shift still carries the UPI');
rollback;


-- ---------------------------------- a slip belongs to the shift it was written in --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- Written with no shift named, while the morning shift stands open.
insert into credit_sales (business_date, customer_id, fuel_type_id, quantity, sale_rate, slip_number)
  values (current_date, 'c1111111-0000-0000-0000-000000000001',
          'f1111111-0000-0000-0000-000000000002', 10, 89.200, 'AUTO-1');
select assert_eq((select shift_id from credit_sales where slip_number = 'AUTO-1'),
                 '11111111-0000-0000-0000-0000000000c1'::uuid,
                 'a slip attaches itself to the open shift');

-- and so it reaches that shift's udhaar
select assert_eq((select udhaar from v_shift_money
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 27652.00::numeric, 'and counts toward that shift');

-- A slip written after every shift is closed still belongs to one. It used to
-- belong to nothing, which made the day's udhaar float free of both fillers
-- and each of them look short by their own slips.
update shifts set status = 'submitted' where business_date = current_date;
insert into credit_sales (business_date, customer_id, fuel_type_id, quantity, sale_rate, slip_number)
  values (current_date, 'c1111111-0000-0000-0000-000000000001',
          'f1111111-0000-0000-0000-000000000002', 5, 89.200, 'AUTO-2');
select assert_eq((select shift_id from credit_sales where slip_number = 'AUTO-2'),
                 '11111111-0000-0000-0000-0000000000c1'::uuid,
                 'a late slip still lands on the day''s shift');
select assert_eq((select count(*) from v_unattached_udhaar
                   where business_date = current_date),
                 0::bigint, 'and no udhaar belongs to nobody');
rollback;


-- --------------------------------------------------- what a filler did -----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

insert into shift_fillers (shift_id, staff_id)
  values ('11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000f');

select assert_eq((select shifts_this_month from v_staff_work
                   where staff_id = '11111111-0000-0000-0000-00000000000f'),
                 1::bigint, 'the office can see the shifts a filler stood');
select assert_eq((select cash_this_month from v_staff_work
                   where staff_id = '11111111-0000-0000-0000-00000000000f'),
                 30000.00::numeric, 'and the cash that came through their hands');
select assert_eq((select last_worked from v_staff_work
                   where staff_id = '11111111-0000-0000-0000-00000000000f'),
                 current_date, 'and when they last worked');
rollback;


-- ------------------------------------------------ how old the udhaar is ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- Shree Transport came into the book owing 50,000, took 26,760 of diesel today
-- and has paid 20,000. Payments clear the oldest first, so 30,000 of the
-- opening balance is still owed and today's slip is untouched.
select assert_eq((select owed from v_customer_ageing
                   where customer_id = 'c1111111-0000-0000-0000-000000000001'),
                 56760.00::numeric, 'what is still owed, aged, matches the balance');
select assert_eq((select within_month from v_customer_ageing
                   where customer_id = 'c1111111-0000-0000-0000-000000000001'),
                 56760.00::numeric, 'and all of it is this month, in a book this new');
rollback;


-- --------------------------------------- how long the fuel lasts, in days --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

-- Diesel: 8,000 opening + 5,970 decanted - 500 sold = 13,470 in the tank, and
-- 500 L is the only day that traded, so the pump is selling 500 a day.
select assert_eq((select litres_per_day from v_tank_cover where name = 'Tank 2 Diesel'),
                 500.00::numeric, 'what the pump has actually been selling');
select assert_eq((select days_left from v_tank_cover where name = 'Tank 2 Diesel'),
                 26.9::numeric, 'and so how many days are left in the tank');
-- A tank nothing has sold out of has no rate, and no made-up answer either.
select assert_eq((select days_left from v_tank_cover where name = 'Tank 1 Petrol' and litres_per_day = 0),
                 null::numeric, 'a tank with no recent sales says nothing rather than guessing');

-- The tankers have no schedule, so what is kept is the rhythm.
select assert_eq((select trips_this_month from v_fuel_supply where fuel_name = 'Diesel'),
                 1::int, 'one tanker of diesel this month');
select assert_eq((select last_delivery from v_fuel_supply where fuel_name = 'Diesel'),
                 current_date, 'and the day the last one came');
rollback;


-- ------------------------------------- a filler starts the shift, not the clock --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

-- Nothing exists until somebody presses start.
select assert_eq((select count(*) from shifts where name = 'Night'), 0::bigint,
                 'no night shift until one is started');

select assert_eq((select opened_by_staff from start_shift('Night', null,
                                                          '11111111-0000-0000-0000-00000000000f')),
                 '11111111-0000-0000-0000-00000000000f'::uuid,
                 'the shift records the filler who started it');
select assert_eq((select status::text from shifts where name = 'Night'), 'open',
                 'and it is open');
select assert_eq((select sort_order from shifts where name = 'Night'), 2::int,
                 'the night sorts after the day');

-- Pressing start again is not a second shift, and does not rewrite the first
-- press: the hour a shift began is the hour it began.
select assert_eq((select count(*) from (select start_shift('Night')) x), 1::bigint,
                 'pressing start twice returns the shift already running');
select assert_eq((select count(*) from shifts where name = 'Night'), 1::bigint,
                 'and does not open a second one');
select assert_eq((select opened_by_staff from shifts where name = 'Night'),
                 '11111111-0000-0000-0000-00000000000f'::uuid,
                 'nor forget who started it');

-- The pump runs two shifts. A third name would be a shift the money log
-- could never reconcile.
select assert_raises($$ select start_shift('Evening') $$, 'a third shift name');
-- And a filler answers for the day in front of them.
select assert_raises($$ select start_shift('Night', current_date - 5) $$,
                     'the counter starting an old shift');

-- Who is on it is settled when it opens.
select assert_eq((select count(*) from shift_fillers
                   where shift_id = (select id from shifts where name = 'Night')),
                 0::bigint, 'nobody is on it until somebody says so');
select assert_eq((select count(*) from (select start_shift(
                    'Night', null, '11111111-0000-0000-0000-00000000000f',
                    array['11111111-0000-0000-0000-00000000000f'::uuid])) x),
                 1::bigint, 'the forecourt says who is standing there');
select assert_eq((select covering from shift_fillers
                   where shift_id = (select id from shifts where name = 'Night')),
                 true, 'somebody off their roster is covering');
select assert_eq((select count(*) from (select start_shift(
                    'Night', null, null, array[]::uuid[])) x),
                 1::bigint, 'and can take a name off again');
select assert_eq((select count(*) from shift_fillers
                   where shift_id = (select id from shifts where name = 'Night')),
                 0::bigint, 'the roster is the forecourt''s answer, not the office''s');

-- Handed in too early and the forecourt is still working: pressing start
-- again reopens it, which is the filler's own right until the office agrees
-- the figures. The hour it first began stands.
select assert_eq((select status::text from close_shift(
                    (select id from shifts where name = 'Night'))),
                 'submitted', 'the shift can be handed in');
select assert_eq((select status::text from start_shift('Night')), 'open',
                 'and started again if the forecourt is still working');
select assert_eq((select closed_at from shifts where name = 'Night'), null::timestamptz,
                 'which clears the hour it was handed in');
select assert_eq((select opened_by_staff from shifts where name = 'Night'),
                 '11111111-0000-0000-0000-00000000000f'::uuid,
                 'and still names whoever started it in the first place');

-- Past the office's agreement it is not the filler's to reopen.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'approved' where name = 'Night';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
select assert_raises($$ select start_shift('Night') $$, 'restarting an approved shift');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'open' where name = 'Night';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

-- Handing it in names the filler too.
select assert_eq((select closed_by_staff from close_shift(
                    (select id from shifts where name = 'Night'), null,
                    '11111111-0000-0000-0000-00000000000f')),
                 '11111111-0000-0000-0000-00000000000f'::uuid,
                 'the shift records who handed it in');
rollback;


-- --------------------------------------- the cash a filler counted at the counter --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

-- The count is against the people who worked the shift, so they have to be on it.
select assert_raises($$ select record_shift_cash(
    '11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f", "cash_amount": 100}]') $$,
  'cash against somebody who was not on the shift');

insert into shift_fillers (shift_id, staff_id)
  values ('11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000f');

select assert_eq(record_shift_cash('11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f", "cash_amount": 25000}]'),
  25000.00::numeric, 'the filler counts their own cash');
select assert_eq((select cash_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'),
                 25000.00::numeric, 'and it is what the shift carries');

-- Cash and only cash. The card machine and the UPI account are the pump's,
-- and sit on the shift's own row, which this never touches.
select assert_eq((select upi_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id is null),
                 6947.00::numeric, 'the shift keeps its UPI');
select assert_eq((select cash_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'),
                 25000.00::numeric, 'and the filler carries cash alone');
select assert_raises($$ select record_shift_cash(
    '11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f", "cash_amount": -5}]') $$,
  'a cash figure below nothing');

-- A name taken off the count is taken off the shift's money; the shift's own
-- row survives, because it is not anybody's.
select assert_eq(record_shift_cash('11111111-0000-0000-0000-0000000000c1', '[]'),
                 0.00::numeric, 'the count can be emptied');
select assert_eq((select count(*) from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id is not null),
                 0::bigint, 'and the filler''s row goes with it');
select assert_eq((select count(*) from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id is null),
                 1::bigint, 'the shift''s own row is never touched here');

-- Past the office's agreement it is not the filler's to change.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'approved'
 where id = '11111111-0000-0000-0000-0000000000c1';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
select assert_raises($$ select record_shift_cash(
    '11111111-0000-0000-0000-0000000000c1', '[]') $$,
  'counting cash onto an approved shift');
rollback;


-- ------------------------------- cash counted note by note, not typed ------
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

select assert_raises($$ select record_shift_cash_count(
    '11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 100, "count": 1}]}]') $$,
  'counting cash for somebody who was not on the shift');

insert into shift_fillers (shift_id, staff_id)
  values ('11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000f');

-- 5 x 500 + 3 x 100 + 1 x 50 = 2850, and that is the total the function
-- returns and the total the shift carries — never typed, always added up.
select assert_eq(record_shift_cash_count('11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 500, "count": 5},
                          {"denomination": 100, "count": 3},
                          {"denomination": 50,  "count": 1}]}]'),
  2850.00::numeric, 'the total is what the notes and coins add to');
select assert_eq((select cash_amount from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'),
                 2850.00::numeric, 'and it is what the shift carries');
select assert_eq((select count from shift_cash_denominations
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'
                     and denomination = 500),
                 5::int, 'the ₹500 count is kept, not just the total');
select assert_eq((select count(*) from shift_cash_denominations
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'),
                 3::bigint, 'one row per denomination actually counted, no zero rows');

-- Not a real note or coin, and a count below nothing, are both refused.
select assert_raises($$ select record_shift_cash_count(
    '11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 2000, "count": 1}]}]') $$,
  'a ₹2000 note is not a real denomination here');
select assert_raises($$ select record_shift_cash_count(
    '11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 100, "count": -1}]}]') $$,
  'a note count below nothing');

-- Re-counting replaces the breakdown, not adds to it.
select assert_eq(record_shift_cash_count('11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 200, "count": 2}]}]'),
  400.00::numeric, 're-counting replaces the breakdown rather than adding to it');
select assert_eq((select count(*) from shift_cash_denominations
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id = '11111111-0000-0000-0000-00000000000f'),
                 1::bigint, 'the earlier denominations are gone, not left behind');

-- A name taken off the count is taken off the shift's money AND its
-- denominations; the shift's own row (UPI, ATM, BPCL) is never touched here.
select assert_eq(record_shift_cash_count('11111111-0000-0000-0000-0000000000c1', '[]'),
                 0.00::numeric, 'the count can be emptied');
select assert_eq((select count(*) from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id is not null),
                 0::bigint, 'and the filler''s row goes with it');
select assert_eq((select count(*) from shift_cash_denominations
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'),
                 0::bigint, 'and so do the denominations');
select assert_eq((select count(*) from shift_collections
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and staff_id is null),
                 1::bigint, 'the shift''s own row is never touched here');

-- The office can read the breakdown back, named.
select record_shift_cash_count('11111111-0000-0000-0000-0000000000c1',
    '[{"staff_id": "11111111-0000-0000-0000-00000000000f",
       "denominations": [{"denomination": 500, "count": 1}]}]');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select assert_eq((select name from v_shift_cash_denominations
                   where shift_id = '11111111-0000-0000-0000-0000000000c1'
                     and denomination = 500),
                 'Ramesh', 'the owner sees whose count it was');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

-- Past the office's agreement it is not the filler's to change.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'approved'
 where id = '11111111-0000-0000-0000-0000000000c1';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
select assert_raises($$ select record_shift_cash_count(
    '11111111-0000-0000-0000-0000000000c1', '[]') $$,
  'counting cash by note onto an approved shift');
rollback;


-- ------------------------------------- a filler puts right a slip they wrote --
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';

with u as (
  update credit_sales set quantity = 40
   where slip_number = 'S-001' returning 1)
select assert_eq((select count(*) from u), 1::bigint,
                 'a slip can be corrected while the shift is the filler''s');

-- Billing is not the counter's, so it cannot put a slip on one.
select assert_raises($$
  update credit_sales set invoice_id = gen_random_uuid() where slip_number = 'S-001' $$,
  'the counter billing a slip');
rollback;


-- Nor can a slip be moved out of an open shift and onto an agreed one, which
-- would shift udhaar the office has already signed for.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
select start_shift('Night');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'approved' where name = 'Night';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
select assert_raises($$
  update credit_sales set shift_id = (select id from shifts where name = 'Night')
   where slip_number = 'S-001' $$,
  'moving a slip onto an agreed shift');
rollback;


-- And a slip already on a bill is somebody's account, not a note on a pad.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into invoices (id, customer_id, invoice_number, period_from, period_to)
  values ('dddddddd-0000-0000-0000-000000000001',
          'c1111111-0000-0000-0000-000000000001',
          'TEST-1', current_date, current_date);
update credit_sales set invoice_id = 'dddddddd-0000-0000-0000-000000000001'
 where slip_number = 'S-001';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
with u as (
  update credit_sales set quantity = 40
   where slip_number = 'S-001' returning 1)
select assert_eq((select count(*) from u), 0::bigint,
                 'a billed slip is beyond the counter');
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
update shifts set status = 'approved' where id = '11111111-0000-0000-0000-0000000000c1';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
with u as (
  update credit_sales set quantity = 40
   where slip_number = 'S-001' returning 1)
select assert_eq((select count(*) from u), 0::bigint,
                 'but not once the office has agreed the shift');
rollback;

\echo ''
\echo '================  ALL ASSERTIONS PASSED  ================'

-- --------------------------------------------------- the roster rotates ----
-- rotation_effective_role() on its own: given a role for one week, every
-- other week is a flip for each week's distance from it. 2024-01-01 is a
-- Monday, so the week it opens runs Mon 1 Jan to Sun 7 Jan.
select assert_eq(rotation_effective_role('Day', '2024-01-01', '2024-01-03'),
                 'Day', 'same week, midweek: unchanged');
select assert_eq(rotation_effective_role('Day', '2024-01-01', '2024-01-07'),
                 'Day', 'same week, its own Sunday: still unchanged');
select assert_eq(rotation_effective_role('Day', '2024-01-01', '2024-01-08'),
                 'Night', 'one week on, from Monday: flipped');
select assert_eq(rotation_effective_role('Day', '2024-01-01', '2024-01-15'),
                 'Day', 'two weeks on: back to the start');
select assert_eq(rotation_effective_role('Day', '2024-01-01', '2023-12-25'),
                 'Night', 'a week earlier: flipped there too');
select assert_eq(rotation_effective_role(null, '2024-01-01', '2024-01-03'),
                 null, 'no role recorded: no answer, not a guess');

-- staff_is_rostered() folds the Sunday handover in: the crew finishing the
-- week on days also works that Sunday's night shift, and the crew finishing
-- the week on nights has the day off rather than working it.
select assert_eq(staff_is_rostered(false, 'Day', null, null, 'Day', '2024-01-03'),
                 true, 'a fixed Day filler, on a Day shift');
select assert_eq(staff_is_rostered(false, 'Day', null, null, 'Night', '2024-01-03'),
                 false, 'a fixed Day filler, on a Night shift');
select assert_eq(staff_is_rostered(false, null, null, null, 'Day', '2024-01-03'),
                 false, 'no fixed shift at all is not a roster match');

-- Group A: Day as of the week of 2024-01-01. Group B: Night, same week.
select assert_eq(staff_is_rostered(true, null, 'Day', '2024-01-01', 'Day', '2024-01-07'),
                 true, 'Sunday, the day group: still on the day shift');
select assert_eq(staff_is_rostered(true, null, 'Day', '2024-01-01', 'Night', '2024-01-07'),
                 true, 'Sunday, the day group: on the night shift too — the double');
select assert_eq(staff_is_rostered(true, null, 'Night', '2024-01-01', 'Day', '2024-01-07'),
                 false, 'Sunday, the night group: not on the day shift');
select assert_eq(staff_is_rostered(true, null, 'Night', '2024-01-01', 'Night', '2024-01-07'),
                 false, 'Sunday, the night group: has the night off too — the day group covered it');
-- The Monday after: roles have swapped, and it is a plain lookup again, no
-- Sunday exception in play.
select assert_eq(staff_is_rostered(true, null, 'Day', '2024-01-01', 'Night', '2024-01-08'),
                 true, 'Monday, week 2: the erstwhile day group is now on nights');
select assert_eq(staff_is_rostered(true, null, 'Night', '2024-01-01', 'Day', '2024-01-08'),
                 true, 'Monday, week 2: the erstwhile night group is now on days');

-- And through the trigger and start_shift(), not just the bare function.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into staff (id, station_id, name, monthly_salary, rotates, rotation_role, rotation_set_on)
  values
    ('11111111-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111',
     'Rotates onto Day', 10000, true, 'Day', '2024-01-01'),
    ('11111111-0000-0000-0000-0000000000e2', '11111111-1111-1111-1111-111111111111',
     'Rotates onto Night', 10000, true, 'Night', '2024-01-01');

-- A weekday: the roster is seeded on opening, split cleanly between the two.
select assert_eq((select status::text from start_shift('Day', '2024-01-03')), 'open', 'day shift opens');
select assert_eq((select status::text from start_shift('Night', '2024-01-03')), 'open', 'night shift opens');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-03' and s.name = 'Day'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e1'),
                 1::bigint, 'the day-group filler is seeded onto the weekday day shift');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-03' and s.name = 'Night'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e2'),
                 1::bigint, 'the night-group filler is seeded onto the weekday night shift');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-03' and s.name = 'Night'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e1'),
                 0::bigint, 'and not the other way round on a plain weekday');

-- The Sunday: the day group is seeded onto both, the night group onto neither.
select assert_eq((select status::text from start_shift('Day', '2024-01-07')), 'open', 'Sunday day shift opens');
select assert_eq((select status::text from start_shift('Night', '2024-01-07')), 'open', 'Sunday night shift opens');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-07' and s.name = 'Day'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e1'),
                 1::bigint, 'Sunday: the day group works the day shift as usual');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-07' and s.name = 'Night'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e1'),
                 1::bigint, 'Sunday: the day group works the night shift too — seeded by the trigger, not typed in');
select assert_eq((select count(*) from shift_fillers sf
                   join shifts s on s.id = sf.shift_id
                  where s.business_date = '2024-01-07'
                    and sf.staff_id = '11111111-0000-0000-0000-0000000000e2'),
                 0::bigint, 'Sunday: the night group is on neither shift — the day group covered both');

-- start_shift()'s own covering flag agrees with the trigger: naming the
-- night-group filler onto that Sunday's night shift (where the roster now
-- says the day group, not them) marks it as covering.
select assert_eq((select covering from shift_fillers sf
                    where sf.shift_id = (select id from shifts
                                          where business_date = '2024-01-07' and name = 'Night')
                      and sf.staff_id = '11111111-0000-0000-0000-0000000000e1'),
                 false, 'the day group on Sunday night is not covering — it is their own roster');

select (select count(*) from (select start_shift(
    'Night', '2024-01-07', null,
    array['11111111-0000-0000-0000-0000000000e1'::uuid, '11111111-0000-0000-0000-0000000000e2'::uuid])) x);
select assert_eq((select covering from shift_fillers sf
                    where sf.shift_id = (select id from shifts
                                          where business_date = '2024-01-07' and name = 'Night')
                      and sf.staff_id = '11111111-0000-0000-0000-0000000000e2'),
                 true, 'the night group standing on Sunday night anyway is covering, correctly');
rollback;
