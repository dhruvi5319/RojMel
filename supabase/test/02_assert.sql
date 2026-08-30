-- ============================================================================
--  Assertions. Every number below was worked out by hand from 01_seed.sql:
--
--    P1 petrol  1000 -> 1200, 2 L test poured back  = 198 L @ 96.50 = 19,107.00
--    D1 diesel  5000 -> 5500                        = 500 L @ 89.20 = 44,600.00
--    meter sales                                                    = 63,707.00
--    of which on udhaar: 300 L diesel @ 89.20                       = 26,760.00
--    so cash/upi/card owed by the filler                            = 36,947.00
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- ------------------------------------------------------------- MANAGER ----
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

select assert_eq(auth_role()::text, 'manager', 'manager role resolves');

select assert_eq((day_summary(current_date)->>'meter_sales')::numeric,     63707.00::numeric, 'meter sales');
select assert_eq((day_summary(current_date)->>'litres_sold')::numeric,       698.000::numeric, 'litres sold (test fuel excluded)');
select assert_eq((day_summary(current_date)->>'credit_sales')::numeric,    26760.00::numeric, 'credit sales');
select assert_eq((day_summary(current_date)->>'counter_sales')::numeric,   36947.00::numeric, 'counter sales = meter - credit');
select assert_eq((day_summary(current_date)->>'collected_total')::numeric, 36947.00::numeric, 'collected');
select assert_eq((day_summary(current_date)->>'collection_short')::numeric,    0.00::numeric, 'filler is square');
select assert_eq((day_summary(current_date)->>'deposited')::numeric,       40000.00::numeric, 'deposited to bank');
-- 0 opening + 30,000 cash collected + 20,000 received - 500 expense - 40,000 banked
select assert_eq((day_summary(current_date)->>'expected_cash')::numeric,    9500.00::numeric, 'cash that should be in the box');
select assert_eq((day_summary(current_date)->>'counted_cash')::numeric,     9500.00::numeric, 'cash actually counted');

-- 50,000 brought over from the book + 26,760 taken - 20,000 paid
select assert_eq((select balance from v_customer_balances where name = 'Shree Transport'),
                 56760.00::numeric, 'customer balance');
select assert_eq((select unbilled_amount from v_customer_balances where name = 'Shree Transport'),
                 26760.00::numeric, 'unbilled slips');

-- Diesel: 8,000 opening + 6,000 delivered - 500 sold. The 300 credit litres
-- are part of that 500, not on top of it.
select assert_eq((select book_stock_litres from v_tank_stock where name = 'Tank 2 Diesel'),
                 13500.000::numeric, 'diesel stock');
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

insert into credit_sales (business_date, customer_id, fuel_type_id, litres, sale_rate, slip_number)
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

\echo ''
\echo '================  ALL ASSERTIONS PASSED  ================'

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
                 63707.00::numeric, 'sales_by_day matches the day');
select assert_eq((select count(*) from sales_by_day(current_date - 6, current_date)),
                 7::bigint, 'a week of rows even where nothing traded');
select assert_eq((select sales_value from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'Diesel'),
                 44600.00::numeric, 'diesel sales split out');
select assert_eq((select litres_sold from sales_by_fuel(current_date, current_date)
                   where fuel_name = 'Petrol'),
                 198.000::numeric, 'petrol litres split out');
rollback;
