-- ============================================================================
--  A filler opens the shift and closes it.
--
--  The counter device could open a shift and write readings into it, but never
--  close one — so a shift stayed open until somebody in the office noticed,
--  and the person who actually handed over the money had no way to say "that
--  is my shift, finished". Closing it is theirs to do.
--
--  And a correction is theirs until the books agree it: a filler may keep
--  fixing their own readings and handover right up to the moment an owner or
--  manager approves the shift. After that it is the office's to reopen.
-- ============================================================================

-- ------------------------------------------- closing, and asking to reopen --
-- Done by function rather than an update policy: the only things a filler may
-- change about a shift are whether it is finished and the note, and a policy
-- broad enough to allow that would also let them move it to another date.
create or replace function close_shift(p_shift_id uuid, p_note text default null)
  returns shifts language plpgsql security definer set search_path = public as $fn$
declare v_row shifts;
begin
  select * into v_row from shifts where id = p_shift_id;

  if v_row.id is null or v_row.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_row.status = 'approved' then
    raise exception 'This shift has been approved. Ask the owner to reopen it.';
  end if;
  -- A filler answers for the day in front of them, not for last week's.
  if auth_role() = 'counter' and v_row.business_date < current_date - 1 then
    raise exception 'That shift is too old to close from the counter.';
  end if;

  update shifts
     set status    = 'submitted',
         closed_at = now(),
         notes     = coalesce(nullif(trim(p_note), ''), notes)
   where id = p_shift_id
  returning * into v_row;

  return v_row;
end
$fn$;

-- Reopening their own shift, while the books have not yet agreed it. Approved
-- is the line: past that, only the office can reopen, which it already can.
create or replace function reopen_shift(p_shift_id uuid)
  returns shifts language plpgsql security definer set search_path = public as $fn$
declare v_row shifts;
begin
  select * into v_row from shifts where id = p_shift_id;

  if v_row.id is null or v_row.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_row.status = 'approved' then
    raise exception 'This shift has been approved. Ask the owner to reopen it.';
  end if;
  if auth_role() = 'counter' and v_row.business_date < current_date - 1 then
    raise exception 'That shift is too old to reopen from the counter.';
  end if;

  update shifts set status = 'open', closed_at = null
   where id = p_shift_id
  returning * into v_row;

  return v_row;
end
$fn$;

revoke execute on function close_shift(uuid, text) from public;
revoke execute on function reopen_shift(uuid) from public;
grant execute on function close_shift(uuid, text) to authenticated;
grant execute on function reopen_shift(uuid) to authenticated;

-- --------------------------------- a correction is theirs until it is agreed --
-- These read 'open' only, which meant closing the shift locked the filler out
-- of their own arithmetic. Approved is the right line: it is the point at
-- which the office has taken the figures as true.
drop policy if exists readings_counter_write on nozzle_readings;
drop policy if exists readings_counter_update on nozzle_readings;
create policy readings_counter_write on nozzle_readings for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status <> 'approved'
                            and s.business_date >= current_date - 1));
create policy readings_counter_update on nozzle_readings for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.status <> 'approved'
                       and s.business_date >= current_date - 1))
  with check (station_id = auth_station_id() and auth_role() = 'counter');

drop policy if exists collections_counter_write on shift_collections;
drop policy if exists collections_counter_update on shift_collections;
create policy collections_counter_write on shift_collections for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status <> 'approved'
                            and s.business_date >= current_date - 1));
create policy collections_counter_update on shift_collections for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.status <> 'approved'
                       and s.business_date >= current_date - 1))
  with check (station_id = auth_station_id() and auth_role() = 'counter');

-- CNG is metered beside the nozzles and closes with the same shift, so it
-- follows the same line.
drop policy if exists cng_readings_counter_write on cng_readings;
drop policy if exists cng_readings_counter_update on cng_readings;
create policy cng_readings_counter_write on cng_readings for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status <> 'approved'
                            and s.business_date >= current_date - 1));
create policy cng_readings_counter_update on cng_readings for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.status <> 'approved'
                       and s.business_date >= current_date - 1))
  with check (station_id = auth_station_id() and auth_role() = 'counter');
