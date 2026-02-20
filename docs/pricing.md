# Pricing automático por margen + multimoneda

## Modos de pricing en productos
- `MANUAL`: usa `price` fijo.
- `MARGIN`: calcula precio en venta con:
  - `cost_amount`
  - `cost_currency`
  - `margin_pct`
  - cotización vigente (`exchange_rates`)

Fórmula:
`precio_final = costo_convertido * (1 + margen_pct/100)`

## Cotizaciones
Tabla `exchange_rates`:
- `tenant_id` nullable (permite rate por tenant o global)
- `base_currency`, `target_currency`, `rate`, `updated_at`

`getExchangeRate(base, target, tenantId)`:
- si `base==target` => `1`
- busca primero rate del tenant
- luego rate global
- si falta => error claro

## Ventas
- En `createSaleAtomic`:
  - si producto `MANUAL`: usa `price` (o override permitido)
  - si producto `MARGIN`: calcula dinámicamente por cotización y margen
  - bloquea override manual de `unit_price` para `MARGIN`
- `sale_items.unit_price` guarda snapshot final.
