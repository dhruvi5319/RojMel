-- ============================================================================
--  A filler starts the shift. The clock only suggests.
--
--  The device used to decide which shift it was on by reading the clock, and
--  a shift appeared the moment somebody wrote into it. That made the book say
--  the night shift began at seven when the handover was at ten past — and on
--  a night nobody turned up to start, the first slip written opened a shift
--  retrospectively, with nobody's name against it.
--
--  So a shift now begins when somebody on the forecourt presses start, and
--  the book records the hour it really began and which filler began it. The
--  clock keeps two jobs it is good at: saying which shift is due, and stamping
--  the working day. It opens nothing.
--
--  Three things follow from the same change:
--    * the shift knows who started and who finished it — staff, not the
--      shared device login, which is the same row for everybody;
--    * who is on the shift is settled when it opens, which is when the people
--      standing there know it;
--    * the filler who handed the money over types the cash themselves, which
--      the policies already allowed and no screen ever offered.
-- ============================================================================

-- ------------------------------------------------ who started, who finished --
-- profiles.id is the login, and on the counter that is one shared row for the
-- whole forecourt. The person is a staff row.
alter table shifts
  add column if not exists opened_by_staff uuid references staff(id),
  add column if not exists closed_by_staff uuid references staff(id);

comment on column shifts.opened_by_staff is
  'The filler who started the shift on the counter. Null for a shift the '
  'office opened.';
comment on column shifts.closed_by_staff is
  'The filler who handed the shift in.';

-- ------------------------------------------------------------ starting it --
-- By function, not by an insert policy: starting a shift is one act with
-- three parts — the shift, the hour it began, and who is standing there — and
-- a policy wide enough to allow the insert cannot make the other two happen.
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
           s.default_shift is distinct from p_name
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
  'filler, and settles who is on it. Pressing it twice returns the shift '
  'that is already running.';

-- ------------------------------------------------------------ finishing it --
-- close_shift grows a third argument, so the shift can say who handed it in.
-- The two-argument one is dropped rather than left beside it: two candidates
-- would make a call by name ambiguous.
drop function if exists close_shift(uuid, text);

create or replace function close_shift(
  p_shift_id uuid,
  p_note     text default null,
  p_staff_id uuid default null
) returns shifts language plpgsql security definer set search_path = public as $fn$
declare v_row shifts;
begin
  select * into v_row from shifts where id = p_shift_id;

  if v_row.id is null or v_row.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_row.status = 'approved' then
    raise exception 'This shift has been approved. Ask the owner to reopen it.';
  end if;
  if auth_role() = 'counter' and v_row.business_date < pump_day() - 1 then
    raise exception 'That shift is too old to close from the counter.';
  end if;

  update shifts
     set status          = 'submitted',
         closed_at       = now(),
         closed_by_staff = coalesce(p_staff_id, closed_by_staff),
         notes           = coalesce(nullif(trim(p_note), ''), notes)
   where id = p_shift_id
  returning * into v_row;

  return v_row;
end
$fn$;

revoke execute on function close_shift(uuid, text, uuid) from public;
grant execute on function close_shift(uuid, text, uuid) to authenticated;

-- ------------------------------------------------- the cash they handed over --
-- The policies have always let the counter write shift_collections; no screen
-- ever did, so the figure was typed in the office by somebody who had not
-- counted the notes. A filler answers for cash and only cash, which the
-- check constraint already says — this function keeps to it, and refuses a
-- name that was not on the shift.
create or replace function record_shift_cash(
  p_shift_id uuid,
  p_counts   jsonb default '[]'::jsonb
) returns numeric language plpgsql security definer set search_path = public as $fn$
declare
  v_shift shifts;
  v_kept  uuid[] := '{}';
  v_total numeric(14,2) := 0;
  r       record;
begin
  select * into v_shift from shifts where id = p_shift_id;

  if v_shift.id is null or v_shift.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_shift.status = 'approved' then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;
  if auth_role() = 'counter' and v_shift.business_date < pump_day() - 1 then
    raise exception 'That shift is too old to change from the counter.';
  end if;

  for r in select (e ->> 'staff_id')::uuid    as staff_id,
                  (e ->> 'cash_amount')::numeric as cash
             from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) e
            where e ->> 'staff_id' is not null
  loop
    if r.cash is null or r.cash < 0 then
      raise exception 'A cash figure cannot be less than nothing.';
    end if;
    if not exists (select 1 from shift_fillers f
                    where f.shift_id = p_shift_id and f.staff_id = r.staff_id) then
      raise exception 'That person was not on this shift.';
    end if;

    insert into shift_collections (station_id, shift_id, staff_id, cash_amount)
    values (v_shift.station_id, p_shift_id, r.staff_id, r.cash)
    on conflict (shift_id, staff_id) do update
      set cash_amount = excluded.cash_amount;

    v_kept  := v_kept || r.staff_id;
    v_total := v_total + r.cash;
  end loop;

  -- A filler taken off the count is taken off the shift's money too. The
  -- shift's own row — the one with no name against it — is the office's
  -- ATM, UPI and BPCL, and is never touched here.
  delete from shift_collections
   where shift_id = p_shift_id
     and staff_id is not null
     and staff_id <> all (v_kept);

  return v_total;
end
$fn$;

revoke execute on function record_shift_cash(uuid, jsonb) from public;
grant execute on function record_shift_cash(uuid, jsonb) to authenticated;

comment on function record_shift_cash(uuid, jsonb) is
  'The cash each filler handed over, counted at the counter by the people who '
  'counted the notes. Cash only: the card machine and UPI are the pump''s.';

-- ------------------------------------------------------- fixing a slip ------
-- A slip with a digit wrong was, until now, the office's to correct, because
-- the counter could insert a credit sale and never touch it again. The filler
-- who wrote it can see the mistake straight away; they may put it right while
-- the shift is still theirs. Billing is the line: once a slip is on a bill it
-- is somebody's account, not a note on a pad.
drop policy if exists credit_counter_update on credit_sales;
create policy credit_counter_update on credit_sales for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and invoice_id is null
         and business_date >= pump_day() - 1
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.status <> 'approved'))
  -- The check has to name the shift as well as the using clause does, or a
  -- slip could be edited out of an open shift and into an agreed one, moving
  -- udhaar the office has already signed for.
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and invoice_id is null
              and business_date >= pump_day() - 1
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status <> 'approved'));
