-- ============================================================================
--  Grants, and protection for a day the owner has already signed off.
-- ============================================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Views are read-only by nature.
revoke insert, update, delete on v_customer_balances, v_tank_stock from authenticated;

-- ---------------------------------------------------------------- locks ---
-- Once father approves a day, the manager can no longer change its numbers.
-- Corrections after that point are the owner's call, and they leave a trail.
create or replace function day_is_locked(p_date date)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from day_closings
     where business_date = p_date
       and station_id = auth_station_id()
       and status = 'approved')
$fn$;

create or replace function guard_locked_day() returns trigger
  language plpgsql as $fn$
declare
  v_date date;
  v_row  record;
begin
  v_row := coalesce(new, old);

  -- Find the business date this row belongs to.
  if tg_table_name = 'nozzle_readings' or tg_table_name = 'shift_collections' then
    select business_date into v_date from shifts where id = v_row.shift_id;
  elsif tg_table_name = 'payments' or tg_table_name = 'staff_payments' then
    v_date := v_row.payment_date;
  elsif tg_table_name = 'bank_deposits' then
    v_date := v_row.deposit_date;
  else
    v_date := v_row.business_date;
  end if;

  if v_date is not null and day_is_locked(v_date) and not is_owner() then
    raise exception
      'The books for % are approved and locked. Ask an owner to reopen the day.', v_date
      using errcode = 'check_violation';
  end if;

  return v_row;
end
$fn$;

do $do$
declare t text;
begin
  foreach t in array array[
    'nozzle_readings','shift_collections','credit_sales',
    'expenses','staff_payments','bank_deposits','payments','tank_dips'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on %I '
      'for each row execute function guard_locked_day()',
      t || '_locked_day', t);
  end loop;
end
$do$;

-- Reopening is explicit, owner-only, and recorded.
create or replace function reopen_day(p_date date, p_reason text)
  returns void language plpgsql as $fn$
begin
  if not is_owner() then raise exception 'Only an owner can reopen a day'; end if;

  update day_closings set status = 'submitted', approved_by = null, approved_at = null
   where business_date = p_date and station_id = auth_station_id();

  update shifts set status = 'submitted', approved_by = null, approved_at = null
   where business_date = p_date and station_id = auth_station_id();

  insert into audit_log (actor_id, action, entity, details)
  values (auth.uid(), 'reopen_day', 'day_closings',
          jsonb_build_object('date', p_date, 'reason', p_reason));
end
$fn$;

grant execute on function day_is_locked, reopen_day to authenticated;
