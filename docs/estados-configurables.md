# Estados configurables por tenant

Se incorpora el módulo `status_definitions` para que cada tenant administre estados de:

- `ORDER`
- `PRODUCT`
- `DELIVERY`

## Defaults

La migración crea defaults por tenant para cada entidad y define un único default por tipo.

## Legacy handling

- `order_statuses` existentes se convierten en definiciones `ORDER` con `code` normalizado.
- `products.status_code` se backfillea desde `is_active` (`ACTIVE`/`INACTIVE`).
- Si hay códigos legacy en datos, se crean como definición activa automáticamente.

## Merge vs deactivate

- `deactivate`: desactiva el estado (si está en uso devuelve conflicto y no rompe histórico).
- `merge-into`: reasigna usos al estado destino y desactiva el origen.

## Impacto funcional

- Creación de pedidos/productos sin estado usa el estado default por tenant.
- Actualización de estado valida contra `status_definitions` activas.
- Se agrega sección **Configuración → Estados** para administrar labels/default/activo.
