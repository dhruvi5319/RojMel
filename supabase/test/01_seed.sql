-- Seeds one station with a realistic day of trading, plus a second station
-- used only to prove tenants cannot see each other.
set session role none;

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
  returns void language plpgsql as $fn$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %  = %', label, actual;
end $fn$;

create or replace function assert_raises(sql text, label text)
  returns void language plpgsql as $fn$
begin
  execute sql;
  raise exception 'FAIL % — expected an error, none raised', label;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  %  blocked (%)', label, left(sqlerrm, 60);
end $fn$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'father@pump.in'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'brother@pump.in'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'manager@pump.in'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'counter@pump.in'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'rival@other.in');

insert into stations (id, name, invoice_prefix) values
  ('11111111-1111-1111-1111-111111111111', 'Rathod Petroleum', 'RP'),
  ('22222222-2222-2222-2222-222222222222', 'Other Pump', 'OP');

insert into profiles (id, station_id, full_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Father',  'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Brother', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Manager', 'manager'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Counter', 'counter'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Rival',   'owner');

insert into fuel_types (id, station_id, name, name_gu, sort_order) values
  ('f1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Petrol', 'પેટ્રોલ', 1),
  ('f1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Diesel', 'ડીઝલ',  2);

insert into fuel_prices (station_id, fuel_type_id, sale_rate, effective_from) values
  ('11111111-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000001', 96.500, now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000002', 89.200, now() - interval '2 days');

insert into tanks (id, station_id, fuel_type_id, name, capacity_litres, opening_stock_litres, opening_stock_date) values
  ('11111111-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000001', 'Tank 1 Petrol', 10000, 5000, current_date - 1),
  ('11111111-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000002', 'Tank 2 Diesel', 15000, 8000, current_date - 1);

insert into nozzles (id, station_id, tank_id, fuel_type_id, name, sort_order) values
  ('11111111-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000001', 'P1', 1),
  ('11111111-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-00000000000b', 'f1111111-0000-0000-0000-000000000002', 'D1', 2);

insert into staff (id, station_id, name, name_gu, monthly_salary) values
  ('11111111-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111', 'Ramesh', 'રમેશ', 14000);

insert into customers (id, station_id, name, opening_balance, opening_balance_date, credit_limit) values
  ('c1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Shree Transport', 50000, current_date - 30, 200000);

insert into vehicles (id, station_id, customer_id, vehicle_number, driver_name) values
  ('c1111111-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000001', 'GJ01AB1234', 'Suresh');

-- A morning shift: the meters moved, 2 litres of petrol were test-drawn and
-- poured back into the tank.
insert into shifts (id, station_id, business_date, name, sort_order, status) values
  ('11111111-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', current_date, 'Morning', 1, 'open');

insert into nozzle_readings (station_id, shift_id, nozzle_id, staff_id, opening_reading, closing_reading, test_litres, sale_rate) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000011', '11111111-0000-0000-0000-00000000000f', 1000, 1200, 2, 96.500),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-00000000000f', 5000, 5500, 0, 89.200);

-- 300 of those diesel litres went out on udhaar, they are not extra sales.
insert into credit_sales (station_id, business_date, shift_id, customer_id, vehicle_id, vehicle_number, fuel_type_id, nozzle_id, staff_id, litres, sale_rate, slip_number) values
  ('11111111-1111-1111-1111-111111111111', current_date, '11111111-0000-0000-0000-0000000000c1', 'c1111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-00000000000e', 'GJ01AB1234', 'f1111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-00000000000f', 300, 89.200, 'S-001');

insert into shift_collections (station_id, shift_id, staff_id, cash_amount, upi_amount) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000f', 30000, 6947);

insert into expenses (station_id, business_date, category, description, amount, mode) values
  ('11111111-1111-1111-1111-111111111111', current_date, 'Repairs', 'Nozzle hose', 500, 'cash');

insert into payments (station_id, customer_id, payment_date, amount, mode, reference) values
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000001', current_date, 20000, 'cash', 'received at pump');

insert into bank_deposits (station_id, deposit_date, bank_name, amount, slip_reference, deposited_by) values
  ('11111111-1111-1111-1111-111111111111', current_date, 'Bank of Baroda', 40000, 'SLIP-77', 'aaaaaaaa-0000-0000-0000-000000000003');

-- A tanker came in, and its cost is recorded separately (owner eyes only).
insert into fuel_purchases (id, station_id, tank_id, fuel_type_id, delivery_date, tanker_number, litres) values
  ('11111111-0000-0000-0000-0000000000ab', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-00000000000b', 'f1111111-0000-0000-0000-000000000002', current_date, 'GJ18TT9999', 6000);
insert into fuel_purchase_costs (purchase_id, station_id, supplier, rate_per_litre, amount) values
  ('11111111-0000-0000-0000-0000000000ab', '11111111-1111-1111-1111-111111111111', 'IOCL', 84.000, 504000);

insert into day_closings (station_id, business_date, opening_cash, counted_cash, status) values
  ('11111111-1111-1111-1111-111111111111', current_date, 0, 9500, 'submitted');

-- The other pump, so isolation has something to fail against.
insert into customers (station_id, name) values
  ('22222222-2222-2222-2222-222222222222', 'Rival Roadlines');
