$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://orbia:orbia_change_me@127.0.0.1:5432/orbia"
}

Write-Host "[1/5] docker compose up -d --build"
docker compose up -d --build

Write-Host "[2/5] waiting for postgres"
npx tsx script/wait-for-postgres.ts

Write-Host "[3/5] db push"
npx drizzle-kit push

Write-Host "[4/5] db seed"
npx tsx script/db-seed.ts

Write-Host "[5/5] restart web"
docker compose restart web

Write-Host "Done. App: http://127.0.0.1:5000"
