#!/usr/bin/env bash
# =============================================================================
# Run the migrations + database tests against a LOCAL, DISPOSABLE PostgreSQL.
#
#   PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run-local.sh
#
# Uses tests/support/supabase_stubs.sql to emulate Supabase's auth/storage
# schemas, so this proves the SQL logic on vanilla PostgreSQL 16, NOT that it
# behaves identically on a real Supabase project. With the Supabase CLI and
# Docker available, prefer: `supabase db reset && supabase test db` (the same
# test file also works with `psql` against the local Supabase database).
#
# NEVER point this at a real project: it drops and recreates the database
# named by TEST_DB (default: scms_test).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_DB="${TEST_DB:-scms_test}"
if [[ "$TEST_DB" != *test* ]]; then
  echo "Refusing to run: TEST_DB ('$TEST_DB') must contain 'test'." >&2
  exit 2
fi

dropdb --if-exists "$TEST_DB"
createdb "$TEST_DB"
export PGDATABASE="$TEST_DB"

psql -X -q -v ON_ERROR_STOP=1 -f tests/support/supabase_stubs.sql
for f in migrations/*.sql; do
  echo ">> applying $f"
  psql -X -q -v ON_ERROR_STOP=1 -f "$f"
done
psql -X -q -v ON_ERROR_STOP=1 -f seed.sql

out="$(psql -X -q -t -A -v ON_ERROR_STOP=1 -f tests/database/rls_and_workflow.test.sql)"
echo "$out"
if grep -q '^not ok' <<<"$out"; then
  echo "DATABASE TESTS FAILED" >&2
  exit 1
fi
echo "database tests passed (local PostgreSQL + Supabase stubs)"
