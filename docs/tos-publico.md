# Términos y Condiciones públicos por tenant

Se implementó soporte para TOS públicos por tenant en la ruta:

`/t/{slug}/tos`

## Backend

### Campos nuevos en `tenants`
- `slug` (obligatorio, único, `a-z0-9-`, máx 120)
- `tos_content`
- `tos_updated_at`

### Endpoints
- `GET /api/public/tenant/:slug/tos` (público, sin JWT)
- `GET /api/branding/tos` (admin)
- `PATCH /api/branding/tos` (admin)
- `PATCH /api/branding/slug` (admin)

## Seguridad
- Sanitización del contenido de términos con allowlist de tags:
  `b, i, u, strong, em, p, br, ul, li, ol`.
- Eliminación de `script`, `iframe` y `style`.
- No se exponen `tenant_id` ni campos internos en endpoint público.

## Frontend
- Configuración en sección **Términos Públicos** dentro de Ajustes.
- Página pública minimalista en `/t/:slug/tos`.
