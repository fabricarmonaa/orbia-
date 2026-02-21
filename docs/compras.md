# Compras

## Modos
- **Manual**: alta de compra con proveedor, moneda, notas e ítems.
- **Importar Excel**: preview + commit desde `.xlsx` (field multipart `file`).

## API
- `POST /api/purchases`
- `GET /api/purchases`
- `GET /api/purchases/:id`
- `POST /api/purchases/import/preview`
- `POST /api/purchases/import/commit`

## Errores de import
- `MISSING_FILE_FIELD`
- `INVALID_FILE`
- `FILE_TOO_LARGE`

## Stock y costos
Cada compra:
- crea `purchase_items`
- crea movimiento `PURCHASE` en `stock_movements`
- actualiza `stock_levels` y `average_cost` ponderado.
