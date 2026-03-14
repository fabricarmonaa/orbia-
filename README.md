# ORBIA

## Variables de entorno clave (landing/app)

- `VITE_APP_ORIGIN`: origen base de la app (panel/login) usado por la landing para links y onboarding.
  - Dev default: `http://localhost:5000`
  - Prod default: `https://app.orbiapanel.com`
- `PUBLIC_APP_URL` / `APP_ORIGIN`: origen público de la app usado por backend para generar URLs absolutas de redirección/login.

## STT / AI (canónico)

Para evitar `502` en `/api/stt/interpret`, usar un único contrato:

- Servicio AI en Docker: `ai` escuchando en `8000`.
- Backend Node (`web`) debe usar `AI_SERVICE_URL=http://ai:8000` (en local también acepta una lista separada por comas, ej. `http://ai:8000,http://127.0.0.1:8000`).
- Opcional: `AI_SERVICE_HOST` + `AI_SERVICE_PORT` como fallback cuando no se define `AI_SERVICE_URL`.
- Timeouts:
  - `AI_REQUEST_TIMEOUT_MS` (backend → AI)
  - `AI_WORKER_TIMEOUT_SECONDS` (AI interno)

Health checks recomendados:

- AI: `GET /health`
- Backend STT: `GET /api/stt/health` (autenticado)

Con esto la landing siempre redirige al dominio de la app y evita redirects relativos en el dominio de marketing.
