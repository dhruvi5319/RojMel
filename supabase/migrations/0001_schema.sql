-- ============================================================================
--  Petrol Pump Management — core schema
--  Postgres / Supabase
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
create type user_role          as enum ('owner', 'manager', 'counter');
create type shift_status       as enum ('open', 'submitted', 'approved');
create type day_status         as enum ('draft', 'submitted', 'approved');
create type payment_mode       as enum ('cash', 'upi', 'card', 'cheque', 'bank_transfer');
create type invoice_status     as enum ('draft', 'issued', 'partly_paid', 'paid', 'cancelled');
create type staff_payment_type as enum ('salary', 'advance', 'bonus', 'deduction');

-- ------------------------------------------------------------- station ----
create table stations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  legal_name     text,
  address        text,
  city           text,
  state          text,
  pincode        text,
  gstin          text,
  phone          text,
  invoice_prefix text not null default 'INV',
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------- profiles (logins) ----
-- Owner (father, brother), manager, and the shared counter device.
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  full_name  text not null,
  phone      text,
  role       user_role not null default 'manager',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index profiles_station_idx on profiles (station_id);

-- ------------------------------------------------- staff (the fillers) ----
-- Fillers do not have their own logins. They pick their name on the shared
-- counter device; the optional pin is a light guard, not real auth.
create table staff (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade,
  name           text not null,
  name_gu        text,
  phone          text,
  pin            text,
  monthly_salary numeric(12,2) not null default 0,
  joined_on      date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index staff_station_idx on staff (station_id) where is_active;

-- ----------------------------------------------------------- fuel types ---
create table fuel_types (
  id         uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  name       text not null,
  name_gu    text,
  color      text not null default '#16a34a',
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  unique (station_id, name)
);

-- Selling rate history. Manager may set these.
create table fuel_prices (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade,
  fuel_type_id   uuid not null references fuel_types(id) on delete cascade,
  sale_rate      numeric(10,3) not null check (sale_rate > 0),
  effective_from timestamptz not null default now(),
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index fuel_prices_lookup_idx
  on fuel_prices (station_id, fuel_type_id, effective_from desc);

-- ------------------------------------------------------ tanks & nozzles ---
create table tanks (
  id                   uuid primary key default gen_random_uuid(),
  station_id           uuid not null references stations(id) on delete cascade,
  fuel_type_id         uuid not null references fuel_types(id) on delete restrict,
  name                 text not null,
  capacity_litres      numeric(12,2) not null default 0,
  opening_stock_litres numeric(12,3) not null default 0,
  opening_stock_date   date,
  is_active            boolean not null default true,
  unique (station_id, name)
);

create table nozzles (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id) on delete cascade,
  tank_id      uuid not null references tanks(id) on delete restrict,
  fuel_type_id uuid not null references fuel_types(id) on delete restrict,
  name         text not null,
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  unique (station_id, name)
);

-- ------------------------------------------------------------- shifts -----
create table shifts (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id) on delete cascade,
  business_date date not null,
  name          text not null,
  sort_order    int  not null default 0,
  status        shift_status not null default 'open',
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  created_by    uuid references profiles(id),
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  notes         text,
  unique (station_id, business_date, name)
);
create index shifts_date_idx on shifts (station_id, business_date desc);

-- Meter readings, one row per nozzle per shift. This is the daily book.
create table nozzle_readings (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id) on delete cascade,
  shift_id        uuid not null references shifts(id) on delete cascade,
  nozzle_id       uuid not null references nozzles(id) on delete restrict,
  staff_id        uuid references staff(id) on delete set null,
  opening_reading numeric(14,3) not null,
  closing_reading numeric(14,3) not null,
  test_litres     numeric(10,3) not null default 0,
  sale_rate       numeric(10,3) not null,
  litres numeric(14,3)
    generated always as (closing_reading - opening_reading - test_litres) stored,
  amount numeric(14,2)
    generated always as (round((closing_reading - opening_reading - test_litres) * sale_rate, 2)) stored,
  created_at      timestamptz not null default now(),
  unique (shift_id, nozzle_id),
  check (closing_reading >= opening_reading),
  check (test_litres >= 0)
);

-- What each filler actually handed over at the end of their shift.
create table shift_collections (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id) on delete cascade,
  shift_id    uuid not null references shifts(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  cash_amount numeric(14,2) not null default 0,
  upi_amount  numeric(14,2) not null default 0,
  card_amount numeric(14,2) not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (shift_id, staff_id)
);

-- ------------------------------------------- credit customers (udhaar) ----
create table customers (
  id                   uuid primary key default gen_random_uuid(),
  station_id           uuid not null references stations(id) on delete cascade,
  name                 text not null,
  contact_person       text,
  phone                text,
  email                text,
  address              text,
  gstin                text,
  credit_limit         numeric(14,2) not null default 0,
  opening_balance      numeric(14,2) not null default 0,
  opening_balance_date date,
  is_active            boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  unique (station_id, name)
);

create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  vehicle_number text not null,
  driver_name text,
  is_active   boolean not null default true,
  unique (station_id, vehicle_number)
);

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete restrict,
  invoice_number text not null,
  period_from    date not null,
  period_to      date not null,
  issue_date     date not null default current_date,
  due_date       date,
  subtotal       numeric(14,2) not null default 0,
  tax_rate       numeric(6,3)  not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  round_off      numeric(8,2)  not null default 0,
  total          numeric(14,2) not null default 0,
  status         invoice_status not null default 'draft',
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  unique (station_id, invoice_number),
  check (period_to >= period_from)
);
create index invoices_customer_idx on invoices (station_id, customer_id, issue_date desc);

-- One row per fuel slip issued on credit.
create table credit_sales (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade,
  business_date  date not null default current_date,
  shift_id       uuid references shifts(id) on delete set null,
  customer_id    uuid not null references customers(id) on delete restrict,
  vehicle_id     uuid references vehicles(id) on delete set null,
  vehicle_number text,
  fuel_type_id   uuid not null references fuel_types(id) on delete restrict,
  nozzle_id      uuid references nozzles(id) on delete set null,
  staff_id       uuid references staff(id) on delete set null,
  slip_number    text,
  driver_name    text,
  odometer       numeric(12,1),
  litres         numeric(12,3) not null check (litres > 0),
  sale_rate      numeric(10,3) not null check (sale_rate > 0),
  amount numeric(14,2) generated always as (round(litres * sale_rate, 2)) stored,
  invoice_id     uuid references invoices(id) on delete set null,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index credit_sales_customer_idx on credit_sales (station_id, customer_id, business_date);
create index credit_sales_unbilled_idx on credit_sales (station_id, customer_id) where invoice_id is null;

create table payments (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete restrict,
  invoice_id   uuid references invoices(id) on delete set null,
  payment_date date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  mode         payment_mode not null default 'cash',
  reference    text,
  notes        text,
  recorded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index payments_customer_idx on payments (station_id, customer_id, payment_date desc);

-- ------------------------------------------------- stock: in and out ------
-- The delivery itself. Manager may record this (she receives the tanker).
create table fuel_purchases (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id) on delete cascade,
  tank_id       uuid not null references tanks(id) on delete restrict,
  fuel_type_id  uuid not null references fuel_types(id) on delete restrict,
  delivery_date date not null default current_date,
  tanker_number text,
  litres        numeric(12,3) not null check (litres > 0),
  density       numeric(6,3),
  received_by   uuid references staff(id) on delete set null,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index fuel_purchases_tank_idx on fuel_purchases (station_id, tank_id, delivery_date);

-- The money side of a delivery, split out so RLS can keep it owner-only.
-- The manager must not see purchase cost (it reveals margin).
create table fuel_purchase_costs (
  purchase_id      uuid primary key references fuel_purchases(id) on delete cascade,
  station_id       uuid not null references stations(id) on delete cascade,
  supplier         text,
  invoice_number   text,
  invoice_date     date,
  rate_per_litre   numeric(10,3) not null default 0,
  amount           numeric(14,2) not null default 0,
  created_at       timestamptz not null default now()
);

create table tank_dips (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id) on delete cascade,
  tank_id       uuid not null references tanks(id) on delete cascade,
  business_date date not null,
  dip_litres    numeric(12,3) not null check (dip_litres >= 0),
  recorded_by   uuid references profiles(id),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (station_id, tank_id, business_date)
);

-- ------------------------------------------------ expenses & staff pay ----
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id) on delete cascade,
  business_date date not null default current_date,
  category      text not null,
  description   text,
  amount        numeric(14,2) not null check (amount > 0),
  mode          payment_mode not null default 'cash',
  paid_to       text,
  recorded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index expenses_date_idx on expenses (station_id, business_date desc);

create table staff_payments (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete restrict,
  payment_date date not null default current_date,
  type         staff_payment_type not null default 'salary',
  amount       numeric(14,2) not null check (amount > 0),
  period_month date,
  mode         payment_mode not null default 'cash',
  notes        text,
  recorded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index staff_payments_idx on staff_payments (station_id, staff_id, payment_date desc);

-- ------------------------------------------------------- bank deposits ----
-- The manager takes the day's cash to the bank and logs the slip here.
create table bank_deposits (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade,
  deposit_date   date not null default current_date,
  bank_name      text not null,
  account_last4  text,
  amount         numeric(14,2) not null check (amount > 0),
  slip_reference text,
  deposited_by   uuid references profiles(id),
  notes          text,
  recorded_by    uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index bank_deposits_date_idx on bank_deposits (station_id, deposit_date desc);

-- ------------------------- day closing: manager submits, owner approves ---
create table day_closings (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id) on delete cascade,
  business_date date not null,
  opening_cash  numeric(14,2) not null default 0,
  counted_cash  numeric(14,2) not null default 0,
  status        day_status not null default 'draft',
  submitted_by  uuid references profiles(id),
  submitted_at  timestamptz,
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  notes         text,
  owner_remarks text,
  created_at    timestamptz not null default now(),
  unique (station_id, business_date)
);

-- ---------------------------------------------------------- audit trail ---
create table audit_log (
  id         bigserial primary key,
  station_id uuid references stations(id) on delete cascade,
  actor_id   uuid references profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_idx on audit_log (station_id, created_at desc);
