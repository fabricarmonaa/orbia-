# Pedidos: Ticket cliente

- Se removió el botón/flujo de **Comanda cocina** en la UI.
- En pedidos queda solo **Ticket cliente**.
- El ticket usa `TicketLayout` y QR con URL pública de tracking.
- Backend mantiene `GET /api/orders/:id/print-data` con `qr.publicUrl` para impresión.
