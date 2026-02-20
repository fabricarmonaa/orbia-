# Eliminar cuenta de tenant (hard delete)

## Resumen
Se agregó eliminación de cuenta para admin tenant con:
- confirmación fuerte (`ELIMINAR MI CUENTA`)
- reautenticación por contraseña
- exportación opcional previa
- borrado real transaccional de datos del tenant

## Endpoint
`DELETE /api/tenant`

Body:
```json
{
  "confirm": "ELIMINAR MI CUENTA",
  "password": "...",
  "exportBeforeDelete": true
}
```

## Export opcional
- Si `exportBeforeDelete=true`, se crea ZIP temporal en `uploads/exports`.
- Descarga por token firmado:
  - `GET /api/tenant/export/:token`
- Token con TTL de 15 minutos y validado por tenant + usuario.
- No incluye hashes ni secretos.

## Borrado
- `deleteTenantAtomic(tenantId)` elimina por tenant en transacción.
- Se devuelve `deletedCounts` por tabla.
- Tenant root (`t_root`) no se puede borrar.

## UX
En Configuración → Cuenta se añadió zona de peligro con:
- advertencia de irreversibilidad
- input de confirmación
- password actual
- opción de exportar antes
- modal final de confirmación
