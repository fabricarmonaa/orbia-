# Performance: Read Models con Materialized Views

## Vistas materializadas
- `mv_sales_history`
- `mv_cash_daily`
- `mv_reports_daily_sales`

Todas incluyen `tenant_id` para aislamiento multi-tenant.

## Refresh
- Endpoint admin: `POST /api/admin/refresh-views`
- Script manual: `npx tsx script/refresh-views.ts`

## Fallback
- Historial de ventas y series de reportes intentan leer MV.
- Si la MV no existe, se usa query normal.
