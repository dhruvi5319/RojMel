-- ============================================================================
--  Who may create an account.
--
--  Until now there was no answer: a pump and its people were made by pasting
--  supabase/setup/create_pump.sql into the SQL editor, and nobody could change
--  a password without an administrator. Nobody signs themselves up, which is
--  right for a pump — but "right" has to be something the app can do, not a
--  thing you need psql for.
--
--  The chain, decided by the owner of this pump:
--
--    super admin  creates the pump, its first owner, and the counter device
--    owner        adds and removes the office accounts — managers change
--    owner/manager adds the fillers, who have no login at all (staff)
--
--  A super admin belongs to no pump, so they are not a user_role: a role sits
--  on a profile, and a profile sits in a station. They get their own table and
--  reach the pumps only through the functions below, so no station policy has
--  to be widened to let them past.
-- ============================================================================

create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- Nobody reads this table through the API — not even a super admin. The
-- functions below answer the only question anyone needs to ask of it.
create or replace function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$fn$;

grant execute on function is_platform_admin() to authenticated;

-- ------------------------------------------------------- making a pump -----
-- The auth login itself is made through Supabase's admin API, which needs the
-- service key and so lives in a server action. This is the other half: the
-- station and the profile that ties the new login to it, done as the super
-- admin so the audit trigger records who really did it.
create or replace function admin_create_pump(
  p_owner_user_id uuid,
  p_owner_name    text,
  p_name          text,
  p_legal         text default null,
  p_address       text default null,
  p_city          text default null,
  p_state         text default 'Gujarat',
  p_pin           text default null,
  p_gstin         text default null,
  p_phone         text default null,
  p_prefix        text default 'RP'
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_station uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can create a pump.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'The pump needs a name.';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'The owner needs a name.';
  end if;
  if exists (select 1 from profiles where id = p_owner_user_id) then
    raise exception 'That login already belongs to a pump.';
  end if;

  insert into stations (name, legal_name, address, city, state, pincode,
                        gstin, phone, invoice_prefix)
  values (trim(p_name), nullif(trim(coalesce(p_legal, '')), ''),
          nullif(trim(coalesce(p_address, '')), ''),
          nullif(trim(coalesce(p_city, '')), ''),
          nullif(trim(coalesce(p_state, '')), ''),
          nullif(trim(coalesce(p_pin, '')), ''),
          nullif(trim(coalesce(p_gstin, '')), ''),
          nullif(trim(coalesce(p_phone, '')), ''),
          coalesce(nullif(trim(coalesce(p_prefix, '')), ''), 'RP'))
  returning id into v_station;

  insert into profiles (id, station_id, full_name, role)
  values (p_owner_user_id, v_station, trim(p_owner_name), 'owner');

  return v_station;
end
$fn$;

-- What a super admin sees: the pumps, and nothing inside them.
create or replace function admin_list_pumps()
  returns table (
    station_id  uuid,
    name        text,
    city        text,
    created_at  timestamptz,
    owners      bigint,
    managers    bigint,
    has_counter boolean
  ) language plpgsql security definer set search_path = public as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only a super admin can list the pumps.';
  end if;

  return query
    select s.id, s.name, s.city, s.created_at,
           count(*) filter (where p.role = 'owner'   and p.is_active),
           count(*) filter (where p.role = 'manager' and p.is_active),
           bool_or(p.role = 'counter' and p.is_active)
      from stations s
      left join profiles p on p.station_id = s.id
     group by s.id
     order by s.created_at desc;
end
$fn$;

grant execute on function admin_create_pump(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function admin_list_pumps() to authenticated;

-- --------------------------------------------- the pump's own accounts -----
-- The owner keeps the office. Managers change; the counter device does not,
-- but its password sometimes has to.
create or replace function add_office_account(
  p_user_id   uuid,
  p_full_name text,
  p_role      user_role,
  p_phone     text default null
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not is_owner() then
    raise exception 'Only an owner can add an account.';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'The account needs a name.';
  end if;
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'That login already belongs to a pump.';
  end if;
  -- One device for all the fillers, so there is one counter login.
  if p_role = 'counter' and exists (
    select 1 from profiles
     where station_id = auth_station_id() and role = 'counter' and is_active
  ) then
    raise exception 'This pump already has a counter device login.';
  end if;

  insert into profiles (id, station_id, full_name, phone, role)
  values (p_user_id, auth_station_id(), trim(p_full_name),
          nullif(trim(coalesce(p_phone, '')), ''), p_role);
end
$fn$;

-- Removing somebody is retiring them, not deleting them: their name is on
-- shifts, slips and the audit trail, and those must still read correctly.
create or replace function set_account_active(p_user_id uuid, p_active boolean)
  returns void language plpgsql security definer set search_path = public as $fn$
declare v_role user_role;
begin
  if not is_owner() then
    raise exception 'Only an owner can remove an account.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own account.';
  end if;

  select role into v_role
    from profiles where id = p_user_id and station_id = auth_station_id();
  if v_role is null then
    raise exception 'That account is not at this pump.';
  end if;

  -- A pump with no owner has nobody who can close a day or add an account.
  -- Belt and braces: the rule above already guarantees it, because whoever is
  -- removing is an active owner and cannot remove themselves. This stands in
  -- case that ever changes.
  if v_role = 'owner' and not p_active and (
    select count(*) from profiles
     where station_id = auth_station_id() and role = 'owner' and is_active
       and id <> p_user_id
  ) = 0 then
    raise exception 'This pump would be left with no owner.';
  end if;

  update profiles set is_active = p_active
   where id = p_user_id and station_id = auth_station_id();
end
$fn$;

-- The list the owner works from. The email lives in auth.users, which no
-- policy exposes, so it comes back through here and only for this pump.
create or replace function office_accounts()
  returns table (
    user_id   uuid,
    full_name text,
    email     text,
    phone     text,
    role      user_role,
    is_active boolean,
    is_me     boolean,
    created_at timestamptz
  ) language plpgsql security definer set search_path = public as $fn$
begin
  if not is_back_office() then
    raise exception 'Only the office can see the pump''s accounts.';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.phone, p.role, p.is_active,
           p.id = auth.uid(), p.created_at
      from profiles p
      join auth.users u on u.id = p.id
     where p.station_id = auth_station_id()
     order by p.role, p.full_name;
end
$fn$;

grant execute on function add_office_account(uuid, text, user_role, text) to authenticated;
grant execute on function set_account_active(uuid, boolean) to authenticated;
grant execute on function office_accounts() to authenticated;

-- An account change is a change to the books' permissions, so it is audited
-- like everything else.
drop trigger if exists platform_admins_audit on platform_admins;
create trigger platform_admins_audit after insert or update or delete
  on platform_admins for each row execute function audit_write();
