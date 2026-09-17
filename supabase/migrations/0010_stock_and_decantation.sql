-- ============================================================================
--  Stock every shift, and what actually happened when the tanker decanted.
--
--  Three separate quantities are worth keeping apart on a delivery, because
--  they are what a shortage argument turns on:
--    ordered_litres  what was indented from the company
--    invoice_litres  what the challan says was loaded
--    litres          what actually went into the tank
--
--  The tanker's own dip is taken ONCE, with the product at rest, before
--  decanting starts — a reading taken while it is still moving is worthless.
-- ============================================================================

-- ------------------------------------------------ a dip for every shift ----
-- The dip used to be one per tank per day. Father wants opening and closing
-- stock each shift, so a dip now belongs to a shift; a day-end dip with no
-- shift is still allowed, and still only one per day.
alter table tank_dips
  add column if not exists shift_id uuid references shifts(id) on delete cascade;

alter table tank_dips drop constraint if exists tank_dips_station_id_tank_id_business_date_key;

create unique index if not exists tank_dips_one_per_shift
  on tank_dips (station_id, tank_id, business_date, shift_id) nulls not distinct;

comment on column tank_dips.shift_id is
  'The shift this dip closes. Null means a day-end dip outside any shift.';

-- ----------------------------------------------- the tanker's paperwork ----
alter table fuel_purchases
  add column if not exists ordered_litres    numeric(12,3),
  add column if not exists invoice_litres    numeric(12,3),
  add column if not exists tanker_dip_litres numeric(12,3),
  add column if not exists temperature_c     numeric(5,2),
  add column if not exists seal_number       text,
  add column if not exists seals_intact      boolean,
  add column if not exists water_check_ok    boolean,
  add column if not exists dip_before_litres numeric(12,3),
  add column if not exists dip_after_litres  numeric(12,3),
  add column if not exists decanted_at       timestamptz;

comment on column fuel_purchases.ordered_litres is 'Indented from the company.';
comment on column fuel_purchases.invoice_litres is 'What the challan says was loaded.';
comment on column fuel_purchases.litres is 'What actually went into the tank.';
comment on column fuel_purchases.tanker_dip_litres is
  'The tanker''s own dip, taken once with the product at rest before decanting.';

-- ------------------------------------------------- VAT on the purchase -----
-- Petrol and diesel sit outside GST and attract state VAT, so the invoice
-- splits into a basic amount and the tax on it. This lives in the owner-only
-- table with the rest of the cost, where the manager cannot read it.
alter table fuel_purchase_costs
  add column if not exists basic_amount numeric(14,2),
  add column if not exists vat_rate     numeric(6,3),
  add column if not exists vat_amount   numeric(14,2);

-- --------------------------------------------- what the delivery showed ----
create or replace view v_deliveries with (security_invoker = true) as
select
  fp.id,
  fp.station_id,
  fp.delivery_date,
  fp.tank_id,
  t.name            as tank_name,
  fp.fuel_type_id,
  ft.name           as fuel_name,
  fp.tanker_number,
  fp.seal_number,
  fp.seals_intact,
  fp.water_check_ok,
  fp.density,
  fp.temperature_c,
  fp.ordered_litres,
  fp.invoice_litres,
  fp.tanker_dip_litres,
  fp.litres,
  fp.dip_before_litres,
  fp.dip_after_litres,
  fp.decanted_at,
  fp.notes,
  -- What the tank actually gained, when both dips were taken.
  case when fp.dip_after_litres is not null and fp.dip_before_litres is not null
       then fp.dip_after_litres - fp.dip_before_litres end as tank_gain_litres,
  -- Short or over against the challan. Negative means short delivery.
  case when fp.invoice_litres is not null
       then fp.litres - fp.invoice_litres end             as invoice_variance,
  case when fp.ordered_litres is not null
       then fp.litres - fp.ordered_litres end             as order_variance
from fuel_purchases fp
join tanks t       on t.id = fp.tank_id
join fuel_types ft on ft.id = fp.fuel_type_id;

revoke insert, update, delete on v_deliveries from authenticated;
