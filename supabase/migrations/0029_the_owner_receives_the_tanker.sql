-- ============================================================================
--  The owner receives the tanker.
--
--  A delivery is the one entry that adds stock, and it arrives with an invoice
--  from the depot worth several lakh rupees. The owner is the one who signs for
--  it, so he is the one who writes it down — the same reasoning that already
--  keeps fuel_purchase_costs owner-only.
--
--  The manager still reads all of it: she cannot check a day against the stock
--  she cannot see. What she may no longer do is create, change or delete a
--  delivery.
--
--  Dips are untouched. They are taken every shift, by whoever is there.
-- ============================================================================

do $do$
declare t text;
begin
  foreach t in array array['fuel_purchases', 'fuel_deliveries'] loop
    execute format('drop policy if exists %I on %I', t || '_back_office', t);

    -- The office reads it. The stock page is no use to a manager otherwise.
    execute format(
      'create policy %I on %I for select to authenticated '
      'using (station_id = auth_station_id() and is_back_office())',
      t || '_office_read', t);

    -- The owner writes it.
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (station_id = auth_station_id() and is_owner()) '
      'with check (station_id = auth_station_id() and is_owner())',
      t || '_owner_write', t);
  end loop;
end
$do$;
