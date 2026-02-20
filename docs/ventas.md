# Módulo de Ventas (POS)

## Alcance
- Alta de ventas con carrito, descuentos/recargos y método de pago.
- Impacto transaccional en stock (por sucursal o central).
- Integración con caja (`cash_movements`) al confirmar venta.
- Historial de ventas y endpoint de ticket listo para impresión.

## Endpoints
- `POST /api/sales`
- `GET /api/sales`
- `GET /api/sales/:id`
- `POST /api/sales/:id/print-data`

## Reglas clave
- Multi-tenant obligatorio (`tenant_id`) y branch scope respetado.
- Validación y sanitización vía `validateBody/validateQuery/validateParams` + `sanitize`.
- Numeración por tenant: `V-000001` con `tenant_counters`.
- Operación atómica: crea venta + items, descuenta stock y registra ingreso en caja.
