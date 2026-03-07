import { and, eq, gte, lt, sql, desc, asc } from "drizzle-orm";
import { agendaEvents, notes, orderFieldDefinitions, orderFieldValues, orders } from "@shared/schema";
import { db } from "../db";

export function parseAgendaDate(fieldType: string, valueText?: string | null): Date | null {
  const v = String(valueText || "").trim();
  if (!v) return null;
  if (fieldType === "DATE") {
    const d = new Date(`${v}T09:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (fieldType === "TIME") {
    const d = new Date();
    const [hh, mm] = v.split(":").map((x) => Number(x));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    d.setHours(hh, mm, 0, 0);
    return d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertAgendaEventFromSource(input: {
  tenantId: number;
  userId: number;
  branchId?: number | null;
  sourceEntityType: string;
  sourceEntityId: number;
  sourceFieldKey?: string | null;
  title: string;
  description?: string | null;
  startsAt: Date;
  allDay?: boolean;
  eventType?: string;
}) {
  const sourceFieldKey = input.sourceFieldKey || "__default__";
  const [existing] = await db.select().from(agendaEvents).where(and(
    eq(agendaEvents.tenantId, input.tenantId),
    eq(agendaEvents.sourceEntityType, input.sourceEntityType),
    eq(agendaEvents.sourceEntityId, input.sourceEntityId),
    eq(agendaEvents.sourceFieldKey, sourceFieldKey),
  ));

  if (existing) {
    const [updated] = await db.update(agendaEvents).set({
      branchId: input.branchId ?? null,
      title: input.title,
      description: input.description || null,
      startsAt: input.startsAt,
      allDay: Boolean(input.allDay),
      eventType: input.eventType || "REMINDER",
      updatedById: input.userId,
      updatedAt: new Date(),
    }).where(eq(agendaEvents.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(agendaEvents).values({
    tenantId: input.tenantId,
    branchId: input.branchId ?? null,
    title: input.title,
    description: input.description || null,
    eventType: input.eventType || "REMINDER",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    sourceFieldKey,
    startsAt: input.startsAt,
    allDay: Boolean(input.allDay),
    createdById: input.userId,
    updatedById: input.userId,
  }).returning();
  return created;
}

export async function deleteAgendaEventFromSource(tenantId: number, sourceEntityType: string, sourceEntityId: number, sourceFieldKey?: string | null) {
  let where = and(
    eq(agendaEvents.tenantId, tenantId),
    eq(agendaEvents.sourceEntityType, sourceEntityType),
    eq(agendaEvents.sourceEntityId, sourceEntityId),
  );
  if (sourceFieldKey) where = and(where, eq(agendaEvents.sourceFieldKey, sourceFieldKey))!;
  await db.delete(agendaEvents).where(where!);
}

export async function syncOrderAgendaEvents(tenantId: number, orderId: number, userId: number) {
  const [order] = await db.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
  if (!order) return;
  const rows = await db.select({
    def: orderFieldDefinitions,
    val: orderFieldValues,
  }).from(orderFieldValues)
    .innerJoin(orderFieldDefinitions, eq(orderFieldDefinitions.id, orderFieldValues.fieldDefinitionId))
    .where(and(
      eq(orderFieldValues.tenantId, tenantId),
      eq(orderFieldValues.orderId, orderId),
      eq(orderFieldDefinitions.useInAgenda, true),
    ));

  const seen = new Set<string>();
  for (const row of rows) {
    const when = parseAgendaDate(row.def.fieldType, row.val.valueText);
    const key = row.def.fieldKey;
    seen.add(key);
    if (!when) {
      await deleteAgendaEventFromSource(tenantId, "ORDER", orderId, key);
      continue;
    }
    const title = `Pedido #${order.orderNumber} - ${row.def.label}`;
    await upsertAgendaEventFromSource({
      tenantId,
      userId,
      branchId: order.branchId,
      sourceEntityType: "ORDER",
      sourceEntityId: orderId,
      sourceFieldKey: key,
      title,
      description: order.description || null,
      startsAt: when,
      allDay: row.def.fieldType === "DATE",
      eventType: "ORDER",
    });
  }

  const existing = await db.select().from(agendaEvents).where(and(eq(agendaEvents.tenantId, tenantId), eq(agendaEvents.sourceEntityType, "ORDER"), eq(agendaEvents.sourceEntityId, orderId)));
  for (const ev of existing) {
    if (ev.sourceFieldKey && ev.sourceFieldKey !== "__default__" && !seen.has(ev.sourceFieldKey)) {
      await db.delete(agendaEvents).where(eq(agendaEvents.id, ev.id));
    }
  }
}

export async function syncNoteAgendaEvent(tenantId: number, noteId: number, userId: number) {
  const [note] = await db.select().from(notes).where(and(eq(notes.tenantId, tenantId), eq(notes.id, noteId)));
  if (!note) return;
  if (!note.showInAgenda || !note.remindAt) {
    await deleteAgendaEventFromSource(tenantId, "NOTE", noteId, "remind_at");
    return;
  }
  await upsertAgendaEventFromSource({
    tenantId,
    userId,
    branchId: note.branchId,
    sourceEntityType: "NOTE",
    sourceEntityId: note.id,
    sourceFieldKey: "remind_at",
    title: note.title,
    description: note.content,
    startsAt: note.remindAt,
    allDay: note.allDay,
    eventType: "NOTE",
  });
}

export async function listAgendaEventsRange(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  const where = [eq(agendaEvents.tenantId, tenantId), gte(agendaEvents.startsAt, from), lt(agendaEvents.startsAt, to)];
  if (branchId) where.push(eq(agendaEvents.branchId, branchId));
  return db.select().from(agendaEvents).where(and(...where)).orderBy(asc(agendaEvents.startsAt));
}

export async function dashboardAgendaBlocks(tenantId: number, branchId?: number | null) {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const base = [eq(agendaEvents.tenantId, tenantId)] as any[];
  if (branchId) base.push(eq(agendaEvents.branchId, branchId));

  const [upcoming, today] = await Promise.all([
    db.select().from(agendaEvents).where(and(...base, gte(agendaEvents.startsAt, now), lt(agendaEvents.startsAt, nextWeek))).orderBy(asc(agendaEvents.startsAt)).limit(6),
    db.select().from(agendaEvents).where(and(...base, gte(agendaEvents.startsAt, todayStart), lt(agendaEvents.startsAt, tomorrowStart))).orderBy(asc(agendaEvents.startsAt)).limit(6),
  ]);

  return { upcoming, today };
}
