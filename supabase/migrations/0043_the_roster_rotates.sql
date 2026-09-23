-- ============================================================================
--  The roster rotates.
--
--  staff.default_shift was one fixed answer — Day, Night, or none — because
--  the pump it was written for did not need more. This one's does: fillers
--  swap between day and night every week, and the swap happens on Sunday,
--  when whoever is finishing the week on days works Sunday's night shift too
--  and starts the new week already on nights. A fixed field would be right
--  for one week out of every two and wrong for the other, which would make
--  the office re-type it every Sunday or trust a roster that lies half the
--  time — so the shift a rotating filler is on is now computed, not typed.
--
--  Two kinds of filler still coexist, because not everyone rotates: a filler
--  can be fixed on one shift forever (default_shift, unchanged), or can
--  rotate, in which case they carry a role and the week it was true of
--  (rotation_role, rotation_set_on) and every later week is worked out from
--  that. Re-saving it with today's already-correct answer is harmless — it
--  only moves the anchor to the same phase, never changes what any week
--  computes to.
-- ============================================================================

alter table staff
  add column if not exists rotates boolean not null default false,
  add column if not exists rotation_role text
    check (rotation_role is null or rotation_role in ('Day', 'Night')),
  add column if not exists rotation_set_on date;

comment on column staff.rotates is
  'True when this filler swaps between Day and Night weekly, rather than '
  'having one fixed shift.';
comment on column staff.rotation_role is
  'Day or Night, as of the week rotation_set_on falls in. Every other week '
  'works out from those two by counting weeks and flipping on the odd ones.';
comment on column staff.rotation_set_on is
  'Any date in the week rotation_role was true of. Only its week matters, '
  'not the exact day.';

alter table staff add constraint staff_rotation_shape check (
  (rotates and default_shift is null
             and rotation_role is not null and rotation_set_on is not null)
  or
  (not rotates and rotation_role is null and rotation_set_on is null)
);

-- ------------------------------------------------- the fortnight, worked out --
-- Given the role for one week, every other week's is a flip for each week of
-- distance — even distance keeps it, odd distance swaps it. Weeks are counted
-- from Monday (date_trunc's own week start), so the difference between any
-- two week-starts is always a whole multiple of 7 and the division is exact.
create or replace function rotation_effective_role(
  p_role   text,
  p_set_on date,
  p_date   date
) returns text language sql immutable as $fn$
  select case
    when p_role is null or p_set_on is null then null
    when ((date_trunc('week', p_date)::date - date_trunc('week', p_set_on)::date) / 7) % 2 = 0
      then p_role
    else (case p_role when 'Day' then 'Night' else 'Day' end)
  end
$fn$;

grant execute on function rotation_effective_role(text, date, date) to authenticated;

comment on function rotation_effective_role(text, date, date) is
  'The shift a rotating filler is on for the week containing p_date, given '
  'their role as of the week containing p_set_on.';

-- Whether a filler — fixed or rotating — is normally on a named shift on a
-- given date. Sunday is the one day this is not a plain lookup: the crew
-- finishing the week on days works Sunday's night shift too, so on a Sunday
-- night shift it is the outgoing DAY crew who are on the roster, not whoever
-- would ordinarily have had the night that week. Always returns a real
-- boolean — never null — because it feeds `not staff_is_rostered(...)` to
-- decide whether somebody standing on a shift is covering.
create or replace function staff_is_rostered(
  p_rotates        boolean,
  p_default_shift  text,
  p_rotation_role  text,
  p_rotation_set_on date,
  p_shift_name     text,
  p_date           date
) returns boolean language sql immutable as $fn$
  select case
    when not p_rotates then coalesce(p_default_shift = p_shift_name, false)
    when p_rotation_role is null or p_rotation_set_on is null then false
    when extract(dow from p_date) = 0 and p_shift_name = 'Night' then
      rotation_effective_role(p_rotation_role, p_rotation_set_on, p_date) = 'Day'
    else
      rotation_effective_role(p_rotation_role, p_rotation_set_on, p_date) = p_shift_name
  end
$fn$;

grant execute on function staff_is_rostered(boolean, text, text, date, text, date) to authenticated;

comment on function staff_is_rostered(boolean, text, text, date, text, date) is
  'Whether a filler is normally on this shift, fixed or rotating, with the '
  'Sunday handover folded in. Never null.';

-- --------------------------------------------------- seeding the roster ----
-- Same trigger, same table, only the test for who belongs on it changes: a
-- rotating filler is checked against the week they are actually in, not a
-- single stored answer.
create or replace function seed_shift_fillers() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  insert into shift_fillers (shift_id, staff_id, station_id)
  select new.id, s.id, new.station_id
    from staff s
   where s.station_id = new.station_id
     and s.is_active
     and staff_is_rostered(s.rotates, s.default_shift, s.rotation_role,
                           s.rotation_set_on, new.name, new.business_date)
  on conflict do nothing;

  return new;
end
$fn$;

-- ------------------------------------------------- who is covering, now ----
-- start_shift() marked somebody as covering by comparing the shift's name to
-- their stored default_shift directly. A rotating filler has no such column
-- to compare — their answer depends on the date — so the same
-- staff_is_rostered() the trigger uses now decides this too.
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
  'Opens a shift because somebody pressed start. Records the hour and the '
  'filler, and settles who is on it against the week they are actually in — '
  'not a single fixed answer. Pressing it twice returns the shift already '
  'running.';
