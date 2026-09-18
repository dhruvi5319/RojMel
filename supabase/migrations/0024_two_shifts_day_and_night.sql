-- ============================================================================
--  The pump runs two shifts: day and night.
--
--  The app offered three — Morning, Evening, Night — which is not how this
--  pump works and made the money log ask about a shift that never existed.
--  Two is also what makes a slip's shift answerable: a filler either had the
--  day or had the night, and the udhaar written in front of them belongs to
--  that half of the day.
-- ============================================================================

-- Rename in place rather than merge: a shift already carries readings and
-- takings, and merging two of them would silently make one filler answer for
-- another's meters. Where a date somehow has both, the old name is left alone.
update shifts s set name = 'Day', sort_order = 1
 where s.name = 'Morning'
   and not exists (select 1 from shifts x
                    where x.station_id = s.station_id
                      and x.business_date = s.business_date
                      and x.name = 'Day');

update shifts s set name = 'Night', sort_order = 2
 where s.name = 'Evening'
   and not exists (select 1 from shifts x
                    where x.station_id = s.station_id
                      and x.business_date = s.business_date
                      and x.name = 'Night');

update shifts set sort_order = 1 where name = 'Day';
update shifts set sort_order = 2 where name = 'Night';

-- ------------------------------------------------ every day has its two -----
-- A slip has to be tagged to a shift, so the shift has to exist before the
-- first slip of the day is written. This is called by the screens that need
-- the day's shifts rather than left to somebody remembering to open them.
create or replace function ensure_day_shifts(p_date date default today_ist())
  returns setof shifts language plpgsql as $fn$
begin
  insert into shifts (station_id, business_date, name, sort_order)
  select auth_station_id(), p_date, v.name, v.sort_order
    from (values ('Day', 1), ('Night', 2)) as v(name, sort_order)
   where not exists (
     select 1 from shifts s
      where s.station_id    = auth_station_id()
        and s.business_date  = p_date
        and s.name           = v.name);

  return query
    select * from shifts
     where station_id = auth_station_id()
       and business_date = p_date
     order by sort_order;
end
$fn$;

grant execute on function ensure_day_shifts(date) to authenticated;

-- ------------------------------------------- a slip lands on a shift --------
-- It used to attach only to a shift standing open, so a slip written after
-- both shifts were closed belonged to nothing and made the day's udhaar float
-- free of both fillers. Now: the open shift if there is one, otherwise the
-- shift of that date whose turn it was — never nothing, when the day has any.
create or replace function attach_slip_to_shift() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  if new.shift_id is null then
    select id into new.shift_id
      from shifts
     where station_id    = new.station_id
       and business_date = new.business_date
     order by (status = 'open') desc, sort_order desc
     limit 1;
  end if;
  return new;
end
$fn$;
