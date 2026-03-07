# ORBIA

## Variables de entorno clave (landing/app)

- `VITE_APP_ORIGIN`: origen base de la app (panel/login) usado por la landing para links y onboarding.
  - Dev default: `http://localhost:5000`
  - Prod default: `https://app.orbiapanel.com`
- `PUBLIC_APP_URL` / `APP_ORIGIN`: origen público de la app usado por backend para generar URLs absolutas de redirección/login.

Con esto la landing siempre redirige al dominio de la app y evita redirects relativos en el dominio de marketing.
