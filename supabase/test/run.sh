#!/usr/bin/env bash
# Rebuild the test database from scratch and run the schema + assertions.
set -euo pipefail
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
DB=pump_test
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -h localhost -U "$USER" -d postgres -qtAc "drop database if exists $DB;" >/dev/null
psql -h localhost -U "$USER" -d postgres -qtAc "create database $DB;" >/dev/null
psql -h localhost -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT/supabase/test/00_auth_stub.sql" \
  -f "$ROOT/supabase/migrations/0001_schema.sql" \
  -f "$ROOT/supabase/migrations/0002_rls.sql" \
  -f "$ROOT/supabase/migrations/0003_logic.sql" \
  -f "$ROOT/supabase/migrations/0004_grants_and_locks.sql" \
  -f "$ROOT/supabase/migrations/0005_timezone.sql" \
  -f "$ROOT/supabase/migrations/0006_nozzle_state.sql" \
  -f "$ROOT/supabase/migrations/0007_cash_position.sql" \
  -f "$ROOT/supabase/migrations/0008_reports.sql" \
  -f "$ROOT/supabase/test/01_seed.sql" \
  -f "$ROOT/supabase/test/02_assert.sql"
