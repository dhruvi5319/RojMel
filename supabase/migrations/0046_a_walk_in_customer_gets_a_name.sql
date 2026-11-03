-- ============================================================================
--  A walk-in customer gets a name, not a form.
--
--  Customers were office-only to write — the counter could pick one, never
--  make one, same boundary as equipment. That held until a lorry showed up
--  that nobody had added yet: a one-time delivery, a customer the office has
--  never met. The filler cannot turn it away, and cannot wait for the office
--  to open Customers and type a name first — the slip has to go on somebody,
--  now, with the forecourt still in front of them.
--
--  So the counter gets one narrow door in: type a name, and the filler is
--  handed a customer row for it, flagged is_walkin so the office always sees
--  which ones it never created itself. Typing the same name again reuses the
--  same row rather than fragmenting one lorry's balance across several — the
--  unique (station_id, name) constraint already in place does that for free;
--  this just stops it erroring at a filler who has no idea what a unique
--  constraint is.
-- ============================================================================

alter table customers add column if not exists is_walkin boolean not null default false;

comment on column customers.is_walkin is
  'True for a customer the counter typed in on the spot, for a lorry that may '
  'never come back. Never set by the office — this is the one door the '
  'counter itself gets into customers, which is otherwise back-office-write.';

-- ------------------------------------------------- the counter's one door --
create or replace function counter_walkin_customer(p_name text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_name text := trim(p_name);
  v_id   uuid;
begin
  if auth_role() <> 'counter' then
    raise exception 'Only the counter writes a walk-in customer this way.';
  end if;
  if v_name = '' then
    raise exception 'A name is needed to write the slip.';
  end if;

  insert into customers (station_id, name, is_walkin)
  values (auth_station_id(), v_name, true)
  on conflict (station_id, name) do nothing;

  select id into v_id from customers
   where station_id = auth_station_id() and name = v_name;

  return v_id;
end
$fn$;

revoke execute on function counter_walkin_customer(text) from public;
grant execute on function counter_walkin_customer(text) to authenticated;

comment on function counter_walkin_customer(text) is
  'The counter''s one way to create a customer: typed on the spot, flagged '
  'is_walkin, reused by name rather than duplicated if the same name is '
  'typed again — the unique (station_id, name) constraint decides that, '
  'this function just turns its conflict into a lookup instead of an error.';

-- ---------------------------------------- the office sees which is which --
create or replace view v_customer_balances with (security_invoker = true) as
select
  c.id            as customer_id,
  c.station_id,
  c.name,
  c.phone,
  c.credit_limit,
  c.is_active,
  c.opening_balance
    + coalesce(s.total_sales, 0)
    - coalesce(p.total_paid, 0)                       as balance,
  coalesce(s.total_sales, 0)                          as lifetime_sales,
  coalesce(p.total_paid, 0)                           as lifetime_paid,
  coalesce(u.unbilled_amount, 0)                      as unbilled_amount,
  coalesce(u.unbilled_count, 0)                       as unbilled_slips,
  s.last_sale_date,
  p.last_payment_date,
  c.is_walkin
from customers c
left join lateral (
  select sum(amount) total_sales, max(business_date) last_sale_date
    from credit_sales where customer_id = c.id
) s on true
left join lateral (
  select sum(amount) total_paid, max(payment_date) last_payment_date
    from payments where customer_id = c.id
) p on true
left join lateral (
  select sum(amount) unbilled_amount, count(*) unbilled_count
    from credit_sales where customer_id = c.id and invoice_id is null
) u on true
where is_back_office();

revoke insert, update, delete on v_customer_balances from authenticated;
grant select on v_customer_balances to authenticated;
