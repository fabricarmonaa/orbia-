# Importación inteligente desde Excel

Se agregaron endpoints y UI para importación de **Compras** y **Clientes** con flujo de preview + mapeo + commit.

## Endpoints
- `POST /api/purchases/import/preview`
- `POST /api/purchases/import/commit`
- `POST /api/customers/import/preview`
- `POST /api/customers/import/commit`

Todos requieren `tenantAuth` y rol `admin|staff`.

## Seguridad
- Solo archivos `.xlsx` de hasta 5MB.
- Sanitización de strings con `sanitize.ts`.
- Mitigación de Formula Injection: si un valor inicia con `=`, `+`, `-`, `@`, se prefija con `'`.
- Scope multi-tenant aplicado en todas las lecturas/escrituras.

## Preview
El preview devuelve:
- `detectedHeaders`
- `suggestedMapping`
- `extraColumns`
- `rowsPreview` (hasta 25 filas)
- `warnings`

## Commit
### Compras
- Crea cabecera de compra.
- Inserta ítems válidos.
- Crea producto mínimo si no existe.
- Actualiza stock total y por sucursal (si aplica).
- Registra auditoría en `import_jobs`.

### Clientes
- Inserta clientes válidos.
- Evita duplicados por doc/email/teléfono (skip).
- Registra auditoría en `import_jobs`.
