# FINAL CHECKLIST (Etapa 8D)

## Build y typing
1. `npm run check`
2. `npm run build`

## Opcional docker
3. `docker compose build --no-cache`

## Smoke API SuperAdmin (con token superadmin)
4. `GET /api/super/plans`
5. `PUT /api/super/plans/:planCode` con payload de prueba:

```json
{
  "priceMonthly": 9999,
  "description": "Plan actualizado desde checklist",
  "limits": {
    "max_branches": 2,
    "max_staff_users": 10,
    "max_staff_per_branch": 10
  }
}
```

## Addon barcode_scanner
6. En superadmin > tenants verificar switch "Lector códigos".
7. Cambiar ON/OFF y recargar para confirmar persistencia.

## Escaneo (8B/8C)
8. POS/Compras/Productos deben mostrar "Escanear con..." solo con addon activo.
9. Probar Pistola/Teclado y Cámara (si dispositivo lo permite).
