-- ============================================================================
--  When the shifts change over is the pump's own business.
--
--  7am and 7pm were written into the code, which is fine until the pump moves
--  its handover to 8 — and then there is no setting to change, only a
--  developer. The hours belong to the station, and the database is the
--  authority: pump_day() reads them, so RLS and the business_date defaults
--  follow the pump rather than a constant somebody has to remember to edit.
-- ============================================================================

alter table stations
  add column if not exists day_starts_at   time not null default '07:00',
  add column if not exists night_starts_at time not null default '19:00';

comment on column stations.day_starts_at is
  'When the day shift takes over — and so when the pump''s working day rolls.';
comment on column stations.night_starts_at is
  'When the night shift takes over.';

-- The working day rolls with the day shift, whenever the pump says that is.
create or replace function pump_day(at timestamptz default now())
  returns date language sql stable as $fn$
  select case
    when (at at time zone 'Asia/Kolkata')::time
         >= coalesce((select day_starts_at from stations where id = auth_station_id()),
                     '07:00'::time)
      then (at at time zone 'Asia/Kolkata')::date
    else (at at time zone 'Asia/Kolkata')::date - 1
  end
$fn$;

-- The shift being worked, by the pump's own clock. One place, so a screen
-- cannot disagree with a policy about which shift somebody is standing in.
create or replace function pump_shift(at timestamptz default now())
  returns text language sql stable as $fn$
  select case
    when (at at time zone 'Asia/Kolkata')::time >= s.day_starts_at
     and (at at time zone 'Asia/Kolkata')::time <  s.night_starts_at
      then 'Day' else 'Night'
  end
  from stations s where s.id = auth_station_id()
$fn$;

grant execute on function pump_shift(timestamptz) to authenticated;
