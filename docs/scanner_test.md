# Prueba manual scanner móvil (Android Chrome/Brave/PWA)

## Contexto
Validar scanner de cámara para QR/barcode sin loop de permisos y con fallback.

## Checklist rápido
1. Abrir módulo con botón **Escanear con cámara**.
2. Aceptar permisos cuando el navegador los solicite.
3. Verificar que aparece preview real de cámara (no recuadro gris permanente).
4. Apuntar a QR/EAN/Code128 y confirmar detección (<2s en buen foco).
5. Cerrar y reabrir scanner 10 veces seguidas.
6. Denegar permisos y verificar UI de error + botón **Reintentar**.
7. Usar **Cambiar cámara** (si hay más de una cámara).
8. Usar **Ingreso manual** y validar callback funcional.

## Resultado esperado
- Sin loops de permisos.
- Sin cámara “colgada” al cerrar modal.
- Detección estable y deduplicada (no dispara múltiples callbacks seguidos por el mismo código).
- Mensajería clara para: permiso denegado, cámara ocupada, sin cámara, constraints inválidas.
- Fallback manual siempre disponible.
