# DB Hardening Checklist (Atomicity, Pagination, Integrity)

## Paginación obligatoria
Listados volumétricos soportan `limit` + `page` (y en órdenes también `cursor`):

- `GET /api/orders?limit=50&page=1`
- `GET /api/orders?limit=50&cursor=<base64url>`
- `GET /api/sales?limit=50&page=1`
- `GET /api/customers?limit=50&page=1`

Defaults seguros:
- `limit` por defecto: `50`
- `limit` máximo: `200`

## Política de borrado / integridad referencial
- `order_status_history.order_id` y `order_comments.order_id`: `ON DELETE CASCADE`.
- Customers mantiene estrategia de hard-delete bloqueado por ventas (`CUSTOMER_HAS_SALES`) en aplicación.
- Recomendación operativa para maestros (`products`, `customers`, `users`, `branches`): preferir **soft-delete** en flujos de negocio.

## Atomicidad en mutaciones
- Cambio de estado de orden + inserción de historial se ejecuta en transacción (`orders-service`).
- Ejecución STT crea interacción `PENDING` y persiste `SUCCESS/FAILED` para evitar efectos sin rastro.

## Smoke checks manuales (curl)

### 1) Orders paginados
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/orders?limit=20&page=1"
```

### 2) Customers paginados
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/customers?limit=20&page=1"
```

### 3) Sales paginadas
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/sales?limit=20&page=1"
```

### 4) Atomicidad status/historial
```bash
curl -i -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusCode":"EN_PROCESO","note":"qa-atomicity"}' \
  "http://localhost:5000/api/orders/123/status"
```

### 5) Unique DB de customers (mismo tenant)
```bash
curl -i -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cliente A","doc":"30111222","email":"a@example.com"}' \
  "http://localhost:5000/api/customers"

curl -i -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cliente B","doc":"30111222","email":"b@example.com"}' \
  "http://localhost:5000/api/customers"
```
Esperado: segundo request conflict (`409`) por duplicado y DB protegida por unique index.

## Deploy notes
1. Ejecutar migraciones SQL nuevas antes de desplegar web:
   - `20260314_db_integrity_uniques_fk.sql`
2. Si hay duplicados previos en customers por `doc`/`email`, la migración aborta con mensaje explícito.
3. Mantener `AI_SERVICE_URL` y `AI_REQUEST_TIMEOUT_MS` configurados.
