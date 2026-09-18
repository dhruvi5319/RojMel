-- ============================================================================
--  CNG arrives on a truck, and it is weighed in kilograms.
--
--  This was modelled as a pipeline: Gujarat Gas metering standard cubic metres
--  at an inlet, the pump selling kilos off the other end, and a conversion
--  nobody at the pump ever does. It is wrong. A CNG truck comes in exactly as
--  a petrol tanker does, with its own challan, and what it drops is kilograms
--  — the same unit the dispenser sells in, so the day needs no conversion at
--  all and a short delivery is arithmetic instead of a guess.
-- ============================================================================

alter table cng_supply
  add column if not exists kg_received    numeric(14,3),
  add column if not exists invoice_kg     numeric(14,3),
  add column if not exists tanker_number  text,
  add column if not exists received_by    uuid references staff(id) on delete set null;

comment on column cng_supply.kg_received is 'What the truck actually dropped.';
comment on column cng_supply.invoice_kg  is 'What the challan says was loaded.';

-- Nothing real was ever recorded in cubic metres — the figure came from a
-- model of a pipeline that does not exist here. Anything already entered is
-- taken at face value as the kilograms someone meant.
update cng_supply set kg_received = scm_received
 where kg_received is null and scm_received is not null;

alter table cng_supply alter column scm_received drop not null;
alter table cng_supply alter column scm_received drop default;
alter table cng_supply alter column kg_received set not null;
alter table cng_supply add constraint cng_supply_kg_positive check (kg_received >= 0);

-- A truck can come twice in a day, so the day is no longer the key.
alter table cng_supply drop constraint if exists cng_supply_station_id_supply_date_key;

alter table cng_supply
  drop column if exists opening_scm,
  drop column if exists closing_scm,
  drop column if exists scm_received;

-- The money side follows the unit it is bought in.
alter table cng_supply_costs
  add column if not exists rate_per_kg numeric(10,3);

update cng_supply_costs set rate_per_kg = rate_per_scm
 where rate_per_kg is null and rate_per_scm is not null;

alter table cng_supply_costs alter column rate_per_scm drop not null;
alter table cng_supply_costs alter column rate_per_scm drop default;
alter table cng_supply_costs drop column if exists rate_per_scm;
alter table cng_supply_costs alter column supplier drop default;

-- ------------------------------------------------- what the trucks brought --
create or replace view v_cng_supply with (security_invoker = true) as
select
  s.id,
  s.station_id,
  s.supply_date,
  s.tanker_number,
  s.invoice_number,
  s.invoice_kg,
  s.kg_received,
  st.name as received_by_name,
  s.notes,
  -- Short or over against the challan. Negative means short delivery.
  case when s.invoice_kg is not null
       then s.kg_received - s.invoice_kg end as invoice_variance
from cng_supply s
left join staff st on st.id = s.received_by;

revoke insert, update, delete on v_cng_supply from authenticated;
grant select on v_cng_supply to authenticated;
