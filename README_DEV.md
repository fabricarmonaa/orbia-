# README_DEV

Guía corta de baseline/reproducción para Orbia.

## Requisitos
- Node.js 20+
- npm 10+
- PostgreSQL 16+ (o Docker)

## Variables de entorno mínimas
Crear `.env` con al menos:

```bash
DATABASE_URL=postgresql://orbia:orbia@127.0.0.1:5432/orbia
SESSION_SECRET=dev-secret-change-me
PORT=5000
NODE_ENV=development
DEBUG_API=0
```

> `DEBUG_API=1` habilita logs extra en `/api/customers/by-dni` y `/api/sales` para diagnosticar tenant/branch/filtros.

## Correr DB
### Opción Docker (recomendada)
```bash
docker compose up -d postgres
DATABASE_URL=postgresql://postgres:123@127.0.0.1:5050/orbia npm run db:push
DATABASE_URL=postgresql://postgres:123@127.0.0.1:5050/orbia npm run db:seed
```

### Opción local (PostgreSQL en 5432)
```bash
# crear DB/usuario local según tu instalación
db_url=postgresql://orbia:orbia@127.0.0.1:5432/orbia
DATABASE_URL=$db_url npm run db:push
DATABASE_URL=$db_url npm run db:seed
```

## Correr backend + web (modo desarrollo)
```bash
npm install
DATABASE_URL=postgresql://orbia:orbia@127.0.0.1:5432/orbia npm run dev
```

`npm run dev` levanta Express + Vite en el mismo proceso (puerto `5000` por defecto).

## Repro rápida con cURL
> Reemplazar `TOKEN_JWT` por un Bearer válido del tenant/sucursal a probar.

### 1) Buscar cliente por DNI
```bash
curl -i 'http://localhost:5000/api/customers/by-dni?dni=30111222' \
  -H 'Authorization: Bearer TOKEN_JWT' \
  -H 'Accept: application/json'
```

### 2) Historial de ventas
```bash
curl -i 'http://localhost:5000/api/sales?from=2025-01-01&to=2025-12-31&limit=20&offset=0&sort=date_desc' \
  -H 'Authorization: Bearer TOKEN_JWT' \
  -H 'Accept: application/json'
```

## Smoke test ETAPA 1 (by-dni)
Con backend arriba y token válido:

```bash
AUTH_TOKEN=TOKEN_JWT APP_URL=http://localhost:5000 node scripts/smoke_customers_by_dni.mjs
```

## Smoke test ETAPA 2 (sales history)
Con backend arriba y token válido:

```bash
AUTH_TOKEN=TOKEN_JWT APP_URL=http://localhost:5000 node scripts/smoke_sales_history.mjs
```

## Smoke test ETAPA 2.5 (validateQuery express5)
Con backend arriba (si no pasás `AUTH_TOKEN`, el script hace login demo automáticamente):

```bash
APP_URL=http://localhost:5000 node scripts/smoke_validate_query.mjs
```


## Verificar tablas de presets (ETAPA 5.0)
Después de correr migraciones/`db:push`, podés validar con `psql`:

```bash
psql "$DATABASE_URL" -c "\dt order_*"
psql "$DATABASE_URL" -c "SELECT tenant_id, code, label, is_active FROM order_type_definitions ORDER BY tenant_id, code;"
psql "$DATABASE_URL" -c "SELECT tenant_id, order_type_id, field_key, field_type, sort_order FROM order_field_definitions ORDER BY tenant_id, order_type_id, sort_order;"
```


## Smoke test ETAPA 5.1 (order presets admin API)
Con backend arriba (si no pasás `AUTH_TOKEN`, el script hace login demo automáticamente):

```bash
APP_URL=http://localhost:5000 node scripts/smoke_order_presets.mjs
```


## Smoke test ETAPA 5.3 (order custom fields create/read)
Con backend arriba (si no pasás `AUTH_TOKEN`, el script hace login demo automáticamente):

```bash
APP_URL=http://localhost:5000 node scripts/smoke_order_custom_fields.mjs
```
