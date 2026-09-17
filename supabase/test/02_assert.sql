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
select assert_eq((select book_stock_litres from v_tank_stock where name = 'Tank 1 Petrol'),
                 4802.000::numeric, 'petrol stock (test fuel went back in)');

-- The permission line that matters: no sight of what fuel cost.
select assert_eq((select count(*) from fuel_purchase_costs), 0::bigint, 'manager sees no purchase costs');
select assert_eq((select count(*) from fuel_purchases), 1::bigint, 'manager still sees the delivery itself');
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

insert into credit_sales (business_date, customer_id, fuel_type_id, quantity, sale_rate, slip_number)
  values (current_date, 'c1111111-0000-0000-0000-000000000001',
          'f1111111-0000-0000-0000-000000000002', 50, 89.200, 'S-002');
select assert_eq((select count(*) from credit_sales), 2::bigint, 'counter can write a slip');
select assert_raises($$ insert into expenses (category, amount) values ('x', 1) $$, 'counter writing an expense');
rollback;

-- --------------------------------------------------------------- OWNER ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select assert_eq((select count(*) from fuel_purchase_costs), 1::bigint, 'owner sees purchase costs');
select assert_eq((margin_report(current_date, current_date)->>'avg_purchase_rate')::numeric,
                 84.000::numeric, 'owner sees the buying rate');
select assert_eq((margin_report(current_date, current_date)->>'avg_sale_rate')::numeric,
                 91.271::numeric, 'owner sees the average selling rate');

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
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select approve_day(current_date, 'Checked with manager, all tallied');
select assert_eq((select status::text from day_closings where business_date = current_date),
                 'approved', 'day approved');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select assert_raises($$ insert into expenses (category, amount) values ('late', 100) $$,
                     'manager editing an approved day');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into expenses (category, amount) values ('owner correction', 100);
select reopen_day(current_date, 'missed a diesel slip');
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into expenses (category, amount) values ('after reopen', 50);
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

-- Ordered 6,000 · challan 6,000 · into the tank 5,970.
select assert_eq((select invoice_variance from v_deliveries where tanker_number = 'GJ18TT9999'),
                 -30.000::numeric, 'short against the challan');
select assert_eq((select order_variance from v_deliveries where tanker_number = 'GJ18TT9999'),
                 -30.000::numeric, 'short against the order');
select assert_eq((select tanker_dip_litres from v_deliveries where tanker_number = 'GJ18TT9999'),
                 5980.000::numeric, 'the tanker dip at rest is kept');
select assert_eq((select seals_intact from v_deliveries where tanker_number = 'GJ18TT9999'),
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

\echo ''
\echo '================  ALL ASSERTIONS PASSED  ================'
