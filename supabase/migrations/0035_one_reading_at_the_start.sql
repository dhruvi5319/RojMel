-- ============================================================================
--  One reading per nozzle, taken at the start of the shift.
--
--  How it is actually done: at 7am and again at 7pm, any filler from the shift
--  coming on walks the forecourt and writes down what every nozzle says. That
--  single set of numbers is two things at once — the opening of the shift
--  starting and the closing of the shift ending — and the app should take it
--  once and put it in both places, rather than asking for a closing figure
--  that has already been written down next door.
--
--  closing_reading cannot be null and may not be below opening, so a shift
--  that has only just started carries closing = opening: nothing sold yet.
--  The next shift's reading is what closes it.
-- ============================================================================

create or replace function record_meter_reading(
  p_shift_id uuid,
  p_nozzles  jsonb default '[]'::jsonb,
  p_cng      jsonb default '[]'::jsonb,
  p_staff_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_shift  shifts;
  v_prev   uuid;
  v_closed int := 0;
  v_taken  int := 0;
  r        record;
begin
  select * into v_shift from shifts where id = p_shift_id;
  if v_shift.id is null or v_shift.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_shift.status = 'approved' then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;

  -- The shift this reading closes: the one before it on the same day, else
  -- the last one of the day before.
  select s.id into v_prev
    from shifts s
   where s.station_id = v_shift.station_id
     and (s.business_date, s.sort_order) < (v_shift.business_date, v_shift.sort_order)
     and s.status <> 'approved'
   order by s.business_date desc, s.sort_order desc
   limit 1;

  -- ------------------------------------------------------------ nozzles --
  for r in select (e ->> 'nozzle_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_nozzles, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into nozzle_readings (station_id, shift_id, nozzle_id, staff_id,
                                 opening_reading, closing_reading, sale_rate)
    select v_shift.station_id, p_shift_id, r.id, p_staff_id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0)
      from nozzles nz
      left join v_fuel_rates fr on fr.fuel_type_id = nz.fuel_type_id
     where nz.id = r.id
    on conflict (shift_id, nozzle_id) do update
      set opening_reading = excluded.opening_reading,
          closing_reading = greatest(nozzle_readings.closing_reading,
                                     excluded.opening_reading),
          staff_id        = coalesce(excluded.staff_id, nozzle_readings.staff_id);
    v_taken := v_taken + 1;

    -- The same number closes the shift that has just ended.
    if v_prev is not null then
      update nozzle_readings
         set closing_reading = r.reading
       where shift_id = v_prev and nozzle_id = r.id
         and r.reading >= opening_reading;
      v_closed := v_closed + 1;
    end if;
  end loop;

  -- ---------------------------------------------------------------- CNG --
  for r in select (e ->> 'dispenser_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_cng, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into cng_readings (station_id, shift_id, dispenser_id, staff_id,
                              opening_reading, closing_reading, sale_rate)
    select v_shift.station_id, p_shift_id, r.id, p_staff_id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0)
      from cng_dispensers d
      left join v_fuel_rates fr on fr.fuel_type_id = d.fuel_type_id
     where d.id = r.id
    on conflict (shift_id, dispenser_id) do update
      set opening_reading = excluded.opening_reading,
          closing_reading = greatest(cng_readings.closing_reading,
                                     excluded.opening_reading),
          staff_id        = coalesce(excluded.staff_id, cng_readings.staff_id);
    v_taken := v_taken + 1;

    if v_prev is not null then
      update cng_readings
         set closing_reading = r.reading
       where shift_id = v_prev and dispenser_id = r.id
         and r.reading >= opening_reading;
    end if;
  end loop;

  return jsonb_build_object('taken', v_taken, 'closed_previous', v_closed > 0);
end
$fn$;

grant execute on function record_meter_reading(uuid, jsonb, jsonb, uuid) to authenticated;

-- ------------------------------------- every meter, and what it last read --
-- What the filler walks the forecourt with: one line per nozzle and per CNG
-- point, in a fixed order, showing what it read when the shift began.
create or replace view v_shift_meters with (security_invoker = true) as
select
  s.id                                   as shift_id,
  s.station_id,
  'nozzle'::text                         as kind,
  nz.id                                  as meter_id,
  nz.name,
  ft.name                                as fuel_name,
  ft.unit,
  nz.sort_order,
  nr.opening_reading,
  nr.closing_reading,
  nr.litres                              as quantity
from shifts s
join nozzles nz on nz.station_id = s.station_id and nz.is_active
join fuel_types ft on ft.id = nz.fuel_type_id
left join nozzle_readings nr on nr.shift_id = s.id and nr.nozzle_id = nz.id
union all
select
  s.id,
  s.station_id,
  'cng',
  d.id,
  d.name,
  ft.name,
  ft.unit,
  d.sort_order,
  cr.opening_reading,
  cr.closing_reading,
  cr.kg
from shifts s
join cng_dispensers d on d.station_id = s.station_id and d.is_active
join fuel_types ft on ft.id = d.fuel_type_id
left join cng_readings cr on cr.shift_id = s.id and cr.dispenser_id = d.id;

revoke insert, update, delete on v_shift_meters from authenticated;
grant select on v_shift_meters to authenticated;
