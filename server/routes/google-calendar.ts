import type { Express } from "express";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { tenantAuth, requireFeature, enforceBranchScope } from "../auth";
import { users, userGoogleConnections, agendaEvents } from "@shared/schema";
import { randomUUID } from "crypto";
import {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  decodeState,
  decryptGoogleToken,
  encryptGoogleToken,
  exchangeGoogleCode,
  fetchGoogleProfile,
  listGoogleCalendarEvents,
  listGoogleCalendars,
  refreshGoogleAccessToken,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../services/google-oauth";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(220),
  description: z.string().max(2000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  saveToGoogle: z.boolean().optional(),
  eventType: z.string().trim().max(40).optional(),
});

async function getActiveConnection(userId: number, tenantId: number) {
  const [conn] = await db.select().from(userGoogleConnections).where(and(
    eq(userGoogleConnections.userId, userId),
    eq(userGoogleConnections.tenantId, tenantId),
    eq(userGoogleConnections.isActive, true),
  )).limit(1);
  return conn;
}

async function getGoogleAccessToken(connection: typeof userGoogleConnections.$inferSelect) {
  const current = decryptGoogleToken(connection.encryptedAccessToken);
  const refresh = decryptGoogleToken(connection.encryptedRefreshToken);
  const stillValid = Boolean(current && connection.accessTokenExpiresAt && new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 30_000);
  if (stillValid && current) return { accessToken: current, expiresAt: connection.accessTokenExpiresAt };
  if (!refresh) throw new Error("Necesitás volver a conectar Google Calendar para continuar.");
  const next = await refreshGoogleAccessToken(refresh);
  const expiresAt = next.expiresIn > 0 ? new Date(Date.now() + next.expiresIn * 1000) : null;
  await db.update(userGoogleConnections).set({
    encryptedAccessToken: encryptGoogleToken(next.accessToken),
    accessTokenExpiresAt: expiresAt,
    scopes: next.scope || connection.scopes,
    updatedAt: new Date(),
  }).where(eq(userGoogleConnections.id, connection.id));
  return { accessToken: next.accessToken, expiresAt };
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google/calendar/connect-url", tenantAuth, requireFeature("agenda"), enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt))).limit(1);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
      const authUrl = buildGoogleAuthUrl({
        tenantId,
        tenantCode: String(tenantId),
        intent: "calendar",
        userId,
        nonce: randomUUID(),
      });
      res.json({ url: authUrl });
    } catch {
      res.status(400).json({ error: "No se pudo iniciar la conexión con Google Calendar." });
    }
  });

  app.get("/api/google/calendar/callback", async (req, res) => {
    const emit = (payload: Record<string, unknown>) => {
      const safe = JSON.stringify(payload).replace(/</g, "\\u003c");
      return res.status(200).send(`<!doctype html><html><body><script>(function(){ const data=${safe}; if(window.opener){ window.opener.postMessage({ type: 'orbia-google-calendar', ...data }, window.location.origin); window.close(); } else { document.body.innerText = data.message || 'Podés cerrar esta ventana.'; } })();</script></body></html>`);
    };

    try {
      const code = String(req.query.code || "");
      const state = decodeState(String(req.query.state || ""));
      if (!code || !state || state.intent !== "calendar" || !state.userId) return emit({ ok: false, message: "La conexión con Google Calendar no fue válida." });
      const tokenData = await exchangeGoogleCode(code);
      const profile = await fetchGoogleProfile(tokenData.accessToken);
      const [user] = await db.select().from(users).where(and(eq(users.id, state.userId), eq(users.tenantId, state.tenantId), isNull(users.deletedAt))).limit(1);
      if (!user) return emit({ ok: false, message: "No encontramos tu usuario." });
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
      return emit({ ok: true, message: "Google Calendar conectado correctamente." });
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
      const { accessToken } = await getGoogleAccessToken(conn);
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

  app.get('/api/agenda/events', tenantAuth, requireFeature('agenda'), enforceBranchScope, async (req, res) => {
    const range = z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(req.query || {});
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : null;
    const conn = await getActiveConnection(userId, tenantId);

    const localConditions = [eq(agendaEvents.tenantId, tenantId), isNull(agendaEvents.sourceEntityType)];
    if (branchId) localConditions.push(eq(agendaEvents.branchId, branchId));

    if (!conn || !conn.selectedCalendarId) {
      const rows = await db.select().from(agendaEvents).where(and(...localConditions));
      return res.json({ data: rows, source: "local", connectedGoogle: Boolean(conn) });
    }

    const { accessToken } = await getGoogleAccessToken(conn);
    const googleEvents = await listGoogleCalendarEvents(accessToken, conn.selectedCalendarId, range.from, range.to);
    const localRows = await db.select().from(agendaEvents).where(and(...localConditions));

    const mapped = googleEvents.map((e: any) => ({
      id: `google:${e.id}`,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      eventType: "MANUAL",
      sourceEntityType: "GOOGLE_CALENDAR",
      sourceFieldKey: e.id,
      htmlLink: e.htmlLink,
    }));
    return res.json({ data: [...mapped, ...localRows], source: "google", connectedGoogle: true });
  });

  app.post('/api/agenda/events', tenantAuth, requireFeature('agenda'), enforceBranchScope, async (req, res) => {
    const body = eventSchema.parse(req.body || {});
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : null;
    const conn = await getActiveConnection(userId, tenantId);

    const shouldSaveGoogle = Boolean(body.saveToGoogle);
    if (shouldSaveGoogle) {
      if (!conn || !conn.selectedCalendarId) return res.status(400).json({ error: "Conectá y seleccioná un calendario de Google antes de guardar allí." });
      const { accessToken } = await getGoogleAccessToken(conn);
      const created = await createGoogleCalendarEvent(accessToken, conn.selectedCalendarId, body);
      return res.status(201).json({ data: {
        id: `google:${created.id}`,
        title: body.title,
        description: body.description || null,
        startsAt: body.startsAt,
        endsAt: body.endsAt || null,
        allDay: Boolean(body.allDay),
        eventType: body.eventType || "MANUAL",
        sourceEntityType: "GOOGLE_CALENDAR",
        sourceFieldKey: created.id,
        htmlLink: created.htmlLink,
      } });
    }

    const [created] = await db.insert(agendaEvents).values({
      tenantId,
      branchId,
      title: body.title,
      description: body.description || null,
      eventType: body.eventType || 'MANUAL',
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      allDay: Boolean(body.allDay),
      status: 'PENDIENTE',
      createdById: userId,
      updatedById: userId,
    }).returning();
    res.status(201).json({ data: created });
  });

  app.patch('/api/agenda/events/:id', tenantAuth, requireFeature('agenda'), enforceBranchScope, async (req, res) => {
    const id = String(req.params.id || "");
    const body = eventSchema.partial().parse(req.body || {});
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;

    if (id.startsWith("google:")) {
      const googleEventId = id.slice("google:".length);
      const conn = await getActiveConnection(userId, tenantId);
      if (!conn || !conn.selectedCalendarId) return res.status(400).json({ error: "Google Calendar no está conectado." });
      const { accessToken } = await getGoogleAccessToken(conn);
      await updateGoogleCalendarEvent(accessToken, conn.selectedCalendarId, googleEventId, {
        title: body.title || "Evento",
        description: body.description || null,
        startsAt: body.startsAt || new Date().toISOString(),
        endsAt: body.endsAt || null,
        allDay: body.allDay,
      });
      return res.json({ ok: true });
    }

    const numericId = Number(id);
    const [current] = await db.select().from(agendaEvents).where(and(eq(agendaEvents.id, numericId), eq(agendaEvents.tenantId, tenantId))).limit(1);
    if (!current) return res.status(404).json({ error: 'Evento no encontrado' });
    const [saved] = await db.update(agendaEvents).set({
      title: body.title ?? current.title,
      description: body.description ?? current.description,
      startsAt: body.startsAt ? new Date(body.startsAt) : current.startsAt,
      endsAt: body.endsAt !== undefined ? (body.endsAt ? new Date(body.endsAt) : null) : current.endsAt,
      allDay: body.allDay ?? current.allDay,
      eventType: body.eventType ?? current.eventType,
      updatedById: userId,
      updatedAt: new Date(),
    }).where(eq(agendaEvents.id, numericId)).returning();
    res.json({ data: saved });
  });

  app.delete('/api/agenda/events/:id', tenantAuth, requireFeature('agenda'), enforceBranchScope, async (req, res) => {
    const id = String(req.params.id || "");
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    if (id.startsWith("google:")) {
      const googleEventId = id.slice("google:".length);
      const conn = await getActiveConnection(userId, tenantId);
      if (!conn || !conn.selectedCalendarId) return res.status(400).json({ error: "Google Calendar no está conectado." });
      const { accessToken } = await getGoogleAccessToken(conn);
      await deleteGoogleCalendarEvent(accessToken, conn.selectedCalendarId, googleEventId);
      return res.status(204).send();
    }
    await db.delete(agendaEvents).where(and(eq(agendaEvents.id, Number(id)), eq(agendaEvents.tenantId, tenantId)));
    return res.status(204).send();
  });
}
