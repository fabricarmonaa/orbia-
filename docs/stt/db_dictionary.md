# STT DB Dictionary (Orbia)

## Tablas clave

### customers
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Campos clave: `name`, `doc` (DNI), `phone`, `email`, `is_active`, `created_at`.
- Índices: tenant, tenant+created, tenant+doc, tenant+email.

### products
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Campos clave: `name`, `price`, `sku`, `is_active`, `category_id`, `created_at`.
- Restricción: unique `tenant_id + sku`.

### sales
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Branch scope: `branch_id`.
- Relación opcional cliente: `customer_id -> customers.id`.
- Campos clave: `sale_number`, `sale_datetime`, `total_amount`, `payment_method`.
- Restricción: unique `tenant_id + sale_number`.

### sale_items
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Relaciones: `sale_id -> sales.id`, `product_id -> products.id`, `branch_id -> branches.id`.
- Campos clave: `product_name_snapshot`, `quantity`, `unit_price`, `line_total`.

### purchases
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Branch scope: `branch_id`.
- Campos clave: `provider_name`, `purchase_date`, `total_amount`, `currency`.

### purchase_items
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Relaciones: `purchase_id -> purchases.id`, `product_id -> products.id`.
- Campos clave: `product_name_snapshot`, `quantity`, `unit_price`, `line_total`.

### stt_logs
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Campos clave: `context`, `transcription`, `intent_json`, `confirmed`, `result_entity_type`, `result_entity_id`.

### stt_interactions (nueva)
- PK: `id`.
- Scope obligatorio: `tenant_id`.
- Campos clave: `transcript`, `intent_confirmed`, `entities_confirmed`, `created_at`.
- Uso: memoria few-shot por tenant/usuario.

## Relaciones relevantes
- `customers (1) -> (N) sales` por `sales.customer_id`.
- `sales (1) -> (N) sale_items`.
- `products (1) -> (N) sale_items`.
- `purchases (1) -> (N) purchase_items`.
- `products (1) -> (N) purchase_items`.

## Endpoints backend relevantes
- `POST /api/customers` crea cliente (`name`, opcional `doc/email/phone/address/notes`).
- `GET /api/customers` búsqueda por `q`, con paginación `limit/offset`.
- `GET /api/customers/by-dni?dni=...` búsqueda directa por DNI.
- `POST /api/products` crea producto (`name`, `price`, opcional `sku`, etc.).
- `GET /api/products` lista/búsqueda.
- `POST /api/sales` crea venta (items, customer_id opcional, payment_method).
- `GET /api/sales` historial de ventas (filtros y paginación).
- `POST /api/stt/interpret` interpreta audio/texto con resumen y entidades.
- `POST /api/stt/execute` ejecuta intent confirmado en whitelist.

## Constraints y seguridad de scope
- Todas las operaciones STT usan auth de tenant y plan `ESCALA`.
- En branch scope, las búsquedas/altas deben respetar `branch_id` cuando aplique.
- Validación de payloads con Zod y filtros por `tenant_id` obligatorios.
