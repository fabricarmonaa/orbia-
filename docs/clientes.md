# Clientes

## Carga manual
`/app/customers` permite alta manual con:
- nombre (obligatorio)
- doc, email, teléfono
- dirección y notas

## Import Excel
Se mantiene wizard de importación con preview/confirmación.

## API
- `POST /api/customers`
- `GET /api/customers`
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`

## Dedupe tenant
Se bloquean duplicados por `doc`, `email` o `phone` dentro del tenant con `CUSTOMER_DUPLICATE`.
