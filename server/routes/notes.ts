import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, enforceBranchScope, requireFeature } from "../auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { db } from "../db";
import { notes } from "@shared/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { syncNoteAgendaEvent, deleteAgendaEventFromSource } from "../services/agenda";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(220),
  content: z.string().max(2000).optional().nullable(),
  remindAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  showInAgenda: z.boolean().optional(),
  status: z.enum(["ACTIVA", "HECHA", "ARCHIVADA"]).optional(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQ = z.object({ status: z.string().optional() });

export function registerNotesRoutes(app: Express) {
  app.get('/api/notes', tenantAuth, requireFeature('notes'), enforceBranchScope, validateQuery(listQ), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : null;
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const cond = [eq(notes.tenantId, tenantId)] as any[];
    if (branchId) cond.push(eq(notes.branchId, branchId));
    if (status && status !== 'TODAS') cond.push(eq(notes.status, status));
    const data = await db.select().from(notes).where(and(...cond)).orderBy(asc(notes.status), asc(notes.remindAt), desc(notes.createdAt));
    res.json({ data });
  });

  app.post('/api/notes', tenantAuth, requireFeature('notes'), enforceBranchScope, validateBody(noteSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : (req.body.branchId ?? null);
    const [created] = await db.insert(notes).values({
      tenantId,
      branchId,
      title: req.body.title,
      content: req.body.content || null,
      remindAt: req.body.remindAt ? new Date(req.body.remindAt) : null,
      allDay: Boolean(req.body.allDay),
      showInAgenda: Boolean(req.body.showInAgenda),
      status: req.body.status || 'ACTIVA',
      createdById: userId,
      updatedById: userId,
    }).returning();
    await syncNoteAgendaEvent(tenantId, created.id, userId);
    res.status(201).json({ data: created });
  });

  app.patch('/api/notes/:id', tenantAuth, requireFeature('notes'), enforceBranchScope, validateParams(idParam), validateBody(noteSchema.partial()), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [current] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: 'Nota no encontrada' });
    const branchId = req.auth!.scope === 'BRANCH' ? req.auth!.branchId : (req.body.branchId ?? current.branchId ?? null);
    const [saved] = await db.update(notes).set({
      title: req.body.title ?? current.title,
      content: req.body.content ?? current.content,
      remindAt: req.body.remindAt !== undefined ? (req.body.remindAt ? new Date(req.body.remindAt) : null) : current.remindAt,
      allDay: req.body.allDay ?? current.allDay,
      showInAgenda: req.body.showInAgenda ?? current.showInAgenda,
      status: req.body.status ?? current.status,
      branchId,
      updatedById: req.auth!.userId,
      updatedAt: new Date(),
    }).where(eq(notes.id, id)).returning();
    await syncNoteAgendaEvent(tenantId, id, req.auth!.userId);
    res.json({ data: saved });
  });

  app.delete('/api/notes/:id', tenantAuth, requireFeature('notes'), enforceBranchScope, validateParams(idParam), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [current] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: 'Nota no encontrada' });
    await db.delete(notes).where(eq(notes.id, id));
    await deleteAgendaEventFromSource(tenantId, "NOTE", id, "remind_at");
    res.status(204).send();
  });
}
