#!/bin/sh
set -e

echo "[Web Entrypoint] Waiting for postgres..."
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"

retries=0
until nc -z "$DB_HOST" "$DB_PORT"; do
  retries=$((retries + 1))
  if [ "$retries" -ge 60 ]; then
    echo "[Web Entrypoint] Postgres not reachable at ${DB_HOST}:${DB_PORT} after 120s"
    exit 1
  fi
  sleep 2
done

echo "[Web Entrypoint] Running SQL migrations idempotently (safe mode)..."
npm run db:push

echo "[Web Entrypoint] Starting server..."
exec node dist/index.cjs
