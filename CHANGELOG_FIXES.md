# CHANGELOG_FIXES

## Arreglos principales
- Pedidos/POS: nuevo flujo “VENTA” desde pedido con pre-carga en POS (`pendingSaleFromOrder`) y vinculación de venta al pedido (`PATCH /api/orders/:id/link-sale`).
- Productos: “Renovar stock” ahora se gestiona desde menú de acciones con modal claro (global o por sucursal), sin input de branch id manual.
- Compras manual: formulario reh hecho sin dropdown de producto falso, con ítems por nombre/código/precio/cantidad y guardado por `POST /api/purchases/manual` actualizando stock por código cuando existe.
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
- `POST /api/purchases/manual`
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

## Etapa: estabilización backend + seed
- API clientes: `GET /api/customers` ahora normaliza `q` con trim, evita `ILIKE` cuando está vacía y siempre responde con formato estable `{ data, meta: { limit, offset, total } }`.
- API compras: `GET /api/purchases` valida fechas y paginación (`Number.isFinite`), devuelve `400 INVALID_DATE` ante fechas inválidas y agrega logging explícito de errores.
- API ventas/historial: logging de errores real en rutas, fallback de `mv_sales_history` con diagnóstico (`[sales] MV fallback`) y error explícito `MIGRATION_MISSING` si faltan migraciones/tablas.
- Seed/Auth: `server/auth.ts` deja de romper imports en top-level; nuevo `getSessionSecret()` exige `SESSION_SECRET` solo en producción y usa `dev-insecure-secret` en dev/test/scripts para permitir `npx tsx server/seed.ts`.

## Etapa 2: pedido → venta → ticket (sin popup)
- POS: impresión migrada a ruta real `/app/print/sale/:saleId` (sin `about:blank` ni `document.write`), con fallback a navegación en misma pestaña si el popup es bloqueado.
- POS: card de venta desde pedido ahora permite confirmar cliente por DNI; si no existe, habilita creación rápida y asocia `customer_id` a la venta.
- Ventas: `GET /api/sales/:id/print-data` agregado (se mantiene POST por compatibilidad) con payload completo para ticket real: negocio, cliente, ítems reales, totales y QR público.
- Pedidos: botón **Ticket cliente** usa la venta vinculada (`sale_id`) y abre `/app/print/sale/:saleId`; deja de usar impresión de pedido como ticket final.

## Etapa 3: refactor dashboard (UI simple + summary estable)
- Dashboard simplificado: header + 4 cards superiores + 2 bloques grandes (**Pedidos Abiertos** y **Resumen Mensual**), removiendo del front cualquier uso de actividad reciente/highlight orders.
- Nuevo endpoint `GET /api/dashboard/summary` con respuesta estable `{ orders, cash, products }`, filtrado por tenant y branch scope cuando aplica.
- Endpoint diseñado para resiliencia: si no hay datos o falla cálculo puntual, devuelve números en `0` (sin romper el dashboard).
- Agregado script `script/dashboard-summary-check.ts` y comando `npm run check:dashboard-summary` para validar shape numérico del endpoint.

## Etapa 4: clientes (UI prolija + listado + detalle + historial)
- Clientes refactorizado a layout 2 paneles: formulario (nuevo/editar) a la izquierda y listado + detalle/historial a la derecha, con diseño responsive y scroll interno.
- Listado estable con búsqueda, `includeInactive`, estado vacío claro y selección de cliente con detalle inline (sin navegar).
- CRUD robusto: crear/editar con validación de DNI, toggle activo/inactivo (`PATCH /api/customers/:id/active`) y eliminación bloqueada cuando el cliente tiene ventas (`CUSTOMER_HAS_SALES`).
- Historial lazy por cliente (`GET /api/customers/:id/history`) con payload estable `{ customer, sales, orders }` y fallback seguro a arrays vacíos si faltan fuentes de pedidos.
- Script `script/customers-e2e-check.ts` + comando `npm run check:customers-e2e` para validar create/list/history/toggle.

## Etapa 5: compras (manual + últimas compras + listado estable)
- Compras manual ahora responde con contrato consistente (`purchaseId`, `purchase` resumida e `updatedStock`) y refresca correctamente “Últimas compras” en UI tras guardar.
- `GET /api/purchases` robustecido: soporta `limit/offset/q/from/to`, clamp de paginado, meta estable y evita 500 por params inválidos (400 con code).
- Listado de compras actualizado con formato estable (`number`, `createdAt`, `supplierName`, `currency`, `total`, `itemCount`) y detalle por `GET /api/purchases/:id` en modal.
- Nuevo script `script/purchases-e2e-check.ts` + comando `npm run check:purchases-e2e` para validar create/list/detail.

## Etapa 6: stock consistente + compras impactan stock
- Productos ahora expone `meta.stockMode` + `meta.branchesCount` en `GET /api/products`, con stock mode por tenant en runtime (global por defecto, por sucursal cuando se activa).
- Endpoint `PATCH /api/products/:id/stock` estabilizado con contratos explícitos para `mode: global|by_branch`, validaciones y respuesta uniforme `{ ok, productId, stockMode, stock }`.
- UX “Renovar stock” en productos ajustada para mostrar toggle “Gestionar por sucursal” cuando el tenant tiene sucursales, con flujo claro global/por sucursal.
- Compras manual incrementa stock por código de producto en el mismo tenant (sin crear producto automático), respetando `stockMode` y registrando movimientos de stock.
- Script `script/stock-purchase-integration-check.ts` + comando `npm run check:stock-purchase` para validar integración compras↔stock.

## Etapa 7: historial de ventas funcional + filtros + fallback
- Historial de ventas: `GET /api/sales` ahora tiene contrato estable `{ data, meta }`, filtros `from/to/number/customerId/customerQuery`, paginado con `limit/offset` y `sort` por fecha.
- Historial de ventas: validación robusta de parámetros (`INVALID_DATE`) y manejo de errores con código estable (`SALES_LIST_ERROR`) para evitar 500 genéricos por query params.
- Performance: el listado usa `mv_sales_history` cuando está disponible y cae a fallback Drizzle con logging explícito (`[sales] MV fallback`) cuando la MV falla o no existe.
- UI historial: `sales-history.tsx` con card de filtros + tabla de resultados + paginación + modal de detalle e impresión por ruta real `/app/print/sale/:id`.
- Script `script/sales-history-check.ts` + comando `npm run check:sales-history` para validar `/api/sales` básico, por fechas y por `customerQuery`.


## Etapa 8A: addon barcode_scanner con gating
- Addon `barcode_scanner` ahora es activable por tenant desde SuperAdmin y se expone por `GET /api/tenant/addons` para consumo de frontend.
- SuperAdmin agrega/actualiza addons por tenant con `GET/PUT /api/super/tenants/:tenantId/addons` y guarda estado de forma persistente en `tenant_addons`.
- Se agregó middleware de gating `requireAddon("barcode_scanner")` y se aplicó a `GET /api/products/lookup` (403 `ADDON_NOT_ENABLED` cuando no está habilitado).
- Frontend consume helper `fetchAddons()` para mostrar/ocultar botones de escaneo según flag real del tenant.
- Script `script/addons-check.ts` + comando `npm run check:addons` para validar toggle superadmin + gating backend.

## Etapa 8B: listener barcode_scanner (modo pistola/teclado)
- Addon lector: modo pistola/teclado con escucha 10s y lookup sin spam.
- `BarcodeListener` reutilizable con modal de escaneo, countdown, finalización por Enter, cancelación por Escape y cleanup completo de listeners/timers.
- Integraciones en POS/Compras/Productos con botón “Escanear” solo cuando `addons.barcode_scanner` está activo.
- `GET /api/products/lookup` robustecido con normalización de código, respuesta estable `{ product }` y gating por addon.
- Nuevo script `script/barcode-scanner-check.ts` para validar 403 con addon off y 200/404 con addon on.

## Etapa 8C: addon barcode_scanner modo cámara
- Addon lector: modo cámara con permisos + timeout 10s + integración POS/Compras/Productos.
- Nuevo componente reusable `CameraScanner` con `facingMode: environment`, timeout, cancelación y cleanup estricto de scanner/tracks.
- UX unificada “Escanear con…” (Pistola/Teclado o Cámara) en POS, Compras manual y alta de Productos.
- Fallbacks claros para navegador sin cámara, permiso denegado o contexto no seguro (HTTPS requerido), sugiriendo modo teclado.
- Documentación manual en `docs/addon-barcode-scanner.md`.

## Etapa 8D: superadmin planes en cards + limpieza final
- SuperAdmin: edición de planes en cards responsive (precio + descripción + límites visibles) con guardado individual por plan.
- Backend: agregado `PUT /api/super/plans/:planCode` para actualización tipada (`priceMonthly`, `description`, `limits`) con validaciones y códigos de error.
- SuperAdmin tenants: pulido visual del switch “Lector códigos” para verificación final de addon `barcode_scanner`.
- Hardening: `server/config.ts` centraliza `SESSION_SECRET` con fallback seguro para ejecución de scripts/seed en entorno local.
- Limpieza: eliminadas páginas de reportes legacy no enrutadas (`reports-sales`, `reports-products`, `reports-customers`, `reports-cash`).
- Documentación final de validación agregada en `docs/FINAL_CHECKLIST.md`.
