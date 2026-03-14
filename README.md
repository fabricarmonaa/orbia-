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


## Google Sign-In + Google Calendar

Agregar estas variables en backend (`.env`):

- `GOOGLE_OAUTH_CLIENT_ID`: ID del cliente OAuth 2.0 de tipo Web.
- `GOOGLE_OAUTH_CLIENT_SECRET`: secreto del cliente OAuth 2.0 de tipo Web.
- `GOOGLE_OAUTH_REDIRECT_URI`: callback para OAuth (ejemplo: `https://app.tudominio.com/api/auth/google/callback`).
  - Para Calendar se usa también `https://app.tudominio.com/api/google/calendar/callback` en Google Cloud Console.
- `GOOGLE_OAUTH_STATE_SECRET`: secreto interno para firmar el estado OAuth.

Ubicación en Google Cloud Console:
1. APIs y servicios → Credenciales → OAuth 2.0 Client IDs.
2. Entrar al cliente web y copiar Client ID + Client Secret.
3. En “URIs de redireccionamiento autorizados” agregar:
   - `/api/auth/google/callback`
   - `/api/google/calendar/callback`

Scopes utilizados:
- `openid`, `email`, `profile`: login y registro con Google.
- `https://www.googleapis.com/auth/calendar.readonly`: listar calendarios y leer eventos.
- `https://www.googleapis.com/auth/calendar.events`: crear, editar y borrar eventos.
