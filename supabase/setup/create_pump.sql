-- ============================================================================
--  Run this ONCE, after the migrations, to create your pump and its people.
--
--  Before running it:
--    1. In Supabase, go to Authentication -> Users -> Add user, and create a
--       login for each person: your father, your brother, the manager, and one
--       for the shared counter device (e.g. counter@yourpump.in).
--       Tick "Auto Confirm User" so they can sign in straight away.
--    2. Edit the values in the `pump` and `people` blocks below.
--    3. Paste the whole file into the SQL editor and run it.
-- ============================================================================

do $$
declare
  v_station uuid;
  v_petrol  uuid;
  v_diesel  uuid;
  v_tank_p  uuid;
  v_tank_d  uuid;

  -- ------------------------------------------------------------- pump ----
  -- Change these to your pump's real details.
  c_name    text := 'Rathod Petroleum';
  c_legal   text := 'Rathod Petroleum';
  c_address text := 'Highway Road';
  c_city    text := 'Rajkot';
  c_state   text := 'Gujarat';
  c_pin     text := '360001';
  c_gstin   text := NULL;
  c_phone   text := NULL;
  c_prefix  text := 'RP';        -- invoices read RP/2026-27/0001

  -- ----------------------------------------------------------- people ----
  -- Use the exact email addresses you created in Authentication -> Users.
  c_owner_1_email   text := 'father@example.com';
  c_owner_1_name    text := 'Father';
  c_owner_2_email   text := 'brother@example.com';   -- NULL if not needed
  c_owner_2_name    text := 'Brother';
  c_manager_email   text := 'manager@example.com';
  c_manager_name    text := 'Manager';
  c_counter_email   text := 'counter@example.com';   -- the shared device
  c_counter_name    text := 'Pump counter';

  -- ------------------------------------------------------------ fuels ----
  c_petrol_rate numeric := 96.500;   -- today's selling rate
  c_diesel_rate numeric := 89.200;

  -- ------------------------------------------------------------ tanks ----
  c_petrol_capacity numeric := 10000;
  c_diesel_capacity numeric := 15000;
  c_petrol_opening  numeric := 0;    -- litres in the tank as of today
  c_diesel_opening  numeric := 0;
begin
  ---------------------------------------------------------------- station --
  insert into stations (name, legal_name, address, city, state, pincode,
                        gstin, phone, invoice_prefix)
  values (c_name, c_legal, c_address, c_city, c_state, c_pin,
          c_gstin, c_phone, c_prefix)
  returning id into v_station;

  ---------------------------------------------------------------- people --
  insert into profiles (id, station_id, full_name, role)
  select u.id, v_station, c_owner_1_name, 'owner'
    from auth.users u where u.email = c_owner_1_email;

  if c_owner_2_email is not null then
    insert into profiles (id, station_id, full_name, role)
    select u.id, v_station, c_owner_2_name, 'owner'
      from auth.users u where u.email = c_owner_2_email;
  end if;

  insert into profiles (id, station_id, full_name, role)
  select u.id, v_station, c_manager_name, 'manager'
    from auth.users u where u.email = c_manager_email;

  insert into profiles (id, station_id, full_name, role)
  select u.id, v_station, c_counter_name, 'counter'
    from auth.users u where u.email = c_counter_email;

  if not exists (select 1 from profiles where station_id = v_station and role = 'owner') then
    raise exception
      'No owner was created. Check that % exists under Authentication -> Users.',
      c_owner_1_email;
  end if;

  ----------------------------------------------------------------- fuels --
  insert into fuel_types (station_id, name, name_gu, sort_order, color)
  values (v_station, 'Petrol', 'પેટ્રોલ', 1, '#16a34a')
  returning id into v_petrol;

  insert into fuel_types (station_id, name, name_gu, sort_order, color)
  values (v_station, 'Diesel', 'ડીઝલ', 2, '#0f6b4f')
  returning id into v_diesel;

  insert into fuel_prices (station_id, fuel_type_id, sale_rate)
  values (v_station, v_petrol, c_petrol_rate),
         (v_station, v_diesel, c_diesel_rate);

  ----------------------------------------------------------------- tanks --
  insert into tanks (station_id, fuel_type_id, name, capacity_litres,
                     opening_stock_litres, opening_stock_date)
  values (v_station, v_petrol, 'Tank 1 Petrol', c_petrol_capacity,
          c_petrol_opening, current_date)
  returning id into v_tank_p;

  insert into tanks (station_id, fuel_type_id, name, capacity_litres,
                     opening_stock_litres, opening_stock_date)
  values (v_station, v_diesel, 'Tank 2 Diesel', c_diesel_capacity,
          c_diesel_opening, current_date)
  returning id into v_tank_d;

  --------------------------------------------------------------- nozzles --
  insert into nozzles (station_id, tank_id, fuel_type_id, name, sort_order)
  values (v_station, v_tank_p, v_petrol, 'P1', 1),
         (v_station, v_tank_p, v_petrol, 'P2', 2),
         (v_station, v_tank_d, v_diesel, 'D1', 3),
         (v_station, v_tank_d, v_diesel, 'D2', 4);

  raise notice 'Created % with % people.', c_name,
    (select count(*) from profiles where station_id = v_station);
end
$$;
