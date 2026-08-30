-- ============================================================================
--  Running cash position: what should be in the cash box right now, across
--  every day since the pump started using the app. This is the figure the
--  manager checks against before she leaves for the bank.
-- ============================================================================

create or replace function cash_position() returns jsonb
  language sql stable as $fn$
with collected as (
  select coalesce(sum(cash_amount), 0) v
    from shift_collections where station_id = auth_station_id()
),
received as (
  select coalesce(sum(amount), 0) v
    from payments where mode = 'cash' and station_id = auth_station_id()
),
spent as (
  select coalesce(sum(amount), 0) v
    from expenses where mode = 'cash' and station_id = auth_station_id()
),
wages as (
  -- A deduction is money withheld, not money handed over, so it never
  -- leaves the cash box.
  select coalesce(sum(amount), 0) v
    from staff_payments
   where mode = 'cash' and type <> 'deduction'
     and station_id = auth_station_id()
),
banked as (
  select coalesce(sum(amount), 0) v
    from bank_deposits where station_id = auth_station_id()
)
select jsonb_build_object(
  'collected', collected.v,
  'received',  received.v,
  'expenses',  spent.v,
  'staff',     wages.v,
  'deposited', banked.v,
  'in_hand',   collected.v + received.v - spent.v - wages.v - banked.v
)
from collected, received, spent, wages, banked
$fn$;

grant execute on function cash_position to authenticated;
