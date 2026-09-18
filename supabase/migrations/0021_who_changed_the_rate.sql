-- Who changed the rate.
--
-- The rate is the one number the whole day hangs off, so its history page asks
-- who set each one. It reads fuel_prices.created_by, which every screen was
-- free to forget — and did. The database fills it in instead, the same way
-- station_id is filled in, so a new screen cannot lose the name.
alter table fuel_prices alter column created_by set default auth.uid();

-- Backfill from what the audit trigger already knows: a price's insert row
-- carries the actor. Done with the audit trigger off, because "the database
-- wrote down who had always done this" is not a change anyone made.
alter table fuel_prices disable trigger fuel_prices_audit;

update fuel_prices p
   set created_by = a.actor_id
  from audit_log a
 where a.entity    = 'fuel_prices'
   and a.entity_id = p.id
   and a.action    = 'insert'
   and a.actor_id is not null
   and p.created_by is null;

alter table fuel_prices enable trigger fuel_prices_audit;
