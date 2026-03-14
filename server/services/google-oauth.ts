import crypto from "crypto";
import { decryptSecret, encryptSecret } from "./whatsapp-crypto";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

type OAuthIntent = "login" | "calendar";

export type GoogleOAuthState = {
  tenantId: number;
  tenantCode: string;
  intent: OAuthIntent;
  userId?: number;
  nonce: string;
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

export function assertGoogleOAuthConfigured() {
  getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  getRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI");
}

function getStateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.SESSION_SECRET || "orbia-google-state";
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
    if (!payload.tenantId || !payload.tenantCode || !payload.intent || !payload.nonce) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(statePayload: GoogleOAuthState) {
  assertGoogleOAuthConfigured();
  const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const redirectUri = getRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI");
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

export async function exchangeGoogleCode(code: string) {
  assertGoogleOAuthConfigured();
  const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = getRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI");
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
