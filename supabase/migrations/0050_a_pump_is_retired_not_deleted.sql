-- ============================================================================
--  A pump is retired, not deleted — and the super admin can finish what they
--  started.
--
--  Every table in this app cascades off stations.id. A real delete would wipe
--  a pump's entire history — every shift, every slip, the audit trail — the
--  one thing this app exists to keep safe. Nothing else in here is ever
--  deleted that way: staff, office accounts, equipment are all retired with
--  is_active, never dropped. A pump gets the same treatment.
--
--  Alongside it: the super admin's page could create a pump but never touch
--  one again — no way to see who its accounts actually are, fix a detail
--  typed in wrong, or hand back a password that got lost before the owner
--  ever signed in once. The owner's own equivalents already exist
--  (office_accounts(), resetAccountPassword(), updateStation()) — this gives
--  the super admin the same three, scoped to any pump instead of their own.
-- ============================================================================

alter table stations add column if not exists is_active boolean not null default true;

comment on column stations.is_active is
  'A pump retired by the super admin, not deleted — every shift, slip and '
  'audit record stays exactly as it was. auth_station_id() stops returning '
  'this station the moment it is false, which is what actually cuts off '
  'every login at it; nothing else needed to change.';

-- ---------------------------------------- the one function everything reads --
-- Every RLS policy and most functions in this app ask this one question, so
-- teaching it about a retired pump teaches all of them at once — the same
-- reason pump_day() lives in one place and not sixteen.
create or replace function auth_station_id() returns uuid
  language sql stable security definer set search_path = public as $fn$
  select p.station_id
    from profiles p
    join stations s on s.id = p.station_id
   where p.id = auth.uid() and p.is_active and s.is_active
$fn$;

-- ------------------------------------------------- the super admin sees more --
-- Adding a column to a returns-table function needs a drop first — create or
-- replace cannot change the shape of what it hands back, only the body.
drop function if exists admin_list_pumps();

-- Every field the creation form typed in, not just name and city — the super
-- admin's edit form needs something to prefill, and no RLS policy on
-- stations reaches a platform admin's own RLS-less session to read it any
-- other way.
create or replace function admin_list_pumps()
  returns table (
    station_id     uuid,
    name           text,
    legal_name     text,
    address        text,
    city           text,
    state          text,
    pincode        text,
    gstin          text,
    phone          text,
    invoice_prefix text,
    created_at     timestamptz,
    owners         bigint,
    managers       bigint,
    has_counter    boolean,
    is_active      boolean
  ) language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can list the pumps.';
  end if;

  return query
    select s.id, s.name, s.legal_name, s.address, s.city, s.state, s.pincode,
           s.gstin, s.phone, s.invoice_prefix, s.created_at,
           count(*) filter (where p.role = 'owner'   and p.is_active),
           count(*) filter (where p.role = 'manager' and p.is_active),
           bool_or(p.role = 'counter' and p.is_active),
           s.is_active
      from stations s
      left join profiles p on p.station_id = s.id
     group by s.id
     order by s.created_at desc;
end
$fn$;

-- The list office_accounts() already gives an owner, for any pump instead of
-- just their own. Same reason that function joins auth.users: no policy
-- exposes an email, so it has to come back through here.
create or replace function admin_pump_accounts(p_station_id uuid)
  returns table (
    user_id    uuid,
    full_name  text,
    email      text,
    phone      text,
    role       user_role,
    is_active  boolean,
    created_at timestamptz
  ) language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can see a pump''s accounts.';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.phone, p.role, p.is_active, p.created_at
      from profiles p
      join auth.users u on u.id = p.id
     where p.station_id = p_station_id
     order by p.role, p.full_name;
end
$fn$;

-- Retiring the whole pump, not one account in it.
create or replace function admin_set_pump_active(p_station_id uuid, p_active boolean)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can retire a pump.';
  end if;

  update stations set is_active = p_active where id = p_station_id;
  if not found then
    raise exception 'That pump does not exist.';
  end if;
end
$fn$;

-- Everything the creation form typed in, editable afterward the same way an
-- owner edits it on their own /settings — but the owner's own RLS policy
-- only reaches their own station, so this is a function instead, same as
-- admin_create_pump() already is.
create or replace function admin_update_pump(
  p_station_id uuid,
  p_name       text,
  p_legal      text default null,
  p_address    text default null,
  p_city       text default null,
  p_state      text default null,
  p_pin        text default null,
  p_gstin      text default null,
  p_phone      text default null,
  p_prefix     text default null
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can change a pump''s details.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'The pump needs a name.';
  end if;

  update stations
     set name           = trim(p_name),
         legal_name     = nullif(trim(coalesce(p_legal, '')), ''),
         address        = nullif(trim(coalesce(p_address, '')), ''),
         city           = nullif(trim(coalesce(p_city, '')), ''),
         state          = nullif(trim(coalesce(p_state, '')), ''),
         pincode        = nullif(trim(coalesce(p_pin, '')), ''),
         gstin          = nullif(trim(coalesce(p_gstin, '')), ''),
         phone          = nullif(trim(coalesce(p_phone, '')), ''),
         invoice_prefix = coalesce(nullif(trim(coalesce(p_prefix, '')), ''), invoice_prefix)
   where id = p_station_id;

  if not found then
    raise exception 'That pump does not exist.';
  end if;
end
$fn$;

-- A platform admin has no profile of their own, so profiles_read's own
-- policy (station_id = auth_station_id()) never matches anything for them —
-- they cannot read the table directly to check an account is real before
-- resetting its password. One narrow yes/no answer, not the row itself.
create or replace function admin_account_exists(p_user_id uuid) returns boolean
  language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can check this.';
  end if;
  return exists (select 1 from profiles where id = p_user_id);
end
$fn$;

grant execute on function admin_account_exists(uuid) to authenticated;
grant execute on function admin_list_pumps() to authenticated;
grant execute on function admin_pump_accounts(uuid) to authenticated;
grant execute on function admin_set_pump_active(uuid, boolean) to authenticated;
grant execute on function admin_update_pump(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
