# Stock avanzado

## Kardex

Cada movimiento queda registrado en `stock_movements` con tipo, referencia, cantidad, costos y usuario.

## Ajustes manuales

Endpoint `POST /api/stock/adjust`:

- `direction: IN|OUT`
- `quantity`
- `reason`

Genera movimiento `ADJUSTMENT_IN/OUT` y actualiza `stock_levels` de forma transaccional.

## Transferencias

- `POST /api/stock/transfers`
- `POST /api/stock/transfers/:id/complete`
- `POST /api/stock/transfers/:id/cancel`

Al completar, se registra `TRANSFER_OUT` + `TRANSFER_IN` y se actualizan ambos niveles.

## Promedio ponderado

En ingresos de compra (`PURCHASE`) se recalcula costo promedio ponderado en `stock_levels.average_cost`.

## Alertas

`GET /api/stock/alerts` devuelve productos con `quantity <= min_stock` por sucursal/central.
