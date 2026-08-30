-- ============================================================================
--  Row level security
--
--  Three roles:
--    owner    — father and brother. Sees everything, including cost/margin.
--    manager  — billing, customers, prices, bank deposits. NO cost/margin.
--    counter  — the shared device at the pump. Can log readings and credit
--               slips only; sees no money beyond the slip it is writing.
-- ============================================================================

-- ------------------------------------------------------------- helpers ----
-- security definer so policies can read profiles without recursing into
-- the policy on profiles itself.

create or replace function auth_station_id() returns uuid
  language sql stable security definer set search_path = public as $fn$
  select station_id from profiles where id = auth.uid() and is_active
$fn$;

create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $fn$
  select role from profiles where id = auth.uid() and is_active
$fn$;

create or replace function is_owner() returns boolean
  language sql stable security definer set search_path = public as $fn$
  select coalesce((select role from profiles where id = auth.uid() and is_active) = 'owner', false)
$fn$;

create or replace function is_back_office() returns boolean
  language sql stable security definer set search_path = public as $fn$
  select coalesce((select role from profiles where id = auth.uid() and is_active)
                  in ('owner','manager'), false)
$fn$;

grant execute on function auth_station_id, auth_role, is_owner, is_back_office to authenticated;

-- ------------------------------------------------ stations and profiles ---
alter table stations enable row level security;
alter table profiles enable row level security;

create policy stations_read on stations for select to authenticated
  using (id = auth_station_id());
create policy stations_owner_write on stations for update to authenticated
  using (id = auth_station_id() and is_owner())
  with check (id = auth_station_id() and is_owner());

create policy profiles_read on profiles for select to authenticated
  using (station_id = auth_station_id());
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = auth_role());
create policy profiles_owner_write on profiles for all to authenticated
  using (station_id = auth_station_id() and is_owner())
  with check (station_id = auth_station_id() and is_owner());

-- ------------------------------- back-office tables (owner + manager) ------
do $do$
declare t text;
begin
  foreach t in array array[
    'fuel_types','fuel_prices','tanks','nozzles','staff','shifts',
    'nozzle_readings','shift_collections','customers','vehicles',
    'invoices','credit_sales','payments','fuel_purchases','tank_dips',
    'expenses','staff_payments','bank_deposits','day_closings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (station_id = auth_station_id() and is_back_office()) '
      'with check (station_id = auth_station_id() and is_back_office())',
      t || '_back_office', t);
  end loop;
end
$do$;

-- ------------------------------------------- owner only: purchase cost ----
-- This table is the whole reason margin stays hidden from the manager.
alter table fuel_purchase_costs enable row level security;
create policy purchase_costs_owner on fuel_purchase_costs for all to authenticated
  using (station_id = auth_station_id() and is_owner())
  with check (station_id = auth_station_id() and is_owner());

-- ------------------------------------------------ the counter device ------
-- Reference data it needs to render the entry screens.
do $do$
declare t text;
begin
  foreach t in array array[
    'fuel_types','fuel_prices','tanks','nozzles','staff','customers','vehicles'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated '
      'using (station_id = auth_station_id() and auth_role() = ''counter'')',
      t || '_counter_read', t);
  end loop;
end
$do$;

-- Shifts: the counter can open one and see today's, but not approve.
create policy shifts_counter_read on shifts for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= current_date - 1);
create policy shifts_counter_insert on shifts for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date = current_date and status = 'open');

-- Readings and collections: write for an open shift only.
create policy readings_counter_read on nozzle_readings for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.business_date >= current_date - 1));
create policy readings_counter_write on nozzle_readings for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status = 'open'));
create policy readings_counter_update on nozzle_readings for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s where s.id = shift_id and s.status = 'open'))
  with check (station_id = auth_station_id() and auth_role() = 'counter');

create policy collections_counter_read on shift_collections for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.business_date >= current_date - 1));
create policy collections_counter_write on shift_collections for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status = 'open'));
create policy collections_counter_update on shift_collections for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s where s.id = shift_id and s.status = 'open'))
  with check (station_id = auth_station_id() and auth_role() = 'counter');

-- Credit slips: the counter writes them and can see today's, nothing older,
-- and never the customer's running balance.
create policy credit_counter_read on credit_sales for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= current_date - 1);
create policy credit_counter_write on credit_sales for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date = current_date and invoice_id is null);

-- --------------------------------------------------------- audit trail ----
alter table audit_log enable row level security;
create policy audit_read on audit_log for select to authenticated
  using (station_id = auth_station_id() and is_owner());
create policy audit_write on audit_log for insert to authenticated
  with check (station_id = auth_station_id());
