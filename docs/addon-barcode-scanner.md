# Addon Barcode Scanner (Etapa 8C)

Implementación de escaneo con cámara (móvil) para QR/códigos de barra, con fallback a modo Pistola/Teclado.

## Decisión técnica
Se usa `html5-qrcode` por ser una librería madura y práctica para web móvil, con soporte sencillo para cámara trasera y múltiples formatos sin agregar lógica de bajo nivel.

## Checklist manual
1. En móvil (Chrome/Brave), abrir POS y usar **Escanear con... → Cámara (móvil)**.
2. Aceptar permiso de cámara.
3. Escanear EAN/QR válido y verificar que:
   - se cierra el modal,
   - se realiza una única búsqueda,
   - en POS agrega producto al carrito.
4. En Compras, escanear y verificar que se complete `Código producto` (y nombre opcional si lookup encuentra producto).
5. En Productos (nuevo), escanear y verificar que se complete `SKU`.
6. Cancelar el modal y confirmar que la cámara se libera (icono/sesión de cámara se apaga).
7. Dejar pasar 10 segundos sin escanear y verificar cierre automático con aviso de timeout.
8. Denegar permiso de cámara y verificar mensaje claro + sugerencia de usar Pistola/Teclado.
9. En entorno no soportado (`navigator.mediaDevices` ausente), verificar mensaje de fallback a teclado.
