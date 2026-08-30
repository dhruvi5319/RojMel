-- ============================================================================
--  Business logic: derived figures, invoicing, day close.
--
--  A note on the sales model, because it is easy to get wrong:
--  the nozzle meter counts every litre that leaves the pump, whoever paid and
--  however they paid. A credit sale is therefore NOT extra sales on top of the
--  meter — it is the slice of metered sales that went out on udhaar. So:
--      cash expected = meter sales - credit sales
--  Credit sales are never added to meter sales anywhere in this file.
-- ============================================================================

-- Let the app omit station_id on insert; it can only ever be the caller's.
do $do$
declare t text;
begin
  foreach t in array array[
    'fuel_types','fuel_prices','tanks','nozzles','staff','shifts',
    'nozzle_readings','shift_collections','customers','vehicles',
    'invoices','credit_sales','payments','fuel_purchases','tank_dips',
    'expenses','staff_payments','bank_deposits','day_closings',
    'fuel_purchase_costs','audit_log'
  ] loop
    execute format('alter table %I alter column station_id set default auth_station_id()', t);
  end loop;
end
$do$;

-- --------------------------------------------------- the rate right now ---
create or replace function current_rate(p_fuel_type_id uuid)
  returns numeric language sql stable as $fn$
  select sale_rate from fuel_prices
   where fuel_type_id = p_fuel_type_id and effective_from <= now()
   order by effective_from desc limit 1
$fn$;

-- The rate that applied at a given moment, for back-dated entry.
create or replace function rate_on(p_fuel_type_id uuid, p_at timestamptz)
  returns numeric language sql stable as $fn$
  select sale_rate from fuel_prices
   where fuel_type_id = p_fuel_type_id and effective_from <= p_at
   order by effective_from desc limit 1
$fn$;

-- ------------------------------------------------- credit customer books --
-- Balance = what they started owing + everything they took - everything paid.
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
  p.last_payment_date
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

-- ------------------------------------------------------------ tank stock --
-- Book stock in litres. Deliberately exposes no rates, so the manager can
-- watch stock without seeing what it cost.
create or replace view v_tank_stock with (security_invoker = true) as
select
  t.id          as tank_id,
  t.station_id,
  t.name,
  t.fuel_type_id,
  ft.name       as fuel_name,
  t.capacity_litres,
  t.opening_stock_litres
    + coalesce(pu.litres_in, 0)
    - coalesce(so.litres_out, 0)                      as book_stock_litres,
  coalesce(pu.litres_in, 0)                           as litres_received,
  coalesce(so.litres_out, 0)                          as litres_sold,
  d.dip_litres                                        as last_dip_litres,
  d.business_date                                     as last_dip_date,
  d.dip_litres - (t.opening_stock_litres
    + coalesce(pu.litres_in, 0) - coalesce(so.litres_out, 0)) as last_dip_variance
from tanks t
join fuel_types ft on ft.id = t.fuel_type_id
left join lateral (
  select sum(litres) litres_in from fuel_purchases
   where tank_id = t.id
     and delivery_date >= coalesce(t.opening_stock_date, '-infinity'::date)
) pu on true
left join lateral (
  select sum(nr.litres) litres_out
    from nozzle_readings nr
    join nozzles n on n.id = nr.nozzle_id
    join shifts sh on sh.id = nr.shift_id
   where n.tank_id = t.id
     and sh.business_date >= coalesce(t.opening_stock_date, '-infinity'::date)
) so on true
left join lateral (
  select dip_litres, business_date from tank_dips
   where tank_id = t.id order by business_date desc limit 1
) d on true
where is_back_office();

-- ----------------------------------------------------- the day's figures --
create or replace function day_summary(p_date date)
  returns jsonb language sql stable as $fn$
with sales as (
  select coalesce(sum(nr.amount), 0) amt, coalesce(sum(nr.litres), 0) ltr
    from nozzle_readings nr
    join shifts s on s.id = nr.shift_id
   where s.business_date = p_date and s.station_id = auth_station_id()
),
credit as (
  select coalesce(sum(amount), 0) amt
    from credit_sales
   where business_date = p_date and station_id = auth_station_id()
),
coll as (
  select coalesce(sum(c.cash_amount), 0) cash,
         coalesce(sum(c.upi_amount), 0)  upi,
         coalesce(sum(c.card_amount), 0) card
    from shift_collections c
    join shifts s on s.id = c.shift_id
   where s.business_date = p_date and s.station_id = auth_station_id()
),
recv as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from payments
   where payment_date = p_date and station_id = auth_station_id()
),
exp as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from expenses
   where business_date = p_date and station_id = auth_station_id()
),
pay as (
  select coalesce(sum(amount) filter (where mode = 'cash'), 0) cash,
         coalesce(sum(amount), 0) total
    from staff_payments
   where payment_date = p_date and station_id = auth_station_id()
),
dep as (
  select coalesce(sum(amount), 0) amt
    from bank_deposits
   where deposit_date = p_date and station_id = auth_station_id()
),
closing as (
  select opening_cash, counted_cash, status, notes, owner_remarks
    from day_closings
   where business_date = p_date and station_id = auth_station_id()
)
select jsonb_build_object(
  'date',              p_date,
  'litres_sold',       sales.ltr,
  'meter_sales',       sales.amt,
  'credit_sales',      credit.amt,
  'counter_sales',     sales.amt - credit.amt,
  'collected_cash',    coll.cash,
  'collected_upi',     coll.upi,
  'collected_card',    coll.card,
  'collected_total',   coll.cash + coll.upi + coll.card,
  -- positive means the fillers handed over less than the meters say they owed
  'collection_short',  (sales.amt - credit.amt) - (coll.cash + coll.upi + coll.card),
  'customer_receipts', recv.total,
  'receipts_cash',     recv.cash,
  'expenses',          exp.total,
  'expenses_cash',     exp.cash,
  'staff_paid',        pay.total,
  'staff_paid_cash',   pay.cash,
  'deposited',         dep.amt,
  'opening_cash',      coalesce(closing.opening_cash, 0),
  'counted_cash',      closing.counted_cash,
  'expected_cash',     coalesce(closing.opening_cash, 0) + coll.cash + recv.cash
                         - exp.cash - pay.cash - dep.amt,
  'status',            coalesce(closing.status::text, 'draft'),
  'notes',             closing.notes,
  'owner_remarks',     closing.owner_remarks
)
from sales, credit, coll, recv, exp, pay, dep
left join closing on true
$fn$;

-- ------------------------------------------------------------ invoicing ---
-- Indian fiscal year, April to March: 2026-08-29 -> '2026-27'
create or replace function fiscal_year_label(d date)
  returns text language sql immutable as $fn$
  select case when extract(month from d) >= 4
    then to_char(d, 'YYYY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YYYY') || '-' || to_char(d, 'YY')
  end
$fn$;

create or replace function next_invoice_number()
  returns text language plpgsql as $fn$
declare
  v_prefix text;
  v_fy     text := fiscal_year_label(current_date);
  v_seq    int;
begin
  select invoice_prefix into v_prefix from stations where id = auth_station_id();
  select coalesce(max(split_part(invoice_number, '/', 3)::int), 0) + 1
    into v_seq
    from invoices
   where station_id = auth_station_id()
     and invoice_number like v_prefix || '/' || v_fy || '/%'
     and split_part(invoice_number, '/', 3) ~ '^\d+$';
  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');
end
$fn$;

-- Bundle a customer's unbilled slips in a period into one invoice.
create or replace function generate_invoice(
  p_customer_id uuid,
  p_from        date,
  p_to          date,
  p_tax_rate    numeric default 0,
  p_due_days    int default 15
) returns uuid language plpgsql as $fn$
declare
  v_id       uuid;
  v_subtotal numeric(14,2);
  v_tax      numeric(14,2);
  v_gross    numeric(14,2);
  v_total    numeric(14,2);
begin
  if not is_back_office() then
    raise exception 'Not allowed to raise invoices';
  end if;

  select coalesce(sum(amount), 0) into v_subtotal
    from credit_sales
   where customer_id = p_customer_id
     and station_id  = auth_station_id()
     and invoice_id is null
     and business_date between p_from and p_to;

  if v_subtotal = 0 then
    raise exception 'No unbilled slips for this customer between % and %', p_from, p_to;
  end if;

  v_tax   := round(v_subtotal * p_tax_rate / 100, 2);
  v_gross := v_subtotal + v_tax;
  v_total := round(v_gross, 0);

  insert into invoices (customer_id, invoice_number, period_from, period_to,
                        due_date, subtotal, tax_rate, tax_amount,
                        round_off, total, status, created_by)
  values (p_customer_id, next_invoice_number(), p_from, p_to,
          current_date + p_due_days, v_subtotal, p_tax_rate, v_tax,
          v_total - v_gross, v_total, 'issued', auth.uid())
  returning id into v_id;

  update credit_sales set invoice_id = v_id
   where customer_id = p_customer_id
     and station_id  = auth_station_id()
     and invoice_id is null
     and business_date between p_from and p_to;

  return v_id;
end
$fn$;

-- Keep invoice status in step with what has actually been received against it.
create or replace function recompute_invoice_status() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid    numeric(14,2);
  v_total   numeric(14,2);
begin
  if v_invoice is null then return coalesce(new, old); end if;

  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = v_invoice;
  select total into v_total from invoices where id = v_invoice;

  update invoices set status = case
      when status = 'cancelled' then 'cancelled'
      when v_paid <= 0          then 'issued'
      when v_paid >= v_total    then 'paid'
      else 'partly_paid'
    end::invoice_status
   where id = v_invoice;

  return coalesce(new, old);
end
$fn$;

create trigger payments_touch_invoice
  after insert or update or delete on payments
  for each row execute function recompute_invoice_status();

-- ------------------------------------------------- day close / approval ---
create or replace function submit_day(p_date date, p_counted_cash numeric, p_notes text default null)
  returns void language plpgsql as $fn$
begin
  if not is_back_office() then raise exception 'Not allowed'; end if;

  insert into day_closings (business_date, counted_cash, notes, status,
                            submitted_by, submitted_at,
                            opening_cash)
  values (p_date, p_counted_cash, p_notes, 'submitted', auth.uid(), now(),
          coalesce((select (day_summary(p_date - 1) ->> 'expected_cash')::numeric), 0))
  on conflict (station_id, business_date) do update
    set counted_cash = excluded.counted_cash,
        notes        = excluded.notes,
        status       = 'submitted',
        submitted_by = auth.uid(),
        submitted_at = now();
end
$fn$;

-- Only the owner signs the day off. This is the evening review with father.
create or replace function approve_day(p_date date, p_remarks text default null)
  returns void language plpgsql as $fn$
begin
  if not is_owner() then raise exception 'Only an owner can approve the day'; end if;

  update day_closings
     set status = 'approved', approved_by = auth.uid(),
         approved_at = now(), owner_remarks = p_remarks
   where business_date = p_date and station_id = auth_station_id();

  update shifts set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where business_date = p_date and station_id = auth_station_id() and status <> 'approved';

  insert into audit_log (actor_id, action, entity, details)
  values (auth.uid(), 'approve_day', 'day_closings',
          jsonb_build_object('date', p_date, 'remarks', p_remarks));
end
$fn$;

-- ------------------------------------------------ owner-only: the margin --
create or replace function margin_report(p_from date, p_to date)
  returns jsonb language plpgsql stable as $fn$
declare v jsonb;
begin
  if not is_owner() then raise exception 'Margin figures are owner only'; end if;

  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'litres_sold',   coalesce(s.ltr, 0),
    'sales_value',   coalesce(s.amt, 0),
    'litres_bought', coalesce(b.ltr, 0),
    'purchase_cost', coalesce(b.amt, 0),
    'avg_sale_rate',     case when coalesce(s.ltr,0) > 0 then round(s.amt / s.ltr, 3) end,
    'avg_purchase_rate', case when coalesce(b.ltr,0) > 0 then round(b.amt / b.ltr, 3) end,
    'gross_margin_per_litre',
      case when coalesce(s.ltr,0) > 0 and coalesce(b.ltr,0) > 0
           then round(s.amt / s.ltr - b.amt / b.ltr, 3) end,
    'operating_expenses', coalesce(e.amt, 0) + coalesce(w.amt, 0)
  ) into v
  from (select sum(nr.litres) ltr, sum(nr.amount) amt
          from nozzle_readings nr join shifts sh on sh.id = nr.shift_id
         where sh.business_date between p_from and p_to
           and sh.station_id = auth_station_id()) s,
       (select sum(fp.litres) ltr, sum(fc.amount) amt
          from fuel_purchases fp join fuel_purchase_costs fc on fc.purchase_id = fp.id
         where fp.delivery_date between p_from and p_to
           and fp.station_id = auth_station_id()) b,
       (select sum(amount) amt from expenses
         where business_date between p_from and p_to
           and station_id = auth_station_id()) e,
       (select sum(amount) amt from staff_payments
         where payment_date between p_from and p_to
           and station_id = auth_station_id()) w;
  return v;
end
$fn$;

grant execute on function current_rate, rate_on, day_summary, next_invoice_number,
  generate_invoice, submit_day, approve_day, margin_report, fiscal_year_label
  to authenticated;
