#!/usr/bin/env bash
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-postgresql://orbia:orbia_change_me@127.0.0.1:5432/orbia}"

echo "[1/5] docker compose up -d --build"
docker compose up -d --build

echo "[2/5] waiting for postgres"
npx tsx script/wait-for-postgres.ts

echo "[3/5] db push"
npx drizzle-kit push

echo "[4/5] db seed"
npx tsx script/db-seed.ts

echo "[5/5] restart web"
docker compose restart web

echo "Done. App: http://127.0.0.1:5000"
