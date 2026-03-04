# ETAPA 11 — QA manual (moldeabilidad real)

## 1) Levantar entorno

```bash
docker compose up -d --build
```

## 2) Crear lista desplegable

```bash
curl -s -X POST http://localhost:3000/api/option-lists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"tecnicos_asignados","name":"Técnicos asignados","entityScope":"ORDER"}'
```

## 3) Crear campo SELECT por entidad (ORDER/SALE/PRODUCT)

```bash
curl -s -X POST http://localhost:3000/api/fields/SALE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Técnico","fieldType":"SELECT","required":false,"config":{"optionListKey":"tecnicos_asignados"}}'
```

## 4) Reordenar campos

```bash
curl -s -X POST http://localhost:3000/api/fields/SALE/reorder \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderedFieldIds":[3,1,2]}'
```

## 5) Guardar valores tipados en ventas

```bash
curl -s -X PUT http://localhost:3000/api/sales/123/custom-fields \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"values":[{"fieldDefinitionId":1,"valueMoneyAmount":"25000","valueMoneyDirection":-1,"currency":"ARS"},{"fieldDefinitionId":2,"valueBool":true},{"fieldDefinitionId":3,"valueDate":"2026-03-04"}]}'
```

## 6) Validaciones SQL

### 6.1 Definiciones de campos por entidad

```sql
SELECT tenant_id, field_key, field_type, required, sort_order, is_active
FROM sale_field_definitions
WHERE tenant_id = :tenant_id
ORDER BY sort_order, id;
```

### 6.2 Valores tipados de venta

```sql
SELECT tenant_id, sale_id, field_definition_id, value_money_amount, value_bool, value_date, currency
FROM sale_field_values
WHERE tenant_id = :tenant_id AND sale_id = :sale_id
ORDER BY field_definition_id;
```

### 6.3 Auditoría de campos y listas

```sql
SELECT action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE tenant_id = :tenant_id
  AND action IN (
    'FIELD_CREATED','FIELD_UPDATED','FIELD_REORDERED','FIELD_DEACTIVATED','FIELD_REACTIVATED',
    'OPTION_LIST_CREATED','OPTION_LIST_UPDATED','OPTION_LIST_DELETED',
    'OPTION_LIST_ITEM_CREATED','OPTION_LIST_ITEM_UPDATED','OPTION_LIST_ITEM_DELETED'
  )
ORDER BY created_at DESC
LIMIT 100;
```
