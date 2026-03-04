# ETAPA 10.1 — QA manual reproducible (VPS)

## 1) Levantar stack

```bash
docker compose up -d --build
```

## 2) Obtener token de un usuario

> Ajustá usuario/clave según tu seed.

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.local","password":"admin123"}'
```

Guardar `token` y `tenantId`.

## 3) Ver sucursales accesibles

```bash
curl -s http://localhost:3000/api/branches/me \
  -H "Authorization: Bearer $TOKEN"
```

## 4) Validar BRANCH_REQUIRED (sin x-branch-id)

```bash
curl -i -s http://localhost:3000/api/stock \
  -H "Authorization: Bearer $TOKEN"
```

Esperado: `403` con body que incluya `"code":"BRANCH_REQUIRED"`.

## 5) Validar BRANCH_FORBIDDEN (branch incorrecta)

```bash
curl -i -s http://localhost:3000/api/stock \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-branch-id: 999999"
```

Esperado: `403` con body que incluya `"code":"BRANCH_FORBIDDEN"`.

## 6) Flujo de transferencia (create -> send -> receive)

```bash
curl -s -X POST http://localhost:3000/api/stock/transfers \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fromBranchId":1,"toBranchId":2,"items":[{"productId":1,"qty":1}]}'
```

```bash
curl -s -X POST http://localhost:3000/api/stock/transfers/$TRANSFER_ID/send \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X POST http://localhost:3000/api/stock/transfers/$TRANSFER_ID/receive \
  -H "Authorization: Bearer $TOKEN"
```

Repetir receive para validar idempotencia:

```bash
curl -s -X POST http://localhost:3000/api/stock/transfers/$TRANSFER_ID/receive \
  -H "Authorization: Bearer $TOKEN"
```

Esperado: responde OK estable, sin duplicar movimientos.

## 7) SQL de validación

### 7.1 Movimientos de stock por transferencia

```sql
SELECT tenant_id, branch_id, product_id, movement_type, quantity, reference_id, created_at
FROM stock_movements
WHERE reference_id = :transfer_id
ORDER BY created_at ASC;
```

Esperado: exactamente un `TRANSFER_OUT` y un `TRANSFER_IN` por item.

### 7.2 Auditoría de transferencias

```sql
SELECT tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE entity_type = 'stock_transfer'
  AND entity_id = :transfer_id::text
ORDER BY created_at ASC;
```

Esperado: acciones `stock.transfer.create`, `stock.transfer.send`, `stock.transfer.receive` (y `stock.transfer.cancel` si aplica), con metadata útil (`from_branch_id`, `to_branch_id`, `items_count`).

### 7.3 Verificar migración idempotente (tenant_id en transfer items)

```sql
SELECT sti.id, sti.transfer_id, sti.tenant_id, st.tenant_id AS transfer_tenant_id
FROM stock_transfer_items sti
JOIN stock_transfers st ON st.id = sti.transfer_id
WHERE sti.tenant_id IS DISTINCT FROM st.tenant_id;
```

Esperado: 0 filas.
