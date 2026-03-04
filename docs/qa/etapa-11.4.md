# ETAPA 11.4 — QA manual (Form Builder + visibilidad)

## Canonicidad definida

- **Merge canónico de campos en pedidos:** `field_definitions` manda en `fieldType` + `config` + validaciones.
- El preset solo aporta `sortOrder` y flags de UI (`required` final = `global.required || preset.required`).
- **Tracking público canónico:** se lee desde `entity_visibility_settings`.
  - Compatibilidad legado: si no existe fila en `entity_visibility_settings` para `ORDER`, se usa `tracking_settings` solo como fallback de lectura.
  - Escritura canónica: `/api/visibility/ORDER`.

## 1) Crear option list “tecnicos” + ítems

```bash
curl -s -X POST http://localhost:3000/api/option-lists \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"key":"tecnicos","name":"Técnicos"}'
```

```bash
curl -s -X POST http://localhost:3000/api/option-lists/tecnicos/items \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"label":"Juan","value":"juan"}'
```

## 2) Crear field ORDER SELECT con optionListKey

```bash
curl -s -X POST http://localhost:3000/api/fields/ORDER \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"presetId":1,"label":"Técnico asignado","fieldType":"SELECT","config":{"optionListKey":"tecnicos"}}'
```

## 3) Forzar conflicto de merge (misma key, tipo distinto)

```bash
curl -s -X POST http://localhost:3000/api/fields/ORDER \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"presetId":1,"label":"Repuesto","key":"repuesto","fieldType":"MONEY","config":{"direction":"OUT"}}'
```

Intentar luego crear/editar en preset un campo `key=repuesto` con otro tipo (por ejemplo `TEXT`).

**Esperado:** UI usa la definición canónica (`MONEY`) y muestra warning de conflicto, sin romper render.

## 4) Crear pedido y verificar merge canónico

```bash
curl -s -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "type":"PEDIDO",
    "customerName":"Cliente QA",
    "customFields":[
      {"fieldId":1,"valueJson":{"value":"juan","label":"Juan"}},
      {"fieldId":2,"valueMoneyAmount":"15000","valueMoneyDirection":-1,"currency":"ARS"}
    ]
  }'
```

## 5) Ajustar visibilidad para ORDER (fuente canónica)

```bash
curl -s -X PUT http://localhost:3000/api/visibility/ORDER \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"settings":{"showOrderNumber":true,"showType":true,"showCreatedUpdated":false,"showFullHistory":false,"showHistoryTimestamps":false,"showTosButton":true}}'
```

## 6) Ver tracking y validar switches

```bash
curl -s http://localhost:3000/api/tracking/$PUBLIC_TOKEN
```

Validar que tracking no muestre timestamps/historial completo cuando los switches están en `false`.

## 7) SQL de validación end-to-end

### 7.1 Valores custom en ventas

```sql
SELECT tenant_id, sale_id, field_definition_id, field_key, value_money_amount, value_bool, value_date, currency
FROM sale_field_values
WHERE tenant_id = :tenant_id AND sale_id = :sale_id
ORDER BY field_definition_id;
```

### 7.2 Valores custom en productos

```sql
SELECT tenant_id, product_id, field_definition_id, field_key, value_text, value_number, value_money_amount, value_bool, value_date
FROM product_field_values
WHERE tenant_id = :tenant_id AND product_id = :product_id
ORDER BY field_definition_id;
```

### 7.3 Valores custom en pedidos

```sql
SELECT tenant_id, order_id, field_definition_id, field_key, value_text, value_number, value_money_amount, value_bool, value_date, value_json
FROM order_field_values
WHERE tenant_id = :tenant_id AND order_id = :order_id
ORDER BY field_definition_id;
```

### 7.4 Verificar no duplicados por key (canon)

```sql
SELECT tenant_id, order_id, field_key, COUNT(*)
FROM order_field_values
WHERE tenant_id = :tenant_id
GROUP BY tenant_id, order_id, field_key
HAVING COUNT(*) > 1;
```

Esperado: **0 filas**.

### 7.5 Configuración de visibilidad

```sql
SELECT tenant_id, entity_type, settings, updated_at
FROM entity_visibility_settings
WHERE tenant_id = :tenant_id
ORDER BY entity_type;
```

### 7.6 Auditoría de cambios relevantes

```sql
SELECT action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE tenant_id = :tenant_id
  AND action IN (
    'FIELD_CREATED','FIELD_UPDATED','FIELD_REORDERED','FIELD_DEACTIVATED','FIELD_REACTIVATED',
    'OPTION_LIST_CREATED','OPTION_LIST_UPDATED','OPTION_LIST_DELETED',
    'OPTION_LIST_ITEM_CREATED','OPTION_LIST_ITEM_UPDATED','OPTION_LIST_ITEM_DELETED',
    'FIELD_VALUES_UPDATED','VISIBILITY_SETTINGS_UPDATED','SALE_FIELD_MONEY_CASH_IMPACT'
  )
ORDER BY created_at DESC
LIMIT 200;
```

### 7.7 Impacto contable MONEY en ventas (idempotente)

```sql
SELECT tenant_id, sale_id, type, amount, category, description, created_at
FROM cash_movements
WHERE tenant_id = :tenant_id
  AND sale_id = :sale_id
  AND category = 'field_money'
ORDER BY created_at ASC;
```

Esperado: una sola fila por referencia `sale:{saleId}:field:{fieldKey}`.
