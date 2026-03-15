import crypto from "crypto";
import { decryptSecret, encryptSecret } from "./whatsapp-crypto";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

type OAuthIntent = "login" | "calendar";

export type GoogleOAuthState = {
  tenantId?: number;
  tenantCode?: string;
  intent: OAuthIntent;
  userId?: number;
  nonce: string;
  /**
   * El origin del cliente que abrió el popup.
   * Se usa como targetOrigin en window.opener.postMessage para que el mensaje
   * solo llegue al origin correcto.
   * Valores válidos provienen de GOOGLE_ALLOWED_ORIGINS (whitelist del servidor).
   */
  parentOrigin: string;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
}

/**
 * Retorna la lista de origins permitidos como targetOrigin del postMessage.
 * Se construye desde GOOGLE_ALLOWED_ORIGINS (CSV) si está definida,
 * y se complementa con APP_ORIGIN y LANDING_URL.
 */
export function getAllowedParentOrigins(): string[] {
  const fromEnv = (process.env.GOOGLE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extras = [
    process.env.APP_ORIGIN,
    process.env.PUBLIC_APP_URL,
    process.env.LANDING_URL,
    process.env.PUBLIC_WEB_URL,
  ].filter(Boolean) as string[];
  const all = Array.from(new Set([
    ...fromEnv, 
    ...extras, 
    "http://localhost:5000", "http://127.0.0.1:5000",
    "http://localhost:5001", "http://127.0.0.1:5001",
    "http://localhost:5173", "http://127.0.0.1:5173"
  ]));
  return all;
}

/**
 * Verifica que el origin dado esté en la whitelist de origins permitidos.
 * Devuelve el origin si es válido, o null si no lo es.
 */
export function validateParentOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const allowed = getAllowedParentOrigins();
  const clean = origin.replace(/\/$/, "").trim();
  return allowed.includes(clean) ? clean : null;
}

const PROD_AUTH_CALLBACK_PATH = "/api/auth/google/callback";
const PROD_CALENDAR_CALLBACK_PATH = "/api/google/calendar/callback";

function isProductionEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function normalizeRedirectUri(raw: string | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getBaseAppUrl(): string | null {
  const candidates = [process.env.APP_ORIGIN, process.env.PUBLIC_APP_URL, process.env.BACKEND_URL]
    .map((v) => normalizeRedirectUri(v || undefined))
    .filter(Boolean) as string[];
  return candidates[0] || null;
}

export function getGoogleAuthRedirectUri(): string {
  const explicit = normalizeRedirectUri(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  const fallback = (() => {
    if (isProductionEnv()) {
      const base = getBaseAppUrl();
      return base ? new URL(PROD_AUTH_CALLBACK_PATH, base).toString() : null;
    }
    return "http://localhost:5000/api/auth/google/callback";
  })();

  const resolved = explicit || fallback;
  if (!resolved) {
    throw new Error("No se pudo resolver GOOGLE_OAUTH_REDIRECT_URI");
  }

  if (isProductionEnv() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(resolved)) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI inválido en producción (localhost no permitido)");
  }
  return resolved;
}

export function getGoogleCalendarRedirectUri(): string {
  const explicitCal = normalizeRedirectUri(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
  const explicitAuth = normalizeRedirectUri(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  const fallback = (() => {
    if (isProductionEnv()) {
      const base = getBaseAppUrl();
      return base ? new URL(PROD_CALENDAR_CALLBACK_PATH, base).toString() : null;
    }
    return "http://localhost:5000/api/google/calendar/callback";
  })();

  const resolved = explicitCal || explicitAuth || fallback;
  if (!resolved) {
    throw new Error("No se pudo resolver GOOGLE_CALENDAR_REDIRECT_URI");
  }

  if (isProductionEnv() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(resolved)) {
    throw new Error("GOOGLE_CALENDAR_REDIRECT_URI inválido en producción (localhost no permitido)");
  }
  return resolved;
}

/**
 * Valida que todas las credenciales de Google OAuth estén configuradas.
 * Llamar al arranque del servidor para fallar claro y temprano.
 */
export function assertGoogleOAuthConfigured() {
  getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  getGoogleAuthRedirectUri();
  getGoogleCalendarRedirectUri();
}

/**
 * Verifica silenciosamente si las credenciales están disponibles (sin lanzar).
 * Usado para mostrar estado en logs sin cortar el arranque.
 */
export function isGoogleOAuthConfigured(): boolean {
  try {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      getGoogleAuthRedirectUri() &&
      getGoogleCalendarRedirectUri(),
    );
  } catch {
    return false;
  }
}

/**
 * Devuelve el redirect URI correcto según el intent.
 */
export function getRedirectUri(intent: OAuthIntent): string {
  return intent === "calendar" ? getGoogleCalendarRedirectUri() : getGoogleAuthRedirectUri();
}

function getStateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || "orbia-google-state";
}

function encodeState(payload: GoogleOAuthState) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function decodeState(raw: string): GoogleOAuthState | null {
  try {
    const [body, sig] = String(raw || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleOAuthState;
    if (!payload.intent || !payload.nonce || !payload.parentOrigin) return null;
    if (payload.intent === "calendar") {
      if (!payload.tenantId || !payload.tenantCode || !payload.userId) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(statePayload: GoogleOAuthState) {
  assertGoogleOAuthConfigured();
  const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const redirectUri = getRedirectUri(statePayload.intent);
  const scope = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" ");
  const state = encodeState(statePayload);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope,
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, intent: OAuthIntent) {
  assertGoogleOAuthConfigured();
  const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = getRedirectUri(intent);
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json() as any;
  if (!resp.ok || !data?.access_token) throw new Error("No se pudo autorizar Google");
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresIn: Number(data.expires_in || 0),
    scope: String(data.scope || ""),
    idToken: data.id_token ? String(data.id_token) : null,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json() as any;
  if (!resp.ok || !data?.access_token) throw new Error("No se pudo refrescar Google Calendar");
  return {
    accessToken: String(data.access_token),
    expiresIn: Number(data.expires_in || 0),
    scope: String(data.scope || ""),
  };
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const resp = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json() as any;
  if (!resp.ok || !data?.sub || !data?.email) throw new Error("No se pudo validar el perfil de Google");
  return {
    sub: String(data.sub),
    email: String(data.email).toLowerCase(),
    email_verified: Boolean(data.email_verified),
    name: data.name ? String(data.name) : undefined,
    picture: data.picture ? String(data.picture) : undefined,
  };
}

export function encryptGoogleToken(raw: string | null | undefined) {
  return encryptSecret(raw || null);
}

export function decryptGoogleToken(raw: string | null | undefined) {
  return decryptSecret(raw || null);
}

async function calendarFetch(path: string, accessToken: string, init?: RequestInit) {
  const resp = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message : "Error de Google Calendar";
    const error = new Error(message) as Error & { status?: number };
    error.status = resp.status;
    throw error;
  }
  return data;
}

export async function listGoogleCalendars(accessToken: string) {
  const data = await calendarFetch("/users/me/calendarList", accessToken);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item: any) => ({
    id: String(item.id),
    summary: String(item.summary || item.id),
    primary: Boolean(item.primary),
    accessRole: String(item.accessRole || "reader"),
  }));
}

export async function listGoogleCalendarEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    maxResults: "250",
  });
  const data = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, accessToken);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item: any) => {
    const start = item?.start?.dateTime || `${item?.start?.date || ""}T09:00:00.000Z`;
    const end = item?.end?.dateTime || null;
    return {
      id: String(item.id),
      title: String(item.summary || "Sin título"),
      description: item.description ? String(item.description) : null,
      startsAt: start,
      endsAt: end,
      allDay: Boolean(item?.start?.date && !item?.start?.dateTime),
      htmlLink: item.htmlLink ? String(item.htmlLink) : null,
    };
  });
}

export async function createGoogleCalendarEvent(accessToken: string, calendarId: string, payload: {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
}) {
  const body = payload.allDay ? {
    summary: payload.title,
    description: payload.description || undefined,
    start: { date: payload.startsAt.slice(0, 10) },
    end: { date: (payload.endsAt || payload.startsAt).slice(0, 10) },
  } : {
    summary: payload.title,
    description: payload.description || undefined,
    start: { dateTime: payload.startsAt },
    end: { dateTime: payload.endsAt || payload.startsAt },
  };
  const data = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: String(data.id), htmlLink: data.htmlLink ? String(data.htmlLink) : null };
}

export async function updateGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string, payload: {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
}) {
  const body = payload.allDay ? {
    summary: payload.title,
    description: payload.description || undefined,
    start: { date: payload.startsAt.slice(0, 10) },
    end: { date: (payload.endsAt || payload.startsAt).slice(0, 10) },
  } : {
    summary: payload.title,
    description: payload.description || undefined,
    start: { dateTime: payload.startsAt },
    end: { dateTime: payload.endsAt || payload.startsAt },
  };
  await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string) {
  await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
