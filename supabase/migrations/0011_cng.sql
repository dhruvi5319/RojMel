-- ============================================================================
--  CNG.
--
--  It behaves like petrol and diesel in every way that touches money, and like
--  nothing else in every way that touches stock:
--
--    · sold by the KILOGRAM, not the litre
--    · supplied by Gujarat Gas down a pipeline, metered in SCM at the inlet —
--      no tanker, no decanting, no dip
--    · what is not sold is compression and line loss, not a tank shortage
--
--  So CNG gets its own dispensers, its own readings and its own supply book,
--  and its sales are folded into the same day_summary as the liquid fuels.
--  The pump's day must tally as one day, whatever the fuel was measured in.
-- ============================================================================

-- A fuel now knows what it is measured in.
alter table fuel_types
  add column if not exists unit text not null default 'L'
    check (unit in ('L', 'kg'));

comment on column fuel_types.unit is
  'L for liquid fuels held in tanks, kg for CNG.';

-- A credit slip can be for CNG, so its quantity is no longer always litres.
alter table credit_sales rename column litres to quantity;
comment on column credit_sales.quantity is
  'In the fuel type''s unit — litres for petrol and diesel, kilograms for CNG.';

-- --------------------------------------------------------- the machines ----
create table if not exists cng_dispensers (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id) on delete cascade
                 default auth_station_id(),
  fuel_type_id uuid not null references fuel_types(id) on delete restrict,
  name         text not null,
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  unique (station_id, name)
);

-- Same shape as a nozzle reading, counted in kilograms.
create table if not exists cng_readings (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id) on delete cascade
                    default auth_station_id(),
  shift_id        uuid not null references shifts(id) on delete cascade,
  dispenser_id    uuid not null references cng_dispensers(id) on delete restrict,
  staff_id        uuid references staff(id) on delete set null,
  opening_reading numeric(14,3) not null,
  closing_reading numeric(14,3) not null,
  test_kg         numeric(10,3) not null default 0,
  sale_rate       numeric(10,3) not null,
  kg numeric(14,3)
    generated always as (closing_reading - opening_reading - test_kg) stored,
  amount numeric(14,2)
    generated always as (round((closing_reading - opening_reading - test_kg) * sale_rate, 2)) stored,
  created_at      timestamptz not null default now(),
  unique (shift_id, dispenser_id),
  check (closing_reading >= opening_reading),
  check (test_kg >= 0)
);

-- ------------------------------------------------------ what came in -------
-- Gujarat Gas bills the inlet in standard cubic metres; the pump sells kilos.
create table if not exists cng_supply (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade
                   default auth_station_id(),
  supply_date    date not null default current_date,
  opening_scm    numeric(14,3),
  closing_scm    numeric(14,3),
  scm_received   numeric(14,3) not null check (scm_received >= 0),
  invoice_number text,
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  unique (station_id, supply_date)
);

-- The money side, owner-only, exactly as with liquid fuel purchases.
create table if not exists cng_supply_costs (
  supply_id    uuid primary key references cng_supply(id) on delete cascade,
  station_id   uuid not null references stations(id) on delete cascade
                 default auth_station_id(),
  supplier     text default 'Gujarat Gas',
  rate_per_scm numeric(10,3) not null default 0,
  basic_amount numeric(14,2),
  vat_rate     numeric(6,3),
  vat_amount   numeric(14,2),
  amount       numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS ------
alter table cng_dispensers enable row level security;
alter table cng_readings   enable row level security;
alter table cng_supply     enable row level security;
alter table cng_supply_costs enable row level security;

create policy cng_dispensers_back_office on cng_dispensers for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());
create policy cng_readings_back_office on cng_readings for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());
create policy cng_supply_back_office on cng_supply for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());

-- The cost of gas is margin, so it stays where the manager cannot read it.
create policy cng_costs_owner on cng_supply_costs for all to authenticated
  using (station_id = auth_station_id() and is_owner())
  with check (station_id = auth_station_id() and is_owner());

-- The counter device reads the dispensers and writes readings for an open
-- shift, the same licence it has over the liquid nozzles.
create policy cng_dispensers_counter_read on cng_dispensers for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter');
create policy cng_readings_counter_read on cng_readings for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.business_date >= current_date - 1));
create policy cng_readings_counter_write on cng_readings for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status = 'open'));
create policy cng_readings_counter_update on cng_readings for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s where s.id = shift_id and s.status = 'open'))
  with check (station_id = auth_station_id() and auth_role() = 'counter');

grant select, insert, update, delete
  on cng_dispensers, cng_readings, cng_supply, cng_supply_costs to authenticated;

-- An approved day locks CNG readings too. The guard finds a row's business
-- date through its shift, so it has to learn this table's name.
create or replace function guard_locked_day() returns trigger
  language plpgsql as $fn$
declare
  v_date date;
  v_row  record;
begin
  v_row := coalesce(new, old);

  if tg_table_name in ('nozzle_readings', 'shift_collections', 'cng_readings') then
    select business_date into v_date from shifts where id = v_row.shift_id;
  elsif tg_table_name in ('payments', 'staff_payments') then
    v_date := v_row.payment_date;
  elsif tg_table_name = 'bank_deposits' then
    v_date := v_row.deposit_date;
  else
    v_date := v_row.business_date;
  end if;

  if v_date is not null and day_is_locked(v_date) and not is_owner() then
    raise exception
      'The books for % are approved and locked. Ask an owner to reopen the day.', v_date
      using errcode = 'check_violation';
  end if;

  return v_row;
end
$fn$;

create trigger cng_readings_locked_day
  before insert or update or delete on cng_readings
  for each row execute function guard_locked_day();

-- --------------------------------------- what the entry screen needs -------
create or replace view v_cng_state with (security_invoker = true) as
select
  d.id            as dispenser_id,
  d.station_id,
  d.name,
  d.sort_order,
  d.fuel_type_id,
  ft.name         as fuel_name,
  ft.name_gu      as fuel_name_gu,
  current_rate(d.fuel_type_id)     as sale_rate,
  coalesce(lr.closing_reading, 0)  as last_closing,
  lr.business_date                 as last_reading_date
from cng_dispensers d
join fuel_types ft on ft.id = d.fuel_type_id
left join lateral (
  select cr.closing_reading, s.business_date
    from cng_readings cr
    join shifts s on s.id = cr.shift_id
   where cr.dispenser_id = d.id
   order by s.business_date desc, s.sort_order desc, cr.created_at desc
   limit 1
) lr on true
where d.is_active;

revoke insert, update, delete on v_cng_state from authenticated;
