# CHANGELOG_FIXES

## Arreglos principales
- Dashboard: actividad destacada ahora usa estados configurables por tenant (Configuración → Estados), con listado compacto (máx. 5 por estado) y indicador "+N".
- Pedidos: Ticket cliente migra a ruta imprimible real `/app/print/order/:id` para evitar `about:blank` y falsos bloqueos de popup.
- Dashboard: se agregaron endpoints y UI para pedidos recientes (pendientes/en proceso) y actividad reciente.
- Pedidos: `Ticket cliente` ahora valida payload, maneja errores y popup bloqueado; evita `about:blank` vacío.
- Caja: tabs simplificados a Movimientos + Indicadores; título interno actualizado a **Indicador Clave Desempeño**.
- Clientes: búsqueda robusta con `q` vacío y respuesta paginada estable; nuevo historial por cliente.
- Productos: eliminado SKU duplicado, soporte de stock global cuando no aplica sucursales por plan y ajustes de stock más claros.
- Compras: listado con manejo de errores y layout manual en 2 columnas.
- POS: alertas de stock en tiempo real y proyección post-venta por ítem (solo pantalla).
- Historial ventas: nuevo filtro por cliente.
- Planes/permisos: cajeros habilitados para PROFESIONAL y ESCALA; límites por sucursal reforzados en ESCALA.
- Logs: logger mensual por tenant en JSONL (`logs/tenant_<id>/events_YYYY-MM.log`) con retención configurable.

## Endpoints tocados
- `GET /api/dashboard/highlight-orders`
- `GET/PUT /api/dashboard/highlight-settings`
- `GET /api/dashboard/recent-orders`
- `GET /api/dashboard/activity`
- `GET /api/customers`
- `GET /api/customers/:id/history`
- `GET /api/purchases`
- `GET /api/sales`
- `POST /api/sales`
- `GET /api/products`
- `PATCH /api/products/:id/stock`
- `POST/GET /api/cashiers` (gating/límites)
- `POST /api/branch-users` (límite por sucursal)

## Cómo probar manualmente
1. Dashboard: verificar bloques Pendientes/En proceso y Actividad reciente.
2. Pedidos: botón Ticket cliente debe abrir ticket; si endpoint falla, mostrar toast.
3. Caja: tabs solo Movimientos + Indicadores; título "Indicador Clave Desempeño".
4. Clientes: `/api/customers?q=` debe responder 200 y el listado debe abrir historial por cliente.
5. Compras: `/api/purchases?limit=30` responde 200 y layout manual en dos columnas.
6. POS: al agregar producto sin stock debe alertar y evitar agregado; mostrar stock actual/post-venta.
7. Historial ventas: filtro por cliente funcional.
8. Cajeros: en plan Profesional y Escala deben funcionar endpoints; en Escala aplicar límites.
9. Logs: validar creación de `logs/tenant_<id>/events_YYYY-MM.log` al generar eventos auditables.
