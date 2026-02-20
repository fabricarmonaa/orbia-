# Módulo de Cajeros

## Resumen
- Alta/baja/edición de cajeros por tenant con PIN hasheado.
- Login separado por PIN (`/api/cashiers/login`) que emite JWT con `role=CASHIER`.
- Gating por plan: solo `PROFESIONAL` y `ESCALA`.
- Menú reducido para cajeros: POS + Historial Ventas.

## Endpoints
- `POST /api/cashiers/login`
- `POST /api/cashiers`
- `GET /api/cashiers`
- `PATCH /api/cashiers/:id`
- `DELETE /api/cashiers/:id`

## Seguridad
- PIN nunca en texto plano (`hashPassword/comparePassword`).
- Validación + sanitización (`validate*` + `sanitize*`).
- Roles: `requireRole`, `requireRoleAny`.
