-- ============================================================================
--  The shift that is finishing closes itself.
--
--  record_meter_reading() (0035) had the filler coming ON take one walk that
--  wrote two numbers: their own shift's opening, and — the same instant — the
--  previous shift's closing. That assumed the two fillers meet at the pump,
--  more or less together. They do not have to: the filler going off has to
--  settle their own hissab and be gone, and the filler coming on may not turn
--  up for a while yet — waiting for them was never really an option, it was
--  just never named as one.
--
--  So the reading now belongs to the shift ending, not the shift starting.
--  Whoever is finishing walks the forecourt and writes what it says — that is
--  their own closing, taken because they need it to answer for their own
--  cash, not because somebody else is standing there. The next shift is not
--  left waiting on a fresh walk either: start_shift() copies the previous
--  shift's closing straight in as its own opening the moment it is created,
--  since nothing can have moved through an unstaffed pump. A filler who
--  suspects otherwise can still correct it — the walk is still there, still
--  theirs to redo, right up to the moment the office agrees the shift.
-- ============================================================================

-- A reading now starts life two ways: inherited, copied in the instant a
-- shift opens, from whatever the shift before it last closed at — or typed,
-- by whoever is actually finishing this one. The counter needs to tell those
-- apart without asking anybody who they are, which the meter walk never has
-- and should not start now — so this is a plain fact about the row, not a
-- name.
alter table nozzle_readings add column if not exists confirmed boolean not null default false;
alter table cng_readings    add column if not exists confirmed boolean not null default false;

comment on column nozzle_readings.confirmed is
  'True once somebody has actually written this shift''s closing, rather '
  'than it only being what start_shift() copied in from the shift before.';
comment on column cng_readings.confirmed is
  'True once somebody has actually written this shift''s closing, rather '
  'than it only being what start_shift() copied in from the shift before.';

-- ------------------------------------------------- the shift closes itself --
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

  -- ------------------------------------------------------------ nozzles --
  for r in select (e ->> 'nozzle_id')::uuid as id, (e ->> 'reading')::numeric as reading
             from jsonb_array_elements(coalesce(p_nozzles, '[]'::jsonb)) e
            where e ->> 'reading' is not null and e ->> 'reading' <> ''
  loop
    -- No row yet: a first-ever reading for this nozzle, or one added since
    -- the last shift, so there is nothing to have inherited. Opening and
    -- closing both start here, same as record_meter_reading() always did.
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

  -- ---------------------------------------------------------------- CNG --
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
  'The filler finishing a shift writes what the forecourt shows now — their '
  'own closing. Never touches another shift; the next one inherits this at '
  'start_shift(), not from a fresh walk. Supersedes record_meter_reading() '
  '(0035), which is left as it was for anything still calling it.';

-- --------------------------------------------- start_shift() inherits it ---
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
  -- A filler answers for the day in front of them. The office may open an
  -- older one from the shift screen; the device may not.
  if auth_role() = 'counter' and v_date <> pump_day() then
    raise exception 'The counter can only start today''s shift.';
  end if;

  select * into v_row
    from shifts
   where station_id = auth_station_id()
     and business_date = v_date
     and name = p_name;

  -- Pressing start twice is not two shifts. The second press changes nothing
  -- about when it began or who began it.
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
    -- It is already there: either running, or handed in too early while the
    -- forecourt kept working. Starting it again reopens it, which is the
    -- filler's own right until the office agrees the figures, and is a no-op
    -- on a shift that never stopped.
    --
    -- The hour it first began stands, and so does the first name against it —
    -- but a shift the office opened as an empty shell has nobody against it,
    -- and the filler who actually started it is the first to press the button.
    update shifts
       set status          = 'open',
           closed_at       = null,
           closed_by_staff = null,
           opened_by_staff = coalesce(opened_by_staff, p_staff_id)
     where id = v_row.id
    returning * into v_row;
  end if;

  -- A genuinely new shift inherits its opening from whichever shift closed
  -- last — the previous shift's own closing figure, whatever it is, because
  -- nothing can have moved through the pump while nobody was on it. Only on
  -- a fresh insert: a reopened shift already has whatever readings it had.
  -- confirmed stays false — inherited is not the same as somebody having
  -- actually looked at the pump this time.
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

  -- Who is on it. The trigger seeded the roster when the row went in; this is
  -- the forecourt's answer, which wins. Null means "leave the roster alone".
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

-- ------------------------------------------ every meter, and its status ----
-- v_shift_meters gains confirmed: the counter's own signal for "inherited
-- and nobody has looked yet" versus "somebody has actually closed this".
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
  nr.litres                              as quantity,
  coalesce(nr.confirmed, false)          as confirmed
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
  cr.kg,
  coalesce(cr.confirmed, false)
from shifts s
join cng_dispensers d on d.station_id = s.station_id and d.is_active
join fuel_types ft on ft.id = d.fuel_type_id
left join cng_readings cr on cr.shift_id = s.id and cr.dispenser_id = d.id;

revoke insert, update, delete on v_shift_meters from authenticated;
grant select on v_shift_meters to authenticated;
