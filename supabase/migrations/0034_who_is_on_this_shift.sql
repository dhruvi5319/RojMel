-- ============================================================================
--  Who is on this shift.
--
--  A shift is worked by several fillers, and which of them is normally on the
--  day and which on the night is the office's to decide. But a pump is not a
--  roster: somebody does not turn up and a colleague takes their shift, and
--  that has to be sayable on the device, by the people standing there, at
--  6.55 in the morning.
--
--  So there are two facts, not one:
--    staff.default_shift  who is normally on which shift — the office sets it
--    shift_fillers        who actually worked a given shift — the device says
--
--  The second is seeded from the first when a shift opens, and then belongs
--  to the shift. Changing the roster afterwards does not rewrite history.
-- ============================================================================

alter table staff
  add column if not exists default_shift text
    check (default_shift is null or default_shift in ('Day', 'Night'));

comment on column staff.default_shift is
  'Which shift this filler normally works. Null means no fixed shift.';

-- --------------------------------------------- who actually worked it ------
create table if not exists shift_fillers (
  shift_id   uuid not null references shifts(id) on delete cascade,
  staff_id   uuid not null references staff(id)  on delete cascade,
  station_id uuid not null references stations(id) on delete cascade
               default auth_station_id(),
  -- True when this is somebody standing in for the filler who was rostered.
  covering   boolean not null default false,
  added_at   timestamptz not null default now(),
  primary key (shift_id, staff_id)
);

create index if not exists shift_fillers_shift_idx on shift_fillers (shift_id);

comment on table shift_fillers is
  'Who worked a shift. Seeded from staff.default_shift when the shift opens, '
  'then it belongs to the shift — changing the roster later does not rewrite '
  'who was standing there.';

-- ------------------------------------------------- seeded, not remembered --
create or replace function seed_shift_fillers() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  insert into shift_fillers (shift_id, staff_id, station_id)
  select new.id, s.id, new.station_id
    from staff s
   where s.station_id = new.station_id
     and s.is_active
     and s.default_shift = new.name
  on conflict do nothing;

  return new;
end
$fn$;

drop trigger if exists shifts_seed_fillers on shifts;
create trigger shifts_seed_fillers after insert on shifts
  for each row execute function seed_shift_fillers();

-- ---------------------------------------------------------------- RLS ------
alter table shift_fillers enable row level security;

create policy shift_fillers_back_office on shift_fillers for all to authenticated
  using (station_id = auth_station_id() and is_back_office())
  with check (station_id = auth_station_id() and is_back_office());

-- The device says who actually turned up, for a shift it can still write to.
create policy shift_fillers_counter_read on shift_fillers for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.business_date >= pump_day() - 1));

create policy shift_fillers_counter_write on shift_fillers for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status <> 'approved'
                            and s.business_date >= pump_day() - 1));

create policy shift_fillers_counter_delete on shift_fillers for delete to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.status <> 'approved'
                       and s.business_date >= pump_day() - 1));

grant select, insert, update, delete on shift_fillers to authenticated;

drop trigger if exists shift_fillers_audit on shift_fillers;
create trigger shift_fillers_audit after insert or update or delete
  on shift_fillers for each row execute function audit_write();

-- ------------------------------------------- the shift's people, named -----
create or replace view v_shift_fillers with (security_invoker = true) as
select
  sf.shift_id,
  sf.station_id,
  sf.staff_id,
  st.name,
  st.name_gu,
  sf.covering,
  -- Standing in for somebody: they are here but this is not their shift.
  st.default_shift,
  sf.added_at
from shift_fillers sf
join staff st on st.id = sf.staff_id;

revoke insert, update, delete on v_shift_fillers from authenticated;
grant select on v_shift_fillers to authenticated;
