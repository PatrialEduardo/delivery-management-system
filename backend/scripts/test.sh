#!/usr/bin/env bash
# Run the Go tests against the running compose Postgres.
#
# Why a container: the integration tests need the compose database, and on a
# host that also runs a native Postgres the published port (5433) can be
# ambiguous. Running `go test` inside a throwaway golang container attached
# to the compose network reaches Postgres at the stable `postgres:5432`.
#
# Plain `go test ./...` still works too — the DB-backed tests skip when no
# database is reachable, so unit-only runs stay green offline.
#
# Usage:  backend/scripts/test.sh [go test args...]
#   backend/scripts/test.sh ./internal/ops/ -run TestProduct -v
set -euo pipefail

PROJECT="${COMPOSE_PROJECT_NAME:-delivery-management-system}"
NETWORK="${PROJECT}_default"
DB_URL="${TEST_DATABASE_URL:-postgres://dms_app:d3l1very_.2026@postgres:5432/dms_dev?sslmode=disable}"

cd "$(dirname "$0")/.."
BACKEND_DIR="$(pwd -W 2>/dev/null || pwd)"

exec env MSYS_NO_PATHCONV=1 docker run --rm \
  --network "$NETWORK" \
  -v "${BACKEND_DIR}:/src" -w /src \
  -v dms-gocache:/go/pkg/mod \
  -e TEST_DATABASE_URL="$DB_URL" \
  golang:1.24-alpine \
  go test "${@:-./...}"
