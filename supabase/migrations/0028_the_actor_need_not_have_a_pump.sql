-- ============================================================================
--  An audited actor is a login, not necessarily one of a pump's people.
--
--  audit_log.actor_id pointed at profiles, which was true of everyone who
--  could write anything — until the super admin, who deliberately belongs to
--  no pump and so has no profile row. The result was that creating a pump
--  failed on the audit trigger of its own first insert: the one act the super
--  admin exists to perform was the one act the trail could not record.
--
--  So the column follows auth.users, and the trail says "Super admin" where
--  there is no profile to name.
-- ============================================================================

alter table audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

-- The owner reads this back, so it has to name the actor either way.
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
  coalesce(p.full_name,
           case when pa.user_id is not null then 'Super admin' end,
           'System')                      as actor_name,
  coalesce(a.actor_role, p.role)          as actor_role
from audit_log a
left join profiles p         on p.id = a.actor_id
left join platform_admins pa on pa.user_id = a.actor_id;

revoke insert, update, delete on v_audit from authenticated;
grant select on v_audit to authenticated;
