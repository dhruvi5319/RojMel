-- ============================================================================
--  The office agrees a shift, and that is the line.
--
--  shifts.status has always had 'approved' and the columns to say who did it,
--  and nothing ever set them — so "until it is approved" had no meaning and a
--  filler's figures were either editable forever or locked the moment they
--  closed the shift. Approving is the manager's or owner's act: it says the
--  office has taken these figures as true, and from then on only the office
--  can reopen them.
-- ============================================================================

create or replace function approve_shift(p_shift_id uuid)
  returns shifts language plpgsql security definer set search_path = public as $fn$
declare v_row shifts;
begin
  if not is_back_office() then
    raise exception 'Only the owner or the manager can approve a shift.';
  end if;

  select * into v_row from shifts where id = p_shift_id;
  if v_row.id is null or v_row.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;

  update shifts
     set status      = 'approved',
         closed_at   = coalesce(closed_at, now()),
         approved_by = auth.uid(),
         approved_at = now()
   where id = p_shift_id
  returning * into v_row;

  return v_row;
end
$fn$;

-- Reopening: a filler up to the moment it is approved, the office at any time.
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
  if auth_role() = 'counter' and v_row.business_date < current_date - 1 then
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

revoke execute on function approve_shift(uuid) from public;
grant execute on function approve_shift(uuid) to authenticated;

-- What the office sees on the list: who agreed the shift, and when.
create or replace view v_shift_status with (security_invoker = true) as
select
  s.id                as shift_id,
  s.station_id,
  s.business_date,
  s.name,
  s.sort_order,
  s.status,
  s.opened_at,
  s.closed_at,
  s.approved_at,
  p.full_name         as approved_by_name,
  s.notes
from shifts s
left join profiles p on p.id = s.approved_by;

revoke insert, update, delete on v_shift_status from authenticated;
grant select on v_shift_status to authenticated;
