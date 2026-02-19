# Orbia local (Docker + DB setup one-shot)

## Requisitos
- Docker + Docker Compose plugin
- Node 20+
- npm

## Arranque rápido (copy/paste)
```bash
npm install
npm run dev:docker
```

Este comando hace automáticamente:
1. `docker compose up -d --build`
2. espera PostgreSQL (`SELECT 1`)
3. corre migraciones (`drizzle-kit push`)
4. corre seed idempotente (`db-seed`)
5. reinicia `web`

App: http://127.0.0.1:5000

## Alternativa manual (paso a paso)
```bash
docker compose down -v
docker compose up -d --build
DATABASE_URL=postgresql://orbia:orbia_change_me@127.0.0.1:5432/orbia npm run db:setup
docker compose restart web
```

## Windows PowerShell
```powershell
npm install
./scripts/dev-docker.ps1
```

## Verificación automática
```bash
DATABASE_URL=postgresql://orbia:orbia_change_me@127.0.0.1:5432/orbia npm run verify:local
```

## Checklist SQL rápido
```bash
docker compose exec postgres psql -U orbia -d orbia -c "\\dt"
docker compose exec postgres psql -U orbia -d orbia -c "select email,is_super_admin from users where is_super_admin=true;"
```
