#!/bin/sh
set -e

echo "[Web Entrypoint] Waiting for postgres..."
# simple retry loop using pg_isready or just waiting via ts script (since wait-for-postgres.ts is in package.json)
node --experimental-specifier-resolution=node dist/script/wait-for-postgres.cjs 2>/dev/null || npm run db:wait || sleep 5

echo "[Web Entrypoint] Running SQL migrations idempotently (safe mode)..."
# In Etapa 2 we will map this to run-sql-migrations.ts
node dist/script/run-sql-migrations.cjs || npx tsx script/run-sql-migrations.ts || echo "No migration script yet, continuing."

echo "[Web Entrypoint] Starting server..."
exec node dist/index.cjs
