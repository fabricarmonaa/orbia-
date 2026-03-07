import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, enforceBranchScope, requireFeature } from "../auth";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { db } from "../db";
import { agendaEvents } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { listAgendaEventsRange } from "../services/agenda";

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
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function registerAgendaRoutes(app: Express) {
  app.get('/api/agenda/events', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateQuery(rangeQuery), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : null;
    const from = new Date(String(req.query.from));
    const to = new Date(String(req.query.to));
    const data = await listAgendaEventsRange(tenantId, from, to, branchId);
    res.json({ data });
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
    }).returning();
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
      updatedAt: new Date(),
    }).where(eq(agendaEvents.id, id)).returning();
    res.json({ data: saved });
  });

  app.delete('/api/agenda/events/:id', tenantAuth, requireFeature('agenda'), enforceBranchScope, validateParams(idParam), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [current] = await db.select().from(agendaEvents).where(and(eq(agendaEvents.id, id), eq(agendaEvents.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: 'Evento no encontrado' });
    if (current.sourceEntityType) return res.status(400).json({ error: 'Evento sincronizado desde otra entidad' });
    await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
    res.status(204).send();
  });
}
