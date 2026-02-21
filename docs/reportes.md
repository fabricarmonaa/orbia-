# Reportes profesionales (Analytics)

## Filtros globales
- `from` / `to` obligatorios (ISO date).
- `branchId`, `cashierId`, `paymentMethod` opcionales.

## KPIs
Endpoint: `GET /api/reports/kpis`
- `grossSales`, `netSales`, `salesCount`, `ordersCount`, `avgTicket`
- `cashIn`, `cashOut`
- `topProduct`
- `lowStockCount`
- `compare` incluye delta contra período anterior equivalente.

## Reportes
- `GET /api/reports/sales` (`groupBy`: day/week/month/product/cashier/branch/paymentMethod)
- `GET /api/reports/products` (incluye `estProfit` y `estMarginPct`)
- `GET /api/reports/customers` (ranking por revenue/compras/ticket/última compra)
- `GET /api/reports/cash` (cash in/out/net y serie diaria)

## Export CSV/PDF
- `POST /api/reports/export` con `{ type, params, format }`.
- Genera archivo en `uploads/exports/reports/`.
- Descarga con `GET /api/reports/export/:token`.
- Token firmado HMAC con TTL de 15 minutos.
- CSV protege formula injection prefijando `'` para valores que empiezan por `=,+,-,@`.

## Seguridad
- Endpoints privados de reportes: `tenantAuth + requireTenantAdmin`.
- Endpoint de descarga usa token firmado/expirable para evitar enumeración.
