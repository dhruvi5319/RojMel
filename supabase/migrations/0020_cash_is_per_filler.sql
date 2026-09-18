-- ============================================================================
--  Cash is per filler. Everything else is per shift.
--
--  A filler physically hands over a pile of notes, so cash can be attributed
--  to them and they can be short. UPI, the ATM machine and the BPCL card all
--  settle into one account — there is no per-filler split to record, and
--  asking for one invites four made-up numbers where one real one belongs.
--
--  So: a row with a filler against it carries cash and nothing else. The
--  shift's own row carries the account-settled modes.
-- ============================================================================

-- Move anything already recorded against a filler onto the shift's own row.
insert into shift_collections (station_id, shift_id, staff_id, cash_amount,
                               card_amount, upi_amount, bpcl_amount)
select sc.station_id, sc.shift_id, null, 0,
       sum(sc.card_amount), sum(sc.upi_amount), sum(sc.bpcl_amount)
  from shift_collections sc
 where sc.staff_id is not null
   and (sc.card_amount > 0 or sc.upi_amount > 0 or sc.bpcl_amount > 0)
 group by sc.station_id, sc.shift_id
on conflict (shift_id, staff_id) do update
   set card_amount = shift_collections.card_amount + excluded.card_amount,
       upi_amount  = shift_collections.upi_amount  + excluded.upi_amount,
       bpcl_amount = shift_collections.bpcl_amount + excluded.bpcl_amount;

update shift_collections
   set card_amount = 0, upi_amount = 0, bpcl_amount = 0
 where staff_id is not null;

alter table shift_collections
  drop constraint if exists filler_hands_over_cash_only;

alter table shift_collections
  add constraint filler_hands_over_cash_only
  check (
    staff_id is null
    or (card_amount = 0 and upi_amount = 0 and bpcl_amount = 0)
  );

comment on constraint filler_hands_over_cash_only on shift_collections is
  'A filler hands over cash. UPI, ATM and the BPCL card settle into one
   account, so they belong to the shift rather than to a person.';
