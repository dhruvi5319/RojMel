-- ============================================================================
--  The day book: one row per day the pump traded.
--
--  Nothing here is new information — every figure already sits in the shifts,
--  the readings and the takings. What was missing was a way to ask "show me
--  the 14th of last month" without stepping back a day at a time. This gives
--  a calendar something to colour each date with: what sold, what came in,
--  whether it balanced, and whether father has signed it off.
-- ============================================================================

create or replace view v_day_book with (security_invoker = true) as
select
  d.business_date,
  d.station_id,
  d.shifts,
  d.total_sale,
  d.cash,
  d.card,
  d.upi,
  d.bpcl,
  d.udhaar,
  d.accounted,
  d.difference,
  coalesce(dc.status::text, 'draft') as status,
  dc.counted_cash,
  dc.approved_at is not null         as approved
from (
  select
    business_date,
    station_id,
    count(*)             as shifts,
    sum(total_sale)      as total_sale,
    sum(cash)            as cash,
    sum(card)            as card,
    sum(upi)             as upi,
    sum(bpcl)            as bpcl,
    sum(udhaar)          as udhaar,
    sum(accounted)       as accounted,
    sum(difference)      as difference
  from v_shift_money
  group by business_date, station_id
) d
left join day_closings dc
  on dc.business_date = d.business_date and dc.station_id = d.station_id;

revoke insert, update, delete on v_day_book from authenticated;

-- Which days in a month have anything on them, for the calendar to mark.
create or replace function day_book_month(p_month date)
  returns table (
    business_date date,
    shifts        int,
    total_sale    numeric,
    accounted     numeric,
    difference    numeric,
    status        text,
    approved      boolean
  )
  language sql stable as $fn$
  select b.business_date, b.shifts::int, b.total_sale, b.accounted,
         b.difference, b.status, b.approved
    from v_day_book b
   where b.business_date >= date_trunc('month', p_month)::date
     and b.business_date <  (date_trunc('month', p_month) + interval '1 month')::date
   order by b.business_date
$fn$;

grant execute on function day_book_month to authenticated;
