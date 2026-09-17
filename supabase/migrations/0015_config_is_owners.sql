-- ============================================================================
--  The pump's equipment belongs to the owner; the day's price belongs to the
--  manager.
--
--  Fuels, tanks, nozzles and CNG dispensers describe the physical pump, and
--  changing one silently changes what every future reading means. So they
--  become owner-only to write, and everybody else reads them.
--
--  fuel_prices is deliberately NOT in that list. Pump prices move daily and
--  the manager sets them — that stays hers.
-- ============================================================================

do $do$
declare t text;
begin
  foreach t in array array['fuel_types', 'tanks', 'nozzles', 'cng_dispensers'] loop
    -- the old owner-or-manager policy
    execute format('drop policy if exists %I on %I', t || '_back_office', t);

    execute format(
      'create policy %I on %I for select to authenticated '
      'using (station_id = auth_station_id() and is_back_office())',
      t || '_read', t);

    execute format(
      'create policy %I on %I for all to authenticated '
      'using (station_id = auth_station_id() and is_owner()) '
      'with check (station_id = auth_station_id() and is_owner())',
      t || '_owner_write', t);
  end loop;
end
$do$;

-- A nozzle or tank that has already priced a sale must not vanish, or the
-- history stops adding up. Retiring one is what `is_active` is for.
create or replace function block_delete_if_used() returns trigger
  language plpgsql as $fn$
declare v_used boolean;
begin
  if tg_table_name = 'nozzles' then
    select exists (select 1 from nozzle_readings where nozzle_id = old.id) into v_used;
  elsif tg_table_name = 'tanks' then
    select exists (select 1 from fuel_purchases where tank_id = old.id)
        or exists (select 1 from nozzles where tank_id = old.id) into v_used;
  elsif tg_table_name = 'cng_dispensers' then
    select exists (select 1 from cng_readings where dispenser_id = old.id) into v_used;
  elsif tg_table_name = 'fuel_types' then
    select exists (select 1 from nozzles where fuel_type_id = old.id)
        or exists (select 1 from credit_sales where fuel_type_id = old.id) into v_used;
  end if;

  if v_used then
    raise exception
      'This % has already been used, so it cannot be deleted. Mark it out of use instead.',
      replace(tg_table_name, '_', ' ')
      using errcode = 'check_violation';
  end if;

  return old;
end
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['fuel_types', 'tanks', 'nozzles', 'cng_dispensers'] loop
    execute format('drop trigger if exists %I on %I', t || '_no_delete_if_used', t);
    execute format(
      'create trigger %I before delete on %I '
      'for each row execute function block_delete_if_used()',
      t || '_no_delete_if_used', t);
  end loop;
end
$do$;
