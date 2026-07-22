#!/usr/bin/env bash
# Apply the Atlas migration to a Postgres/Supabase database.
#
# Usage:
#   DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
#     ./scripts/apply-migration.sh
#
# Get the connection string from Supabase → Project Settings → Database.
# The migration is idempotent-friendly (create table if not exists) but RLS
# policies are created unconditionally; run against a fresh project.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to your Supabase Postgres connection string}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$DIR/supabase/migrations/001_atlas_core.sql"

echo "Applying $MIGRATION ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION"
echo "Done. 15 tables + RLS + bootstrap functions installed."
