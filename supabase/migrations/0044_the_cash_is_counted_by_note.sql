-- ============================================================================
--  The cash is counted by note, not typed as one number.
--
--  A filler does not arrive at a figure and type it in; they count what's in
--  the box — so many 500s, so many 100s, down to the coins — and the total is
--  whatever that comes to. Typing the total straight into one box skipped the
--  part that actually catches a mistake: a miscounted stack of notes reads
--  exactly like a real shortfall on screen, and there is no way back to which
--  denomination it was.
--
--  So the count is taken the way it is actually counted, and the total is
--  still exactly what it was before — shift_collections.cash_amount is
--  computed from the denominations here rather than typed, so every view,
--  report and reconciliation that already reads it keeps working unchanged.
-- ============================================================================

create table shift_cash_denominations (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id) on delete cascade
                 default auth_station_id(),
  shift_id     uuid not null references shifts(id) on delete cascade,
  staff_id     uuid not null references staff(id)  on delete cascade,
  -- India's actual coins and notes. Nothing above 500: the ₹2,000 note was
  -- withdrawn, and a pump that somehow takes one can write it in as two 500s
  -- without the count lying about what physically changed hands.
  denomination int not null check (denomination in (1, 2, 5, 10, 20, 50, 100, 200, 500)),
  count        int not null default 0 check (count >= 0),
  updated_at   timestamptz not null default now(),
  unique (shift_id, staff_id, denomination)
);

create index shift_cash_denominations_shift_idx on shift_cash_denominations (shift_id);

alter table shift_cash_denominations enable row level security;

comment on table shift_cash_denominations is
  'How a filler''s cash breaks down by note and coin. shift_collections.'
  'cash_amount is computed from this, not typed, so it is always exactly '
  'what the denominations add to.';

-- ------------------------------------------------------------------- RLS ---
-- Same shape as shift_collections' own policies: the counter reads and
-- writes today's and yesterday's, only while the shift is open, and the
-- back office reads everything — the forecourt's count is the book's count.
create policy cash_denom_counter_read on shift_cash_denominations for select to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s
                     where s.id = shift_id and s.business_date >= pump_day() - 1));
create policy cash_denom_counter_write on shift_cash_denominations for insert to authenticated
  with check (station_id = auth_station_id() and auth_role() = 'counter'
              and exists (select 1 from shifts s
                          where s.id = shift_id and s.status = 'open'));
create policy cash_denom_counter_update on shift_cash_denominations for update to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s where s.id = shift_id and s.status = 'open'))
  with check (station_id = auth_station_id() and auth_role() = 'counter');
create policy cash_denom_counter_delete on shift_cash_denominations for delete to authenticated
  using (station_id = auth_station_id() and auth_role() = 'counter'
         and exists (select 1 from shifts s where s.id = shift_id and s.status = 'open'));
create policy cash_denom_back_office on shift_cash_denominations for select to authenticated
  using (station_id = auth_station_id() and is_back_office());

drop trigger if exists shift_cash_denominations_audit on shift_cash_denominations;
create trigger shift_cash_denominations_audit after insert or update or delete
  on shift_cash_denominations for each row execute function audit_write();

-- --------------------------------------------------- the office reads it ---
create or replace view v_shift_cash_denominations with (security_invoker = true) as
select
  d.shift_id,
  d.station_id,
  d.staff_id,
  st.name,
  st.name_gu,
  d.denomination,
  d.count
from shift_cash_denominations d
join staff st on st.id = d.staff_id;

revoke insert, update, delete on v_shift_cash_denominations from authenticated;
grant select on v_shift_cash_denominations to authenticated;

comment on view v_shift_cash_denominations is
  'A filler''s cash, by note and coin, named. What the forecourt counted, '
  'the office can see.';

-- ---------------------------------------------------------- the function ---
-- Same contract as record_shift_cash(): one call settles every filler on the
-- shift at once, a filler left out of the payload is taken off the shift's
-- money entirely, and it is still cash and only cash — the card machine and
-- UPI are the pump's, entered on the money log, never here.
create or replace function record_shift_cash_count(
  p_shift_id uuid,
  -- [{staff_id, denominations: [{denomination, count}, ...]}, ...]
  p_counts   jsonb default '[]'::jsonb
) returns numeric language plpgsql security definer set search_path = public as $fn$
declare
  v_shift shifts;
  v_kept  uuid[] := '{}';
  v_total numeric(14,2) := 0;
  v_staff numeric(14,2);
  r       record;
  d       record;
begin
  select * into v_shift from shifts where id = p_shift_id;

  if v_shift.id is null or v_shift.station_id <> auth_station_id() then
    raise exception 'That shift is not this pump''s.';
  end if;
  if v_shift.status = 'approved' then
    raise exception 'This shift has been approved. Ask the office to reopen it.';
  end if;
  if auth_role() = 'counter' and v_shift.business_date < pump_day() - 1 then
    raise exception 'That shift is too old to change from the counter.';
  end if;

  for r in select (e ->> 'staff_id')::uuid as staff_id, e -> 'denominations' as denominations
             from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) e
            where e ->> 'staff_id' is not null
  loop
    if not exists (select 1 from shift_fillers f
                    where f.shift_id = p_shift_id and f.staff_id = r.staff_id) then
      raise exception 'That person was not on this shift.';
    end if;

    delete from shift_cash_denominations
     where shift_id = p_shift_id and staff_id = r.staff_id;

    v_staff := 0;
    for d in select (e ->> 'denomination')::int as denomination,
                     (e ->> 'count')::int       as count
               from jsonb_array_elements(coalesce(r.denominations, '[]'::jsonb)) e
    loop
      if d.denomination not in (1, 2, 5, 10, 20, 50, 100, 200, 500) then
        raise exception 'Not a real note or coin: %', d.denomination;
      end if;
      if d.count is null or d.count < 0 then
        raise exception 'A note or coin count cannot be less than nothing.';
      end if;
      continue when d.count = 0;

      insert into shift_cash_denominations (station_id, shift_id, staff_id, denomination, count)
      values (v_shift.station_id, p_shift_id, r.staff_id, d.denomination, d.count);

      v_staff := v_staff + d.denomination * d.count;
    end loop;

    insert into shift_collections (station_id, shift_id, staff_id, cash_amount)
    values (v_shift.station_id, p_shift_id, r.staff_id, v_staff)
    on conflict (shift_id, staff_id) do update
      set cash_amount = excluded.cash_amount;

    v_kept  := v_kept || r.staff_id;
    v_total := v_total + v_staff;
  end loop;

  -- A filler taken off the count is taken off the shift's money too, exactly
  -- as record_shift_cash() already did.
  delete from shift_collections
   where shift_id = p_shift_id
     and staff_id is not null
     and staff_id <> all (v_kept);
  delete from shift_cash_denominations
   where shift_id = p_shift_id
     and staff_id <> all (v_kept);

  return v_total;
end
$fn$;

revoke execute on function record_shift_cash_count(uuid, jsonb) from public;
grant execute on function record_shift_cash_count(uuid, jsonb) to authenticated;

comment on function record_shift_cash_count(uuid, jsonb) is
  'The cash each filler handed over, counted note by note. cash_amount is '
  'computed from the denominations, never typed. record_shift_cash() (0037) '
  'is left as it was for anything still calling it; the counter now calls '
  'this instead.';
