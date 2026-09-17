-- ============================================================================
--  Four ways money comes in at the end of a shift.
--
--  cash  · ATM  · UPI  · BPCL card
--
--  "ATM" is what the pump calls the card-swipe machine — any bank's debit or
--  credit card. The BPCL card is different: BPCL issues it to a customer, the
--  customer loads money onto it, and spends it at BPCL pumps. So the fuel is
--  paid for, but by BPCL rather than by the person at the nozzle — it settles
--  into the bank later, exactly as an ATM swipe or a UPI collection does.
--
--  It is therefore NOT udhaar. Nobody owes the pump for it. It belongs on the
--  collections side of the day, and it never touches the cash box.
-- ============================================================================

alter type payment_mode add value if not exists 'bpcl_card';

alter table shift_collections
  add column if not exists bpcl_amount numeric(14,2) not null default 0;

comment on column shift_collections.bpcl_amount is
  'Fuel paid for with a BPCL-issued prepaid card. Collected, not owed — it
   settles to the bank like a card swipe, and is not cash in hand.';
