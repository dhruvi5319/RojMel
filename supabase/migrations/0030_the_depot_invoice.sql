-- ============================================================================
--  The depot's invoice, as the paper actually reads.
--
--  Modelled from a real BPCL tax invoice (Koyali installation, 29 Aug 2026,
--  one tanker carrying 5 KL of petrol and 15 KL of diesel). Three things in
--  the old model were wrong:
--
--  1. The rate is printed PER KILOLITRE — 81,326.69/KL — not per litre. And
--     the printed rate is rounded: 5 KL at 81,326.69 comes to 406,633.45,
--     while the invoice says 406,633.46, because the depot bills a per-litre
--     rate carried further than it prints. So the basic amount is COPIED off
--     the paper, never recomputed from the rate. The rate is kept because it
--     is what you argue about; the amount is kept because it is what you pay.
--
--  2. There are two taxes, not one. VAT at a rate that differs by product
--     (13.7% on petrol, 14.9% on diesel) and a CESS of 4% — and the cess is
--     charged on the basic plus the delivery charge PLUS the VAT, not on the
--     basic alone. Getting that wrong understates a 20 KL load by ~2,000.
--
--  3. There is a DLY/TAXABLE CHARGE per product, taxed with the fuel.
--
--  With those three right, this reproduces the invoice to the paisa:
--    petrol  406,633.46 + 3,999.10 -> VAT 56,256.66, CESS 18,675.57
--    diesel  1,177,615.73 + 11,968.80 -> VAT 177,248.09, CESS 54,673.30
--    total   1,907,070.71 + 0.29 rounding = 1,907,071.00
-- ============================================================================

-- ------------------------------------------------ what the paper says -------
alter table fuel_purchase_costs
  add column if not exists quantity_kl     numeric(10,3),
  add column if not exists rate_per_kl     numeric(12,3),
  add column if not exists delivery_charge numeric(14,2) not null default 0,
  add column if not exists cess_rate       numeric(6,3),
  add column if not exists cess_amount     numeric(14,2);

comment on column fuel_purchase_costs.quantity_kl is
  'Quantity as the invoice prints it, in kilolitres.';
comment on column fuel_purchase_costs.rate_per_kl is
  'Rate as the invoice prints it, per kilolitre.';
comment on column fuel_purchase_costs.delivery_charge is
  'DLY/TAXABLE CHARGE — taxed along with the fuel.';
comment on column fuel_purchase_costs.cess_rate is
  'Charged on the basic plus the delivery charge plus the VAT.';

-- The invoice is one document covering every product on the tanker, so its
-- number, date and rounding belong to the trip and not to each line. The
-- number is not a secret; the amounts are, and they stay in the owner-only
-- table beside them.
alter table fuel_deliveries
  add column if not exists invoice_number   text,
  add column if not exists invoice_at       timestamptz,
  add column if not exists shipment_doc_no  text,
  add column if not exists delivery_note_no text,
  add column if not exists bay_no           text,
  add column if not exists transporter_code text,
  add column if not exists gate_in_at       timestamptz,
  add column if not exists gate_out_at      timestamptz,
  add column if not exists rounding_off     numeric(8,2) not null default 0;

comment on column fuel_deliveries.rounding_off is
  'The invoice''s own rounding line, so the total tallies with the paper.';

-- Per product, off the invoice's own product block.
alter table fuel_purchases
  add column if not exists product_code    text,
  add column if not exists product_name    text,
  add column if not exists batch_number    text,
  add column if not exists hsn_code        text,
  add column if not exists density_at_15c  numeric(6,1);

comment on column fuel_purchases.product_name is
  'What the depot calls it — "EBMS", "HSD (BS VI)" — which is not what the pump calls it.';

-- --------------------------------------------- the arithmetic, in Postgres --
-- The client formats; it does not work out what is owed. The owner types what
-- the invoice prints and this derives the rest, so the total it shows him can
-- be checked against the paper before he saves it.
create or replace function purchase_invoice_line(
  p_basic           numeric,
  p_delivery_charge numeric,
  p_vat_rate        numeric,
  p_cess_rate       numeric
) returns jsonb language sql immutable as $fn$
  with t as (
    select round(coalesce(p_basic, 0) + coalesce(p_delivery_charge, 0), 2) as taxable
  ), v as (
    select t.taxable,
           round(t.taxable * coalesce(p_vat_rate, 0) / 100, 2) as vat
      from t
  ), c as (
    select v.taxable, v.vat,
           round((v.taxable + v.vat) * coalesce(p_cess_rate, 0) / 100, 2) as cess
      from v
  )
  select jsonb_build_object(
    'taxable', c.taxable,
    'vat',     c.vat,
    'cess',    c.cess,
    'amount',  round(c.taxable + c.vat + c.cess, 2)
  ) from c
$fn$;

grant execute on function purchase_invoice_line(numeric, numeric, numeric, numeric) to authenticated;

-- Writing a line of the invoice. Owner only, like the rest of the cost side.
create or replace function record_purchase_invoice(
  p_purchase_id     uuid,
  p_quantity_kl     numeric default null,
  p_rate_per_kl     numeric default null,
  p_basic           numeric default 0,
  p_delivery_charge numeric default 0,
  p_vat_rate        numeric default null,
  p_cess_rate       numeric default null,
  p_supplier        text    default null,
  p_product_code    text    default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_money jsonb;
  v_station uuid;
begin
  if not is_owner() then
    raise exception 'Only an owner can record what the fuel cost.';
  end if;

  select station_id into v_station from fuel_purchases where id = p_purchase_id;
  if v_station is null or v_station <> auth_station_id() then
    raise exception 'That delivery is not this pump''s.';
  end if;

  v_money := purchase_invoice_line(p_basic, p_delivery_charge, p_vat_rate, p_cess_rate);

  insert into fuel_purchase_costs (
    purchase_id, station_id, supplier, quantity_kl, rate_per_kl,
    rate_per_litre, basic_amount, delivery_charge,
    vat_rate, vat_amount, cess_rate, cess_amount, amount
  ) values (
    p_purchase_id, v_station, nullif(trim(coalesce(p_supplier, '')), ''),
    p_quantity_kl, p_rate_per_kl,
    -- Kept in step so nothing downstream has to know which unit it was typed
    -- in; a kilolitre is a thousand litres and that will not change.
    case when p_rate_per_kl is not null then round(p_rate_per_kl / 1000, 3) end,
    round(coalesce(p_basic, 0), 2), round(coalesce(p_delivery_charge, 0), 2),
    p_vat_rate, (v_money ->> 'vat')::numeric,
    p_cess_rate, (v_money ->> 'cess')::numeric,
    (v_money ->> 'amount')::numeric
  )
  on conflict (purchase_id) do update set
    supplier        = excluded.supplier,
    quantity_kl     = excluded.quantity_kl,
    rate_per_kl     = excluded.rate_per_kl,
    rate_per_litre  = excluded.rate_per_litre,
    basic_amount    = excluded.basic_amount,
    delivery_charge = excluded.delivery_charge,
    vat_rate        = excluded.vat_rate,
    vat_amount      = excluded.vat_amount,
    cess_rate       = excluded.cess_rate,
    cess_amount     = excluded.cess_amount,
    amount          = excluded.amount;

  if p_product_code is not null then
    update fuel_purchases set product_code = p_product_code where id = p_purchase_id;
  end if;

  return v_money;
end
$fn$;

grant execute on function record_purchase_invoice(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;

-- ------------------------------------------- the invoice, totalled up -------
-- Owner-only by construction: it reads fuel_purchase_costs, whose policy
-- already answers a manager with no rows.
create or replace view v_delivery_invoice with (security_invoker = true) as
select
  d.id                                  as delivery_id,
  d.station_id,
  d.delivery_date,
  d.invoice_number,
  d.invoice_at,
  d.tanker_number,
  d.rounding_off,
  count(c.purchase_id)                  as lines,
  coalesce(sum(c.basic_amount), 0)      as basic_amount,
  coalesce(sum(c.delivery_charge), 0)   as delivery_charge,
  coalesce(sum(c.vat_amount), 0)        as vat_amount,
  coalesce(sum(c.cess_amount), 0)       as cess_amount,
  coalesce(sum(c.amount), 0) + d.rounding_off as invoice_total
from fuel_deliveries d
join fuel_purchases fp      on fp.delivery_id = d.id
join fuel_purchase_costs c  on c.purchase_id = fp.id
group by d.id;

revoke insert, update, delete on v_delivery_invoice from authenticated;
grant select on v_delivery_invoice to authenticated;
