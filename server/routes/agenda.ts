import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, enforceBranchScope, requireFeature } from "../auth";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { db } from "../db";
import { agendaEvents } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { listAgendaEventsRange } from "../services/agenda";
import { syncEventToGoogle, deleteEventFromGoogle, getActiveConnection, getValidAccessToken } from "../services/google-calendar";
import { listGoogleCalendarEvents } from "../services/google-oauth";

const rangeQuery = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const createSchema = z.object({
  title: z.string().trim().min(1).max(220),
  description: z.string().max(2000).optional().nullable(),
  eventType: z.string().trim().min(1).max(40).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  status: z.string().max(30).optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  googleSyncEnabled: z.boolean().optional(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function registerAgendaRoutes(app: Express) {
  app.get('/api/agenda/events', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateQuery(rangeQuery), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : null;
    const from = new Date(String(req.query.from));
    const to = new Date(String(req.query.to));
    const data = await listAgendaEventsRange(tenantId, from, to, branchId);
    let allEvents: any[] = [...data];

    try {
      const conn = await getActiveConnection(userId, tenantId);
      if (conn && conn.selectedCalendarId) {
        const accessToken = await getValidAccessToken(conn.id);
        if (accessToken) {
          const googleEvents = await listGoogleCalendarEvents(accessToken, conn.selectedCalendarId, from.toISOString(), to.toISOString());
          
          const existingGoogleIds = new Set(data.filter(d => Boolean(d.googleEventId)).map(d => String(d.googleEventId)));
          
          const mapped = googleEvents
            .filter((e: any) => !existingGoogleIds.has(e.id))
            .map((e: any) => ({
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
            
          allEvents = [...mapped, ...allEvents];
        }
      }
    } catch (err) {
      console.error("[Agenda] Error listando eventos externos", err);
    }

    res.json({ data: allEvents });
  });

  app.post('/api/agenda/events', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateBody(createSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : (req.body.branchId ?? null);
    const [created] = await db.insert(agendaEvents).values({
      tenantId,
      branchId,
      title: req.body.title,
      description: req.body.description || null,
      eventType: req.body.eventType || 'MANUAL',
      startsAt: new Date(req.body.startsAt),
      endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
      allDay: Boolean(req.body.allDay),
      status: req.body.status || 'PENDIENTE',
      createdById: userId,
      updatedById: userId,
      googleSyncEnabled: Boolean(req.body.googleSyncEnabled),
    }).returning();
    
    // Background sync to Google Calendar if requested
    if (created.googleSyncEnabled) {
      syncEventToGoogle(tenantId, userId, created.id).catch(err => console.error("Error trigger syncEventToGoogle:", err));
    }
    
    res.status(201).json({ data: created });
  });

  app.patch('/api/agenda/events/:id', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateParams(idParam), validateBody(createSchema.partial()), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [current] = await db.select().from(agendaEvents).where(and(eq(agendaEvents.id, id), eq(agendaEvents.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: 'Evento no encontrado' });
    if (current.sourceEntityType) return res.status(400).json({ error: 'Evento sincronizado desde otra entidad' });
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : (req.body.branchId ?? current.branchId ?? null);
    const [saved] = await db.update(agendaEvents).set({
      title: req.body.title ?? current.title,
      description: req.body.description ?? current.description,
      eventType: req.body.eventType ?? current.eventType,
      startsAt: req.body.startsAt ? new Date(req.body.startsAt) : current.startsAt,
      endsAt: req.body.endsAt !== undefined ? (req.body.endsAt ? new Date(req.body.endsAt) : null) : current.endsAt,
      allDay: req.body.allDay ?? current.allDay,
      status: req.body.status ?? current.status,
      branchId,
      updatedById: req.auth!.userId,
      googleSyncEnabled: req.body.googleSyncEnabled ?? current.googleSyncEnabled,
      updatedAt: new Date(),
    }).where(eq(agendaEvents.id, id)).returning();
    
    // Resync or remove according to the toggle
    if (saved.googleSyncEnabled) {
      syncEventToGoogle(tenantId, req.auth!.userId, saved.id).catch(err => console.error(err));
    } else if (current.googleSyncEnabled && current.googleEventId) {
      deleteEventFromGoogle(tenantId, req.auth!.userId, current.googleEventId).catch(err => console.error(err));
      // Locally unlink
      await db.update(agendaEvents).set({ googleEventId: null }).where(eq(agendaEvents.id, saved.id));
      saved.googleEventId = null;
    }
    
    res.json({ data: saved });
  });

  app.delete('/api/agenda/events/:id', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateParams(idParam), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [current] = await db.select().from(agendaEvents).where(and(eq(agendaEvents.id, id), eq(agendaEvents.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: 'Evento no encontrado' });
    if (current.sourceEntityType) return res.status(400).json({ error: 'Evento sincronizado desde otra entidad' });
    
    await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
    
    if (current.googleEventId) {
      deleteEventFromGoogle(tenantId, req.auth!.userId, current.googleEventId).catch(err => console.error(err));
    }
    
    res.status(204).send();
  });
}
