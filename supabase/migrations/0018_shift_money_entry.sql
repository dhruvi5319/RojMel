-- ============================================================================
--  Let the money be written where the book writes it.
--
--  Takings were only enterable per filler, on the shift screen. But the book
--  records money per shift — cash, ATM, UPI, BPCL card — and attributing it to
--  a particular filler is a separate, optional matter. So a shift may now carry
--  one row with no filler against it: the shift's own takings.
--
--  Postgres treats NULLs as distinct in a unique index by default, which would
--  allow a second and a third such row. NULLS NOT DISTINCT keeps it to one.
-- ============================================================================

alter table shift_collections
  drop constraint if exists shift_collections_shift_id_staff_id_key;

create unique index if not exists shift_collections_one_per_filler
  on shift_collections (shift_id, staff_id) nulls not distinct;

comment on column shift_collections.staff_id is
  'The filler who handed this over. Null means it is the shift''s takings as a
   whole, entered on the money log rather than split by filler.';
