#!/usr/bin/env bash
# =============================================================================
# Validate the migrations + database tests against a REAL local Supabase stack.
#
# STATUS: WRITTEN BUT NEVER EXECUTED. The build session had no Docker daemon,
# no Supabase CLI and no access to the registries that supply them, so this
# script has not been run. Expect to adjust it (and possibly the tests) on first
# use; see "Likely first-run adjustments" in README.md.
#
# Prerequisites: Docker running, Supabase CLI installed (supabase --version).
# Run from anywhere:   ./supabase/tests/run-supabase.sh
#
# This resets the LOCAL development database only (supabase db reset). It
# refuses to run against anything but the local stack's default port.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."          # repository root

command -v docker   >/dev/null || { echo "docker not found" >&2; exit 2; }
command -v supabase >/dev/null || { echo "supabase CLI not found" >&2; exit 2; }
docker info >/dev/null 2>&1     || { echo "docker daemon is not running" >&2; exit 2; }

supabase start                       # idempotent; pulls images on first run
supabase db reset                    # applies supabase/migrations/* then supabase/seed.sql

# Local stack default; refuse anything else so this can never hit a remote project.
DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in *127.0.0.1:54322*|*localhost:54322*) ;; *) echo "refusing non-local DB_URL" >&2; exit 2;; esac

# The suite creates its own fixtures inside one transaction and ROLLS BACK.
# It uses tap_lite only; it does NOT load supabase_stubs.sql (real auth/storage are used).
cd supabase
out="$(psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -f tests/database/rls_and_workflow.test.sql)"
echo "$out"
if grep -q '^not ok' <<<"$out"; then echo "DATABASE TESTS FAILED (real Supabase)" >&2; exit 1; fi
echo "database tests passed (real local Supabase)"
