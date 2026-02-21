# Password policy y UX de contraseñas

## Política backend

Para creación/cambio de password se exige:

- mínimo 12 caracteres
- al menos 1 mayúscula
- al menos 1 minúscula
- al menos 1 número
- al menos 1 símbolo
- no estar en lista de passwords comunes
- no contener DNI / tenant code / nombre del negocio (cuando hay contexto)

Además se permite passphrase larga (`>=20`) con menor variedad, siempre que cumpla restricciones de contexto y common-password.

## Compatibilidad

- Usuarios existentes con password débil pueden seguir iniciando sesión.
- En login se evalúa fortaleza y se expone `passwordWeak`.
- Al cambiar password se aplica la política nueva obligatoriamente.

## UX en Configuración → Cuenta

Se agregó:

- medidor de fuerza
- checklist de requisitos
- generador de contraseña sugerida
- copiar/regenerar/usar contraseña sugerida
- opciones de longitud, símbolos y evitar caracteres ambiguos
- banner cuando `passwordWeak=true`

## Rate limiting

Se aplica rate-limit in-memory con respuesta `RATE_LIMITED` y `retryAfterSec` para:

- `/api/auth/login`
- `/api/auth/super/login`
- `/api/cashiers/login`
- acciones sensibles de tenant (cambio password / delete tenant)

También se emite auditoría `brute_force_blocked` sin secretos.
