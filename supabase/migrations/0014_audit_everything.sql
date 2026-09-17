-- ============================================================================
--  Audit every write.
--
--  Until now the trail held only approve_day and reopen_day, so the page that
--  shows it was almost empty. This records every insert, update and delete on
--  the books — and it does so with a database trigger rather than a line in
--  each server action, because a trigger cannot be forgotten when somebody
--  adds a new screen.
--
--  An update stores only the fields that actually changed, old value beside
--  new, so the owner can see what a figure was before somebody moved it.
-- ============================================================================

alter table audit_log
  add column if not exists actor_role user_role,
  add column if not exists changed_at timestamptz;

create or replace function audit_write() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_row     record;
  v_new     jsonb;
  v_old     jsonb;
  v_details jsonb;
  v_id      uuid;
begin
  v_row := coalesce(new, old);
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);

  if tg_op = 'UPDATE' then
    -- Only what moved, as [was, now].
    select jsonb_object_agg(key, jsonb_build_array(v_old -> key, v_new -> key))
      into v_details
      from jsonb_object_keys(v_new) key
     where v_new -> key is distinct from v_old -> key
       and key not in ('created_at', 'updated_at');

    -- An UPDATE that changed nothing is not worth a line.
    if v_details is null or v_details = '{}'::jsonb then
      return v_row;
    end if;
  elsif tg_op = 'INSERT' then
    v_details := v_new;
  else
    v_details := v_old;
  end if;

  -- A four-digit PIN is not something to leave lying in a log.
  if v_details ? 'pin' then
    v_details := jsonb_set(v_details, '{pin}', '"***"');
  end if;

  -- Most tables key on id; the two cost tables key on their parent.
  v_id := nullif(
    coalesce(to_jsonb(v_row) ->> 'id',
             to_jsonb(v_row) ->> 'purchase_id',
             to_jsonb(v_row) ->> 'supply_id'), '')::uuid;

  insert into audit_log (station_id, actor_id, actor_role, action, entity,
                         entity_id, details, changed_at)
  values (
    nullif(to_jsonb(v_row) ->> 'station_id', '')::uuid,
    auth.uid(),
    auth_role(),
    lower(tg_op),
    tg_table_name,
    v_id,
    v_details,
    now()
  );

  return v_row;
end
$fn$;

-- Attach to everything that holds the pump's books. audit_log itself is
-- excluded, or it would write a line about writing a line.
do $do$
declare t text;
begin
  foreach t in array array[
    'stations','profiles','staff','fuel_types','fuel_prices','tanks','nozzles',
    'shifts','nozzle_readings','shift_collections','customers','vehicles',
    'invoices','credit_sales','payments','fuel_purchases','fuel_purchase_costs',
    'tank_dips','expenses','staff_payments','bank_deposits','day_closings',
    'cng_dispensers','cng_readings','cng_supply','cng_supply_costs'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I '
      'for each row execute function audit_write()', t || '_audit', t);
  end loop;
end
$do$;

-- The page reads newest first, and the owner filters by who and by table.
create index if not exists audit_log_entity_idx on audit_log (station_id, entity, created_at desc);
create index if not exists audit_log_actor_idx  on audit_log (station_id, actor_id, created_at desc);

-- A readable view: who, what, which table, and what moved.
create or replace view v_audit with (security_invoker = true) as
select
  a.id,
  a.station_id,
  a.created_at,
  a.action,
  a.entity,
  a.entity_id,
  a.details,
  a.actor_id,
  coalesce(p.full_name, 'System')        as actor_name,
  coalesce(a.actor_role, p.role)         as actor_role
from audit_log a
left join profiles p on p.id = a.actor_id;

revoke insert, update, delete on v_audit from authenticated;
