-- ============================================================================
--  What a customer took, whether or not it was udhaar.
--
--  credit_sales means one thing only: fuel given on credit, still owed, and
--  that meaning is load-bearing — cash expected = meter sales − credit sales
--  is the first rule in this whole app, and it only holds because credit_sales
--  never contains anything that was actually paid for. Recording a cash sale
--  the same way would quietly subtract real money out of the cash box's own
--  expected total, the exact bug that rule exists to prevent.
--
--  So a regular customer paying cash on the spot gets a second table, not a
--  flag on the first one: cash_sales. Same shape as credit_sales — same
--  customer, vehicle, fuel, quantity, rate, shift — but it owes nothing,
--  bills nothing, and no existing balance, ageing or day_summary arithmetic
--  reads it. It exists for one reason only: so "what has this customer ever
--  taken from us" has an honest answer, udhaar and paid both, the way the
--  pump has always kept it on paper.
-- ============================================================================

create table cash_sales (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade
                   default auth_station_id(),
  business_date  date not null default pump_day(),
  shift_id       uuid references shifts(id) on delete set null,
  customer_id    uuid not null references customers(id) on delete restrict,
  vehicle_id     uuid references vehicles(id) on delete set null,
  vehicle_number text,
  fuel_type_id   uuid not null references fuel_types(id) on delete restrict,
  nozzle_id      uuid references nozzles(id) on delete set null,
  staff_id       uuid references staff(id) on delete set null,
  slip_number    text,
  driver_name    text,
  quantity       numeric(14,3) not null check (quantity > 0),
  sale_rate      numeric(10,3) not null check (sale_rate > 0),
  amount numeric(14,2) generated always as (round(quantity * sale_rate, 2)) stored,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index cash_sales_customer_idx on cash_sales (station_id, customer_id, business_date);

comment on table cash_sales is
  'A named customer''s purchase, paid in full on the spot. Never owed, never '
  'billed, never read by v_customer_balances, v_customer_ageing or '
  'day_summary() — the cash is already inside meter sales and the cash '
  'counted, exactly like any other cash sale. This table exists only so the '
  'customer''s own history shows it, the same place the udhaar does.';

-- ------------------------------------------------------------------- RLS ---
-- Same shape as credit_sales: back office sees and writes everything, the
-- counter reads and writes today's and yesterday's while the shift is not
-- approved. No invoice_id to gate on here — this never reaches a bill.
alter table cash_sales enable row level security;

create policy cash_sales_back_office on cash_sales for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());

create policy cash_sales_counter_read on cash_sales for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= pump_day() - 1);

create policy cash_sales_counter_write on cash_sales for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date = pump_day());

create policy cash_sales_counter_update on cash_sales for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= pump_day() - 1
         and exists (select 1 from shifts s
                     where s.id = cash_sales.shift_id and s.status <> 'approved'))
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date >= pump_day() - 1
              and exists (select 1 from shifts s
                          where s.id = cash_sales.shift_id and s.status <> 'approved'));

-- A cash sale names its shift exactly as an udhaar slip does — the same
-- trigger, since it only ever reads new.station_id/business_date/shift_id.
create trigger cash_sales_attach_shift
  before insert or update of business_date on cash_sales
  for each row execute function attach_slip_to_shift();

create trigger cash_sales_audit after insert or update or delete
  on cash_sales for each row execute function audit_write();
