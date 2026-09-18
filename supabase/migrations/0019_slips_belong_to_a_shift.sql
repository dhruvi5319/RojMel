-- ============================================================================
--  A slip belongs to the shift it was written in.
--
--  udhaar is one of the five ways value leaves the pump, so the per-shift
--  reconciliation only works if each slip knows its shift. It was optional,
--  the counter never set it, and the office form defaulted it to blank — so
--  almost every slip belonged to no shift, and every shift looked short by
--  exactly the udhaar written during it.
--
--  The day's own figures were never affected: day_summary matches credit_sales
--  on business_date, not on shift.
--
--  A trigger does the attaching rather than each screen, because a trigger
--  cannot be forgotten when somebody adds another way to write a slip.
-- ============================================================================

create or replace function attach_slip_to_shift() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  if new.shift_id is null then
    -- The shift standing open on that date. A pump runs one at a time; if two
    -- are somehow open, the later one is the one being worked.
    select id into new.shift_id
      from shifts
     where station_id    = new.station_id
       and business_date = new.business_date
       and status        = 'open'
     order by sort_order desc
     limit 1;
  end if;
  return new;
end
$fn$;

drop trigger if exists credit_sales_attach_shift on credit_sales;
create trigger credit_sales_attach_shift
  before insert or update of business_date on credit_sales
  for each row execute function attach_slip_to_shift();

-- ---------------------------------------------------------------- backfill --
-- Only where there is no guesswork: a slip on a date that had exactly one
-- shift can only have belonged to that shift. Anything more ambiguous is left
-- alone and shown on the money log as unattached, for a person to decide.
update credit_sales cs
   set shift_id = only_shift.id
  from (
    -- Postgres has no min() for uuid, and with exactly one row per group any
    -- aggregate picks the same shift anyway.
    select s.station_id, s.business_date, (array_agg(s.id))[1] as id
      from shifts s
     group by s.station_id, s.business_date
    having count(*) = 1
  ) only_shift
 where cs.shift_id is null
   and cs.station_id    = only_shift.station_id
   and cs.business_date = only_shift.business_date;

-- -------------------------------------- udhaar that still belongs to no one --
-- Surfaced rather than swallowed: if a slip is not on a shift, the day should
-- say so out loud instead of quietly making a filler look short.
create or replace view v_unattached_udhaar with (security_invoker = true) as
select
  cs.station_id,
  cs.business_date,
  count(*)      as slips,
  sum(cs.amount) as amount
from credit_sales cs
where cs.shift_id is null
group by cs.station_id, cs.business_date;

revoke insert, update, delete on v_unattached_udhaar from authenticated;
