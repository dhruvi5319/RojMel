-- ============================================================================
--  What a filler actually did.
--
--  The staff page knew two things about a person: their salary and what they
--  had been paid. Since the counter started keeping shift_fillers and each
--  filler's own cash count, the books know a great deal more — which shifts
--  they stood, how much money went out through their hands, how much of it
--  they handed over, and when they last worked — and none of it reached an
--  office screen.
--
--  No cost in here, so the manager reads all of it: she is the one who checks
--  the day and hands it over.
-- ============================================================================

create or replace view v_staff_work with (security_invoker = true) as
select
  st.id                                as staff_id,
  st.station_id,
  st.name,
  st.name_gu,
  st.is_active,
  coalesce(m.shifts_this_month, 0)     as shifts_this_month,
  coalesce(m.cash_this_month, 0)       as cash_this_month,
  coalesce(a.shifts_all_time, 0)       as shifts_all_time,
  a.last_worked,
  coalesce(s.slips_this_month, 0)      as slips_this_month,
  coalesce(s.udhaar_this_month, 0)     as udhaar_this_month
from staff st
-- Separate subqueries rather than one join: a filler on a shift that also has
-- a cash row would otherwise be counted once per combination.
left join lateral (
  select
    count(distinct f.shift_id)                      as shifts_this_month,
    coalesce((
      select sum(sc.cash_amount)
        from shift_collections sc
        join shifts sh2 on sh2.id = sc.shift_id
       where sc.staff_id = st.id
         and sh2.business_date >= date_trunc('month', pump_day())::date
    ), 0)                                           as cash_this_month
  from shift_fillers f
  join shifts sh on sh.id = f.shift_id
 where f.staff_id = st.id
   and sh.business_date >= date_trunc('month', pump_day())::date
) m on true
left join lateral (
  select count(distinct f.shift_id) as shifts_all_time,
         max(sh.business_date)      as last_worked
    from shift_fillers f
    join shifts sh on sh.id = f.shift_id
   where f.staff_id = st.id
) a on true
left join lateral (
  -- The udhaar written in front of them, which is the other thing a filler
  -- answers for.
  select count(*) as slips_this_month, sum(cs.amount) as udhaar_this_month
    from credit_sales cs
   where cs.staff_id = st.id
     and cs.business_date >= date_trunc('month', pump_day())::date
) s on true
where is_back_office();

revoke insert, update, delete on v_staff_work from authenticated;
grant select on v_staff_work to authenticated;

comment on view v_staff_work is
  'What each filler did this month — shifts stood, cash handed over, udhaar '
  'written — from what the counter records.';
