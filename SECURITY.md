# Seguridad de entradas y salidas

## Qué se protege
- Sanitización centralizada en `server/security/sanitize.ts`.
- Validación reusable en `server/middleware/validate.ts` para `body`, `params` y `query`.
- Endpoints críticos (pedidos, productos, caja, gastos, branding, auth) validan y sanitizan texto antes de persistir.
- Renderizado frontend: no se usa `dangerouslySetInnerHTML` para contenido dinámico.
- Consultas SQL: se mantienen con Drizzle parametrizado (`eq`, `and`, `sql`` con bindings) y se endureció búsqueda `ILIKE` escapando `%` y `_`.

## Reglas para nuevos campos
1. Si el dato viene del usuario y se persiste, debe pasar por esquema + sanitización.
2. Campos cortos usar `sanitizeShortText(max)`.
3. Campos largos/notas usar `sanitizeLongText(max)`.
4. IDs siempre como `z.coerce.number().int().positive()`.
5. Búsquedas `LIKE/ILIKE` deben usar `escapeLikePattern`.
6. En frontend renderizar texto con JSX normal (`{value}`), nunca HTML inyectado.

## Endpoints protegidos
- `/api/orders` y comentarios/estado de órdenes.
- `/api/products` y categorías/stock.
- `/api/cash/sessions`, `/api/cash/movements`.
- `/api/expenses/*`, `/api/expense-categories`, `/api/fixed-expenses`.
- `/api/branding/tenant`, `/api/branding/app`.
- `/api/auth/login` (normalización de tenantCode).
