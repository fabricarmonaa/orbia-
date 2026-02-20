# Panel Superadmin: planes, suscripciones y transferencia

Se amplió el panel de superadmin para gestionar:

- Planes (`GET/PATCH /api/super/plans`)
- Suscripciones (`GET/PATCH /api/super/subscriptions`)
- Datos de transferencia (`GET/PATCH /api/super/transfer-info`)

## Modelo de datos

- `plans`: descripción, precio, moneda, límites y flags de features.
- `tenant_subscriptions`: historial y estado de suscripciones por tenant.
- `system_settings`: clave/valor para configuración global (se usa `transfer_info`).

## Seguridad

- Rutas bajo `/api/super/*` protegidas por `superAuth`.
- Login superadmin restringido a tenant root (`ROOT_TENANT_CODE`, default `t_root`).

## Integración

- `requirePlanFeature` se resuelve dinámicamente desde la configuración de features del plan.
- Configuración tenant muestra datos de transferencia cargados por superadmin.
