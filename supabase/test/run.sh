#!/usr/bin/env bash
# Rebuild the test database from scratch and run the schema + assertions.
#
# The migrations are globbed, not listed. A hand-written list silently tested
# yesterday's schema every time somebody added a file and forgot this one.
set -euo pipefail
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
DB=pump_test
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -h localhost -U "$USER" -d postgres -qtAc "drop database if exists $DB;" >/dev/null
psql -h localhost -U "$USER" -d postgres -qtAc "create database $DB;" >/dev/null

args=(-f "$ROOT/supabase/test/00_auth_stub.sql")
for m in "$ROOT"/supabase/migrations/*.sql; do args+=(-f "$m"); done
args+=(-f "$ROOT/supabase/test/01_seed.sql" -f "$ROOT/supabase/test/02_assert.sql")

psql -h localhost -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q "${args[@]}"
