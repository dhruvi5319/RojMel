-- ============================================================================
--  The pump's working day rolls at 7am, not at midnight.
--
--  The night shift runs 7pm to 7am, so at 2am the people on the forecourt are
--  still working the shift that started last evening, and what they sell
--  belongs to that day's book. The counter now reads the clock and writes to
--  that day — but the policies that let it write were pinned to current_date,
--  so between midnight and 7am the device could see its own shift and not
--  write to it. Starting a shift simply did nothing, with no error: a blocked
--  insert matches no rows.
--
--  So the database learns the same rule the app uses, and the counter's
--  policies ask it instead of asking the calendar.
-- ============================================================================

create or replace function pump_day(at timestamptz default now())
  returns date language sql stable as $fn$
  select case
    when extract(hour from at at time zone 'Asia/Kolkata') >= 7
      then (at at time zone 'Asia/Kolkata')::date
    else (at at time zone 'Asia/Kolkata')::date - 1
  end
$fn$;

comment on function pump_day(timestamptz) is
  'The business day the pump is working. Rolls at 7am with the day shift, so '
  'the night shift''s small hours stay on the day it started.';

grant execute on function pump_day(timestamptz) to authenticated;

-- ------------------------------------------- what the counter may write -----
-- Yesterday stays reachable either way: a shift is often written up just
-- after it ends, and the office may not have approved it yet.
drop policy if exists shifts_counter_read on shifts;
drop policy if exists shifts_counter_insert on shifts;

create policy shifts_counter_read on shifts for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= pump_day() - 1);

create policy shifts_counter_insert on shifts for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date = pump_day() and status = 'open');

drop policy if exists credit_counter_read on credit_sales;
drop policy if exists credit_counter_write on credit_sales;

create policy credit_counter_read on credit_sales for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and business_date >= pump_day() - 1);

create policy credit_counter_write on credit_sales for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and business_date = pump_day() and invoice_id is null);

-- Readings, handover and CNG hang off a shift, so they follow its date.
do $do$
declare t text;
begin
  foreach t in array array['nozzle_readings', 'shift_collections', 'cng_readings'] loop
    execute format('drop policy if exists %I on %I', t || '_counter_read', t);
    execute format(
      'create policy %I on %I for select to authenticated '
      'using (station_id = auth_station_id() and auth_role() = ''counter'' '
      '       and exists (select 1 from shifts s '
      '                   where s.id = shift_id and s.business_date >= pump_day() - 1))',
      t || '_counter_read', t);

    execute format('drop policy if exists %I on %I', t || '_counter_write', t);
    execute format(
      'create policy %I on %I for insert to authenticated '
      'with check (station_id = auth_station_id() and auth_role() = ''counter'' '
      '            and exists (select 1 from shifts s '
      '                        where s.id = shift_id and s.status <> ''approved'' '
      '                          and s.business_date >= pump_day() - 1))',
      t || '_counter_write', t);

    execute format('drop policy if exists %I on %I', t || '_counter_update', t);
    execute format(
      'create policy %I on %I for update to authenticated '
      'using (station_id = auth_station_id() and auth_role() = ''counter'' '
      '       and exists (select 1 from shifts s '
      '                   where s.id = shift_id and s.status <> ''approved'' '
      '                     and s.business_date >= pump_day() - 1)) '
      'with check (station_id = auth_station_id() and auth_role() = ''counter'')',
      t || '_counter_update', t);
  end loop;
end
$do$;

-- The same rule where a filler closes or reopens their own shift.
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
  if auth_role() = 'counter' and v_row.business_date < pump_day() - 1 then
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

create or replace function reopen_shift(p_shift_id uuid)
  returns shifts language plpgsql security definer set search_path = public as $fn$
declare v_row shifts;
begin
  select * into v_row from shifts where id = p_shift_id;

  if v_row.id is null or v_row.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_row.status = 'approved' and not is_back_office() then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;
  if auth_role() = 'counter' and v_row.business_date < pump_day() - 1 then
    raise exception 'That shift is too old to reopen from the counter.';
  end if;

  update shifts
     set status      = 'open',
         closed_at   = null,
         approved_by = null,
         approved_at = null
   where id = p_shift_id
  returning * into v_row;

  return v_row;
end
$fn$;

