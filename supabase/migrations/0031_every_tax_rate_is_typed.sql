-- ============================================================================
--  Every tax rate is typed, and CNG is taxed the same way.
--
--  VAT is not one number: it differs by product on a single invoice (13.7% on
--  petrol, 14.9% on diesel) and it moves when the state moves it. The cess
--  moves too. Neither is ever assumed anywhere — they are columns on the line,
--  typed off the paper in front of the owner, with no default.
--
--  This migration finishes the job on the gas side, which had been left with
--  one tax and no cess, and worked its money out in TypeScript:
--
--    * cess_rate / cess_amount / delivery_charge, as on liquid fuel
--    * the same arithmetic function, so the two cannot drift apart
--    * the basic amount copied off the invoice rather than kg x rate
--
--  And it adds the one thing that makes a variable rate bearable to work with:
--  what the rate was last time, shown as a hint beside the empty box. A hint,
--  never a default — a rate that fills itself in is a rate nobody checks.
-- ============================================================================

alter table cng_supply_costs
  add column if not exists quantity_kg     numeric(14,3),
  add column if not exists delivery_charge numeric(14,2) not null default 0,
  add column if not exists cess_rate       numeric(6,3),
  add column if not exists cess_amount     numeric(14,2);

comment on column cng_supply_costs.cess_rate is
  'Typed off the invoice. Charged on the value plus the delivery charge plus '
  'the VAT, exactly as on a liquid fuel invoice.';

-- One way in, and the same arithmetic as the tanker's invoice.
create or replace function record_cng_invoice(
  p_supply_id       uuid,
  p_quantity_kg     numeric default null,
  p_rate_per_kg     numeric default null,
  p_basic           numeric default 0,
  p_delivery_charge numeric default 0,
  p_vat_rate        numeric default null,
  p_cess_rate       numeric default null,
  p_supplier        text    default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_money   jsonb;
  v_station uuid;
begin
  if not is_owner() then
    raise exception 'Only an owner can record what the gas cost.';
  end if;

  select station_id into v_station from cng_supply where id = p_supply_id;
  if v_station is null or v_station <> auth_station_id() then
    raise exception 'That delivery is not this pump''s.';
  end if;

  v_money := purchase_invoice_line(p_basic, p_delivery_charge, p_vat_rate, p_cess_rate);

  insert into cng_supply_costs (
    supply_id, station_id, supplier, quantity_kg, rate_per_kg,
    basic_amount, delivery_charge, vat_rate, vat_amount,
    cess_rate, cess_amount, amount
  ) values (
    p_supply_id, v_station, nullif(trim(coalesce(p_supplier, '')), ''),
    p_quantity_kg, p_rate_per_kg,
    round(coalesce(p_basic, 0), 2), round(coalesce(p_delivery_charge, 0), 2),
    p_vat_rate, (v_money ->> 'vat')::numeric,
    p_cess_rate, (v_money ->> 'cess')::numeric,
    (v_money ->> 'amount')::numeric
  )
  on conflict (supply_id) do update set
    supplier        = excluded.supplier,
    quantity_kg     = excluded.quantity_kg,
    rate_per_kg     = excluded.rate_per_kg,
    basic_amount    = excluded.basic_amount,
    delivery_charge = excluded.delivery_charge,
    vat_rate        = excluded.vat_rate,
    vat_amount      = excluded.vat_amount,
    cess_rate       = excluded.cess_rate,
    cess_amount     = excluded.cess_amount,
    amount          = excluded.amount;

  return v_money;
end
$fn$;

grant execute on function record_cng_invoice(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- ------------------------------------------- what the rate was last time ----
-- Rates move, so the owner should not have to remember what he typed in
-- August. This is a hint for the form, per fuel, and owner-only because it is
-- read off the cost tables.
create or replace view v_last_purchase_tax with (security_invoker = true) as
with liquid as (
  select fp.fuel_type_id,
         c.vat_rate,
         c.cess_rate,
         c.rate_per_kl,
         null::numeric as rate_per_kg,
         fp.station_id,
         fp.delivery_date as on_date,
         row_number() over (partition by fp.fuel_type_id
                            order by fp.delivery_date desc, c.created_at desc) as recency
    from fuel_purchase_costs c
    join fuel_purchases fp on fp.id = c.purchase_id
), gas as (
  select ft.id as fuel_type_id,
         c.vat_rate,
         c.cess_rate,
         null::numeric as rate_per_kl,
         c.rate_per_kg,
         s.station_id,
         s.supply_date as on_date,
         row_number() over (partition by ft.id
                            order by s.supply_date desc, c.created_at desc) as recency
    from cng_supply_costs c
    join cng_supply s on s.id = c.supply_id
    join fuel_types ft on ft.station_id = s.station_id and ft.unit = 'kg'
)
select fuel_type_id, station_id, on_date, vat_rate, cess_rate, rate_per_kl, rate_per_kg
  from liquid where recency = 1
union all
select fuel_type_id, station_id, on_date, vat_rate, cess_rate, rate_per_kl, rate_per_kg
  from gas where recency = 1;

revoke insert, update, delete on v_last_purchase_tax from authenticated;
grant select on v_last_purchase_tax to authenticated;
