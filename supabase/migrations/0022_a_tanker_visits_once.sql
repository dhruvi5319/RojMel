-- ============================================================================
--  One tanker, several tanks.
--
--  A delivery is a tanker coming from the depot. It has compartments, and on
--  the same trip it brings petrol and diesel — the pump does not log the
--  compartments, it logs what was decanted into each of its own tanks.
--
--  The old model had no room for that: one fuel_purchases row was the whole
--  delivery, so a tanker carrying two products had to be entered twice, with
--  the tanker number, the seal and the date typed twice and nothing tying the
--  two halves together. A short delivery argument is about the tanker, and the
--  book could not show the tanker.
--
--  So the tanker's own facts move up to fuel_deliveries, and fuel_purchases
--  becomes what it always was underneath: what went into one tank.
-- ============================================================================

create table if not exists fuel_deliveries (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references stations(id) on delete cascade
                   default auth_station_id(),
  delivery_date  date not null default today_ist(),
  tanker_number  text,
  seal_number    text,
  seals_intact   boolean,
  water_check_ok boolean,
  received_by    uuid references staff(id) on delete set null,
  notes          text,
  created_by     uuid references profiles(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists fuel_deliveries_date_idx
  on fuel_deliveries (station_id, delivery_date desc);

comment on table fuel_deliveries is
  'One tanker arriving from the depot. Its compartments are not logged; what '
  'each tank received is a fuel_purchases row against this delivery.';

alter table fuel_purchases
  add column if not exists delivery_id uuid references fuel_deliveries(id) on delete cascade;

-- ------------------------------------------------------------ backfill -----
-- Everything already written was one tanker per row, or two rows a manager
-- typed for one tanker. Same day and same tanker number means one visit.
do $do$
declare r record;
begin
  -- Only the first time: once the tanker's facts have moved up, the columns
  -- this reads are gone, and there is nothing left to group.
  if not exists (select 1 from information_schema.columns
                  where table_name = 'fuel_purchases'
                    and column_name = 'tanker_number') then
    return;
  end if;

  for r in
    select station_id, delivery_date, coalesce(tanker_number, '') as tanker
      from fuel_purchases
     where delivery_id is null
     group by 1, 2, 3
  loop
    with src as (
      select *
        from fuel_purchases
       where station_id = r.station_id
         and delivery_date = r.delivery_date
         and coalesce(tanker_number, '') = r.tanker
         and delivery_id is null
       order by created_at
       limit 1
    ), made as (
      insert into fuel_deliveries (station_id, delivery_date, tanker_number,
                                   seal_number, seals_intact, water_check_ok,
                                   received_by, created_by, created_at)
      select src.station_id, src.delivery_date, nullif(r.tanker, ''),
             src.seal_number, src.seals_intact, src.water_check_ok,
             src.received_by, src.created_by, src.created_at
        from src
      returning id
    )
    update fuel_purchases fp
       set delivery_id = made.id
      from made
     where fp.station_id = r.station_id
       and fp.delivery_date = r.delivery_date
       and coalesce(fp.tanker_number, '') = r.tanker
       and fp.delivery_id is null;
  end loop;
end
$do$;

alter table fuel_purchases alter column delivery_id set not null;
create index if not exists fuel_purchases_delivery_idx on fuel_purchases (delivery_id);

-- --------------------------------------------------- one home per fact -----
-- The date stays on the line as well, because the tank's stock arithmetic and
-- the purchases report read it directly and an index needs it. The tanker is
-- the authority; a trigger keeps the line in step so the two can never differ.
create or replace function sync_delivery_date() returns trigger
  language plpgsql as $fn$
begin
  select delivery_date into new.delivery_date
    from fuel_deliveries where id = new.delivery_id;
  return new;
end
$fn$;

drop trigger if exists fuel_purchases_date on fuel_purchases;
create trigger fuel_purchases_date before insert or update of delivery_id
  on fuel_purchases for each row execute function sync_delivery_date();

create or replace function cascade_delivery_date() returns trigger
  language plpgsql as $fn$
begin
  if new.delivery_date is distinct from old.delivery_date then
    update fuel_purchases set delivery_date = new.delivery_date
     where delivery_id = new.id;
  end if;
  return new;
end
$fn$;

drop trigger if exists fuel_deliveries_date on fuel_deliveries;
create trigger fuel_deliveries_date after update of delivery_date
  on fuel_deliveries for each row execute function cascade_delivery_date();

-- The view reads these off the line today, so it goes first and is rebuilt
-- below against their new home.
drop view if exists v_deliveries;

alter table fuel_purchases
  drop column if exists tanker_number,
  drop column if exists seal_number,
  drop column if exists seals_intact,
  drop column if exists water_check_ok,
  drop column if exists received_by;

-- ----------------------------------------------------------------- RLS -----
alter table fuel_deliveries enable row level security;

-- The same licence fuel_purchases has: the back office writes the paperwork.
drop policy if exists fuel_deliveries_back_office on fuel_deliveries;
create policy fuel_deliveries_back_office on fuel_deliveries for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());

grant select, insert, update, delete on fuel_deliveries to authenticated;

drop trigger if exists fuel_deliveries_audit on fuel_deliveries;
create trigger fuel_deliveries_audit after insert or update or delete
  on fuel_deliveries for each row execute function audit_write();

-- ------------------------------------------------- what arrived, by tank ---
-- One row per tank filled, carrying the tanker it came off, so the page can
-- group the lines under their visit and the old readers keep their columns.
create or replace view v_deliveries with (security_invoker = true) as
select
  fp.id,
  fp.station_id,
  fp.delivery_id,
  d.delivery_date,
  fp.tank_id,
  t.name            as tank_name,
  fp.fuel_type_id,
  ft.name           as fuel_name,
  ft.unit,
  d.tanker_number,
  d.seal_number,
  d.seals_intact,
  d.water_check_ok,
  d.received_by,
  st.name           as received_by_name,
  fp.density,
  fp.temperature_c,
  fp.ordered_litres,
  fp.invoice_litres,
  fp.tanker_dip_litres,
  fp.litres,
  fp.dip_before_litres,
  fp.dip_after_litres,
  fp.decanted_at,
  coalesce(fp.notes, d.notes) as notes,
  -- What the tank actually gained, when both dips were taken.
  case when fp.dip_after_litres is not null and fp.dip_before_litres is not null
       then fp.dip_after_litres - fp.dip_before_litres end as tank_gain_litres,
  -- Short or over against the challan. Negative means short delivery.
  case when fp.invoice_litres is not null
       then fp.litres - fp.invoice_litres end             as invoice_variance,
  case when fp.ordered_litres is not null
       then fp.litres - fp.ordered_litres end             as order_variance
from fuel_purchases fp
join fuel_deliveries d on d.id = fp.delivery_id
join tanks t           on t.id = fp.tank_id
join fuel_types ft     on ft.id = fp.fuel_type_id
left join staff st     on st.id = d.received_by;

revoke insert, update, delete on v_deliveries from authenticated;
grant select on v_deliveries to authenticated;

-- ------------------------------------------------------- the visit itself --
-- The tanker as the book sees it: one line per trip, with what it dropped.
drop view if exists v_tanker_visits;
create view v_tanker_visits with (security_invoker = true) as
select
  d.id,
  d.station_id,
  d.delivery_date,
  d.tanker_number,
  d.seal_number,
  d.seals_intact,
  d.water_check_ok,
  st.name                              as received_by_name,
  d.notes,
  count(fp.id)                         as tanks_filled,
  coalesce(sum(fp.litres), 0)          as litres,
  coalesce(sum(fp.invoice_litres), 0)  as invoice_litres,
  string_agg(distinct ft.name, ' + ' order by ft.name) as fuels
from fuel_deliveries d
left join fuel_purchases fp on fp.delivery_id = d.id
left join fuel_types ft     on ft.id = fp.fuel_type_id
left join staff st          on st.id = d.received_by
group by d.id, st.name;

revoke insert, update, delete on v_tanker_visits from authenticated;
grant select on v_tanker_visits to authenticated;
