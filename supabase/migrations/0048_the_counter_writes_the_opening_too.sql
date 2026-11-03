-- ============================================================================
--  The counter writes the opening too, the one time it has to.
--
--  0047 put the pump's very first reading in the wrong hands: a baseline
--  typed once, in advance, under equipment. That assumed the owner is
--  standing at the pump when the first-ever shift starts, or can predict
--  the exact dial reading from an office chair before it does — neither is
--  true. The owner is not tending to be at the pump when any shift starts;
--  whoever is actually there is a filler, on the counter, and the real
--  number has to come from them, at the moment it happens, not from a form
--  filled in beforehand.
--
--  So this reverts 0047's equipment-side baseline entirely — the columns,
--  and both functions' coalesce onto them — and replaces it with one new
--  door, on the counter: record_shift_opening(). It only ever adds a row
--  that is not there yet (on conflict do nothing), so it can never
--  overwrite a real inherited opening, and it only matters for the one
--  nozzle, on the one shift, that has genuinely nothing to inherit from —
--  a brand new nozzle, or this pump's very first shift on it. Once that row
--  exists, record_shift_closing()'s own upsert does the rest exactly as it
--  already did: it updates closing_reading and leaves opening_reading, the
--  number the filler actually typed, untouched.
-- ============================================================================

alter table nozzles drop column if exists opening_reading;

-- v_cng_state reads cng_dispensers.opening_reading, so the view has to lose
-- the column before the table can — and create or replace cannot drop a
-- column from a view, only add one, so this one's a drop and a fresh create.
drop view if exists v_cng_state;
create view v_cng_state with (security_invoker = true) as
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
grant select on v_cng_state to authenticated;

alter table cng_dispensers drop column if exists opening_reading;

-- ---------------------------------------------- start_shift(), reverted ----
create or replace function start_shift(
  p_name     text,
  p_date     date default null,
  p_staff_id uuid default null,
  p_fillers  uuid[] default null
) returns shifts language plpgsql security definer set search_path = public as $fn$
declare
  v_row   shifts;
  v_date  date := coalesce(p_date, pump_day());
  v_order int;
  v_new   boolean := false;
begin
  v_order := case p_name when 'Day' then 1 when 'Night' then 2 end;
  if v_order is null then
    raise exception 'The pump runs a Day shift and a Night shift, not %.', p_name;
  end if;

  if not coalesce(auth_role() in ('owner', 'manager', 'counter'), false) then
    raise exception 'You do not have permission to start a shift.';
  end if;
  if auth_role() = 'counter' and v_date <> pump_day() then
    raise exception 'The counter can only start today''s shift.';
  end if;

  select * into v_row
    from shifts
   where station_id = auth_station_id()
     and business_date = v_date
     and name = p_name;

  if v_row.id is null then
    insert into shifts (station_id, business_date, name, sort_order, status,
                        opened_at, opened_by_staff, created_by)
    values (auth_station_id(), v_date, p_name, v_order, 'open',
            now(), p_staff_id, auth.uid())
    returning * into v_row;
    v_new := true;

  elsif v_row.status = 'approved' then
    raise exception 'That shift has been approved. Ask the office to reopen it.';

  else
    update shifts
       set status          = 'open',
           closed_at       = null,
           closed_by_staff = null,
           opened_by_staff = coalesce(opened_by_staff, p_staff_id)
     where id = v_row.id
    returning * into v_row;
  end if;

  if v_new then
    insert into nozzle_readings (station_id, shift_id, nozzle_id,
                                 opening_reading, closing_reading, sale_rate)
    select v_row.station_id, v_row.id, nz.id, prev.closing_reading, prev.closing_reading,
           coalesce(fr.sale_rate, 0)
      from nozzles nz
      left join v_fuel_rates fr on fr.fuel_type_id = nz.fuel_type_id
      left join lateral (
        select nr.closing_reading
          from nozzle_readings nr
          join shifts s2 on s2.id = nr.shift_id
         where s2.station_id = v_row.station_id
           and nr.nozzle_id = nz.id
           and (s2.business_date, s2.sort_order) < (v_row.business_date, v_row.sort_order)
         order by s2.business_date desc, s2.sort_order desc
         limit 1
      ) prev on true
     where nz.station_id = v_row.station_id and nz.is_active
       and prev.closing_reading is not null
    on conflict (shift_id, nozzle_id) do nothing;

    insert into cng_readings (station_id, shift_id, dispenser_id,
                              opening_reading, closing_reading, sale_rate)
    select v_row.station_id, v_row.id, d.id, prev.closing_reading, prev.closing_reading,
           coalesce(fr.sale_rate, 0)
      from cng_dispensers d
      left join v_fuel_rates fr on fr.fuel_type_id = d.fuel_type_id
      left join lateral (
        select cr.closing_reading
          from cng_readings cr
          join shifts s2 on s2.id = cr.shift_id
         where s2.station_id = v_row.station_id
           and cr.dispenser_id = d.id
           and (s2.business_date, s2.sort_order) < (v_row.business_date, v_row.sort_order)
         order by s2.business_date desc, s2.sort_order desc
         limit 1
      ) prev on true
     where d.station_id = v_row.station_id and d.is_active
       and prev.closing_reading is not null
    on conflict (shift_id, dispenser_id) do nothing;
  end if;

  if p_fillers is not null then
    delete from shift_fillers
     where shift_id = v_row.id
       and staff_id <> all (p_fillers);

    insert into shift_fillers (shift_id, staff_id, station_id, covering)
    select v_row.id, s.id, v_row.station_id,
           not staff_is_rostered(s.rotates, s.default_shift, s.rotation_role,
                                 s.rotation_set_on, p_name, v_row.business_date)
      from staff s
     where s.station_id = v_row.station_id
       and s.is_active
       and s.id = any (p_fillers)
    on conflict (shift_id, staff_id) do nothing;
  end if;

  return v_row;
end
$fn$;

revoke execute on function start_shift(text, date, uuid, uuid[]) from public;
grant execute on function start_shift(text, date, uuid, uuid[]) to authenticated;

comment on function start_shift(text, date, uuid, uuid[]) is
  'Opens a shift because somebody pressed start. A genuinely new shift '
  'inherits its opening meter readings from whatever the previous shift last '
  'closed at, so nobody has to re-walk numbers nothing has moved. Records '
  'the hour and the filler, and settles who is on it against the week they '
  'are actually in. Pressing it twice returns the shift already running.';

-- --------------------------------------- record_shift_closing(), reverted --
create or replace function record_shift_closing(
  p_shift_id uuid,
  p_nozzles  jsonb default '[]'::jsonb,
  p_cng      jsonb default '[]'::jsonb,
  p_staff_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_shift shifts;
  v_taken int := 0;
  r       record;
begin
  select * into v_shift from shifts where id = p_shift_id;
  if v_shift.id is null or v_shift.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_shift.status = 'approved' then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;

  for r in select (e ->> 'nozzle_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_nozzles, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into nozzle_readings (station_id, shift_id, nozzle_id, staff_id,
                                 opening_reading, closing_reading, sale_rate,
                                 confirmed)
    select v_shift.station_id, p_shift_id, r.id, p_staff_id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0), true
      from nozzles nz
      left join v_fuel_rates fr on fr.fuel_type_id = nz.fuel_type_id
     where nz.id = r.id
    on conflict (shift_id, nozzle_id) do update
      set closing_reading = excluded.closing_reading,
          staff_id        = coalesce(p_staff_id, nozzle_readings.staff_id),
          confirmed       = true;
    v_taken := v_taken + 1;
  end loop;

  for r in select (e ->> 'dispenser_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_cng, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into cng_readings (station_id, shift_id, dispenser_id, staff_id,
                              opening_reading, closing_reading, sale_rate,
                              confirmed)
    select v_shift.station_id, p_shift_id, r.id, p_staff_id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0), true
      from cng_dispensers d
      left join v_fuel_rates fr on fr.fuel_type_id = d.fuel_type_id
     where d.id = r.id
    on conflict (shift_id, dispenser_id) do update
      set closing_reading = excluded.closing_reading,
          staff_id        = coalesce(p_staff_id, cng_readings.staff_id),
          confirmed       = true;
    v_taken := v_taken + 1;
  end loop;

  return jsonb_build_object('taken', v_taken);
end
$fn$;

revoke execute on function record_shift_closing(uuid, jsonb, jsonb, uuid) from public;
grant execute on function record_shift_closing(uuid, jsonb, jsonb, uuid) to authenticated;

comment on function record_shift_closing(uuid, jsonb, jsonb, uuid) is
  'The filler finishing a shift writes what the forecourt shows now -- '
  'their own closing. Never touches another shift; the next one inherits '
  'this at start_shift(), not from a fresh walk.';

-- ---------------------------- the one new door: record_shift_opening() -----
-- Called from the counter's Opening tab, only for a meter that shows
-- nothing — never a way to correct a real inherited reading, because it
-- only ever adds a row, never updates one. opening_reading and
-- closing_reading start equal, exactly like an inherited placeholder;
-- record_shift_closing()'s own upsert later overwrites closing_reading
-- and leaves this one alone, same as it already does for every other
-- shift. confirmed stays false: typing the true opening is not the same
-- as the shift having actually been closed.
create or replace function record_shift_opening(
  p_shift_id uuid,
  p_nozzles  jsonb default '[]'::jsonb,
  p_cng      jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_shift shifts;
  v_taken int := 0;
  r       record;
begin
  select * into v_shift from shifts where id = p_shift_id;
  if v_shift.id is null or v_shift.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_shift.status = 'approved' then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;

  for r in select (e ->> 'nozzle_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_nozzles, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into nozzle_readings (station_id, shift_id, nozzle_id,
                                 opening_reading, closing_reading, sale_rate)
    select v_shift.station_id, p_shift_id, r.id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0)
      from nozzles nz
      left join v_fuel_rates fr on fr.fuel_type_id = nz.fuel_type_id
     where nz.id = r.id
    on conflict (shift_id, nozzle_id) do nothing;
    if found then v_taken := v_taken + 1; end if;
  end loop;

  for r in select (e ->> 'dispenser_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_cng, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    insert into cng_readings (station_id, shift_id, dispenser_id,
                              opening_reading, closing_reading, sale_rate)
    select v_shift.station_id, p_shift_id, r.id, r.reading, r.reading,
           coalesce(fr.sale_rate, 0)
      from cng_dispensers d
      left join v_fuel_rates fr on fr.fuel_type_id = d.fuel_type_id
     where d.id = r.id
    on conflict (shift_id, dispenser_id) do nothing;
    if found then v_taken := v_taken + 1; end if;
  end loop;

  return jsonb_build_object('taken', v_taken);
end
$fn$;

revoke execute on function record_shift_opening(uuid, jsonb, jsonb) from public;
grant execute on function record_shift_opening(uuid, jsonb, jsonb) to authenticated;

comment on function record_shift_opening(uuid, jsonb, jsonb) is
  'The counter''s one way to write a true opening reading, for a meter with '
  'nothing to inherit -- a brand new nozzle, or this pump''s very first '
  'shift on it. on conflict do nothing: never overwrites a real inherited '
  'reading, only ever fills in one that was missing. record_shift_closing() '
  'later updates just the closing_reading on the same row, same upsert it '
  'already uses for everything else.';
