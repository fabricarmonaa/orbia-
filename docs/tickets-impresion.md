# Tickets e impresión (58/80/A4)

## Formatos

- `TICKET_58` para comanderas de 58mm
- `TICKET_80` para ticketeras de 80mm
- `A4` para impresión estándar/PDF

## Motor unificado

Se centraliza en `client/src/components/print/TicketLayout.tsx` y se usa desde ventas/pedidos.

## QR y URLs públicas

- Ventas: QR con `publicUrl` de comprobante (`/api/public/sale/:token`).
- Pedidos: QR de tracking público (`/tracking/:id` / `/api/public/track/:token`).

## Seguridad de token

- Ventas usan `sales.public_token` aleatorio (`base64url`) con expiración (`public_token_expires_at`).
- Endpoints públicos no exponen IDs incrementales.

## Reimpresión

La reimpresión usa snapshots (`sale_items.unit_price` / `line_total`) sin recalcular precios.
