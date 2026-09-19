-- ============================================================================
--  One idea of "today" at the pump.
--
--  These two columns defaulted to the calendar date, which disagrees with the
--  counter's own policies between midnight and 7am: a slip written at 2am
--  with no date given would default to tomorrow and then be refused by the
--  very policy meant to let it through. The pump has one working day — it
--  rolls at 7am with the day shift — and everything uses it.
-- ============================================================================

alter table credit_sales alter column business_date set default pump_day();
alter table expenses     alter column business_date set default pump_day();
