import type { Express } from "express";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { tenantAuth, requireFeature, enforceBranchScope } from "../auth";
import { users, userGoogleConnections, agendaEvents } from "@shared/schema";
import { randomUUID } from "crypto";
import {
  buildGoogleAuthUrl,
  decodeState,
  decryptGoogleToken,
  encryptGoogleToken,
  exchangeGoogleCode,
  fetchGoogleProfile,
  listGoogleCalendars,
  refreshGoogleAccessToken,
  validateParentOrigin,
} from "../services/google-oauth";
import { getActiveConnection, getValidAccessToken } from "../services/google-calendar";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(220),
  description: z.string().max(2000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  saveToGoogle: z.boolean().optional(),
  eventType: z.string().trim().max(40).optional(),
});



export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google/calendar/connect-url", tenantAuth, requireFeature("agenda"), enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt))).limit(1);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      // Leer el tenant real para incluir el tenantCode correcto en el state.
      // El state siempre debe llevar tenant.code (no el ID numérico como string).
      const { storage } = await import("../storage");
      const tenant = await storage.getTenantById(tenantId);
      if (!tenant) return res.status(404).json({ error: "Negocio no encontrado" });

      // Determinar el parentOrigin validado para el postMessage del callback.
      const rawOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
      const parentOrigin = validateParentOrigin(rawOrigin) || (process.env.APP_ORIGIN || "http://localhost:5000");

      const authUrl = buildGoogleAuthUrl({
        tenantId,
        tenantCode: tenant.code,   // ✅ usar tenant.code, no String(tenantId)
        intent: "calendar",
        userId,
        nonce: randomUUID(),
        parentOrigin,
      });
      res.json({ url: authUrl });
    } catch {
      res.status(400).json({ error: "No se pudo iniciar la conexión con Google Calendar." });
    }
  });

  app.get("/api/google/calendar/callback", async (req, res) => {
    const fallbackOrigin = process.env.APP_ORIGIN || "http://localhost:5000";

    const emitToParent = (payload: Record<string, unknown>, parentOrigin: string) => {
      const safe = JSON.stringify(payload).replace(/</g, "\\u003c");
      const targetOrigin = JSON.stringify(parentOrigin);
      return res.status(200).send(`<!doctype html><html><body><script>(function(){ const data=${safe}; const target=${targetOrigin}; if(window.opener){ window.opener.postMessage({ type: 'orbia-google-calendar', ...data }, target); window.close(); } else { document.body.innerText = data.message || 'Podés cerrar esta ventana.'; } })();</script></body></html>`);
    };

    const emit = (payload: Record<string, unknown>, parentOrigin?: string) =>
      emitToParent(payload, parentOrigin || fallbackOrigin);

    try {
      const code = String(req.query.code || "");
      const state = decodeState(String(req.query.state || ""));
      if (!code || !state || state.intent !== "calendar" || !state.userId) return emit({ ok: false, message: "La conexión con Google Calendar no fue válida." });

      const parentOrigin = validateParentOrigin(state.parentOrigin) || fallbackOrigin;

      const tokenData = await exchangeGoogleCode(code, "calendar");
      const profile = await fetchGoogleProfile(tokenData.accessToken);
      const [user] = await db.select().from(users).where(and(eq(users.id, state.userId), eq(users.tenantId, state.tenantId), isNull(users.deletedAt))).limit(1);
      if (!user) return emit({ ok: false, message: "No encontramos tu usuario." }, parentOrigin);
      const now = new Date();
      const expires = tokenData.expiresIn > 0 ? new Date(now.getTime() + tokenData.expiresIn * 1000) : null;
      const existing = await getActiveConnection(user.id, state.tenantId);
      const values = {
        tenantId: state.tenantId,
        userId: user.id,
        googleUserId: profile.sub,
        googleEmail: profile.email,
        encryptedRefreshToken: encryptGoogleToken(tokenData.refreshToken),
        encryptedAccessToken: encryptGoogleToken(tokenData.accessToken),
        accessTokenExpiresAt: expires,
        scopes: tokenData.scope,
        updatedAt: now,
        isActive: true,
      };
      if (existing) await db.update(userGoogleConnections).set(values).where(eq(userGoogleConnections.id, existing.id));
      else await db.insert(userGoogleConnections).values(values as any);
      return emit({ ok: true, message: "Google Calendar conectado correctamente." }, parentOrigin);
    } catch {
      return emit({ ok: false, message: "No pudimos conectar Google Calendar." });
    }
  });

  app.get("/api/google/calendar/status", tenantAuth, requireFeature("agenda"), enforceBranchScope, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const conn = await getActiveConnection(userId, tenantId);
    if (!conn) return res.json({ connected: false });
    try {
      const accessToken = await getValidAccessToken(conn.id);
      if (!accessToken) throw new Error();
      const calendars = await listGoogleCalendars(accessToken);
      res.json({
        connected: true,
        googleEmail: conn.googleEmail,
        selectedCalendarId: conn.selectedCalendarId,
        calendars,
      });
    } catch {
      res.json({ connected: false });
    }
  });

  app.post("/api/google/calendar/select", tenantAuth, requireFeature("agenda"), enforceBranchScope, async (req, res) => {
    const schema = z.object({ calendarId: z.string().trim().min(1).max(255) });
    const { calendarId } = schema.parse(req.body || {});
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const conn = await getActiveConnection(userId, tenantId);
    if (!conn) return res.status(400).json({ error: "Primero conectá Google Calendar." });
    await db.update(userGoogleConnections).set({ selectedCalendarId: calendarId, updatedAt: new Date() }).where(eq(userGoogleConnections.id, conn.id));
    res.json({ ok: true });
  });
}
