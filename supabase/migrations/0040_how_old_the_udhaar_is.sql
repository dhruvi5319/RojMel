-- ============================================================================
--  How old the udhaar is.
--
--  The customer list was sorted by who owed the most, which is not the question
--  a pump asks. A lorry firm that owes two lakh and pays every month is a good
--  customer; one that owes forty thousand from March is a problem. What matters
--  is the age of the money, and the screen had no idea of it.
--
--  A customer's account here is a running one — opening balance, plus every
--  slip, less every payment — so the honest way to age it is to let payments
--  clear the oldest debt first, which is what both sides assume anyway, and
--  then see what is left and how old it is.
-- ============================================================================

create or replace view v_customer_ageing with (security_invoker = true) as
with items as (
  -- Everything the customer has been charged, oldest first. The balance they
  -- came into the book with is the oldest item of all.
  select
    c.id                        as customer_id,
    c.station_id,
    c.created_at::date          as on_date,
    c.opening_balance           as amount,
    '00000000-0000-0000-0000-000000000000'::uuid as item_id
  from customers c
  where c.opening_balance > 0
  union all
  select cs.customer_id, cs.station_id, cs.business_date, cs.amount, cs.id
  from credit_sales cs
),
running as (
  select
    i.*,
    sum(i.amount) over (
      partition by i.customer_id
      order by i.on_date, i.item_id
      rows between unbounded preceding and current row) as charged_to_here
  from items i
),
paid as (
  select customer_id, sum(amount) as total
    from payments group by customer_id
),
unpaid as (
  select
    r.customer_id,
    r.station_id,
    r.on_date,
    -- What of this item is still owed once the payments have worked their way
    -- up from the oldest. Clamped both ways: an item fully covered owes
    -- nothing, one the payments never reached owes all of itself.
    greatest(least(r.amount, r.charged_to_here - coalesce(p.total, 0)), 0) as still_owed
  from running r
  left join paid p on p.customer_id = r.customer_id
)
select
  u.customer_id,
  u.station_id,
  sum(u.still_owed)                                                as owed,
  sum(u.still_owed) filter (where pump_day() - u.on_date <= 30)    as within_month,
  sum(u.still_owed) filter (where pump_day() - u.on_date between 31 and 60) as one_to_two,
  sum(u.still_owed) filter (where pump_day() - u.on_date between 61 and 90) as two_to_three,
  sum(u.still_owed) filter (where pump_day() - u.on_date > 90)     as over_three,
  -- The age of the oldest rupee still owed, which is what decides who to ring.
  max(pump_day() - u.on_date) filter (where u.still_owed > 0)      as oldest_days
from unpaid u
group by u.customer_id, u.station_id;

revoke insert, update, delete on v_customer_ageing from authenticated;
grant select on v_customer_ageing to authenticated;

comment on view v_customer_ageing is
  'What each customer still owes, split by how long it has been owed. '
  'Payments clear the oldest debt first, which is what a running account means.';
