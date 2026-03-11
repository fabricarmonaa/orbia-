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


## Correos (Gmail API OAuth2) — configuración real

ORBIA usa **Gmail API (OAuth2)**, no SMTP.

### Dónde poner las variables
Crear/editar el archivo **`.env` en la raíz del proyecto** (`/workspace/orbia-/.env` en este entorno) y cargar:

```env
# Remitente visible
GMAIL_FROM="Orbia <tu-cuenta@gmail.com>"

# Opcional: reply-to
GMAIL_REPLY_TO="soporte@tudominio.com"

# OAuth2 Google
GMAIL_OAUTH_CLIENT_ID="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
GMAIL_OAUTH_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
GMAIL_OAUTH_REFRESH_TOKEN="1//0gxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

> Prioridad de configuración: si cargás credenciales en SuperAdmin (`/api/super/settings/mailer`), esos valores pisan los de `.env`.

### De dónde sale cada dato
1. **Client ID + Client Secret**
   - Google Cloud Console → tu proyecto → APIs & Services → Credentials.
   - Crear OAuth Client ID (tipo Web o Desktop).
   - Guardar `client_id` y `client_secret`.

2. **Refresh Token**
   - Habilitar la API **Gmail API** en el proyecto.
   - Pedir consentimiento OAuth para el scope `https://www.googleapis.com/auth/gmail.send`.
   - Intercambiar el `authorization_code` por tokens y guardar el `refresh_token`.
   - Importante: usar `access_type=offline` y `prompt=consent` para que Google entregue refresh token.

3. **GMAIL_FROM**
   - Debe ser la cuenta Gmail autorizada por OAuth (la que realmente envía).

### Checklist rápido de funcionamiento
- `GMAIL_FROM`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN` completos.
- Gmail API habilitada en Google Cloud.
- Consent screen configurada y app autorizada.
- Reiniciar backend luego de cambiar `.env`.
