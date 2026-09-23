#!/usr/bin/env bash
# Rebuild the test database from scratch and run the schema + assertions.
#
# The migrations are globbed, not listed. A hand-written list silently tested
# yesterday's schema every time somebody added a file and forgot this one.
set -euo pipefail
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

# The pump's clock is Indian. Migration 0005 sets the database timezone, but
# this session opened before that ran, so it would keep the machine's own —
# and on a machine in New York `current_date` is a day behind `pump_day()`,
# which converts to Asia/Kolkata. The counter's RLS compares the two, so the
# suite passed or failed by the hour. Connect on the pump's clock instead.
export PGTZ=Asia/Kolkata
DB=pump_test
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -h localhost -U "$USER" -d postgres -qtAc "drop database if exists $DB;" >/dev/null
psql -h localhost -U "$USER" -d postgres -qtAc "create database $DB;" >/dev/null

args=(-f "$ROOT/supabase/test/00_auth_stub.sql")
for m in "$ROOT"/supabase/migrations/*.sql; do args+=(-f "$m"); done
args+=(-f "$ROOT/supabase/test/01_seed.sql" -f "$ROOT/supabase/test/02_assert.sql")

psql -h localhost -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q "${args[@]}"
