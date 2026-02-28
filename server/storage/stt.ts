import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { sttLogs, sttInteractions, type InsertSttLog, type InsertSttInteraction } from "@shared/schema";

export const sttStorage = {
  async createSttLog(data: InsertSttLog) {
    const values = {
      tenantId: data.tenantId,
      userId: data.userId ?? null,
      context: data.context,
      transcription: data.transcription ?? null,
      intentJson: data.intentJson ?? null,
      confirmed: data.confirmed ?? false,
      resultEntityType: data.resultEntityType ?? null,
      resultEntityId: data.resultEntityId ?? null,
      confirmedAt: data.confirmedAt ?? null,
    };
    const [log] = await db.insert(sttLogs).values(values).returning();
    return log;
  },
  async getSttLogs(tenantId: number) {
    return db
      .select()
      .from(sttLogs)
      .where(eq(sttLogs.tenantId, tenantId))
      .orderBy(desc(sttLogs.createdAt));
  },
  async updateSttLogConfirmed(logId: number, tenantId: number, updates: {
    resultEntityType: string;
    resultEntityId: number;
  }) {
    await db
      .update(sttLogs)
      .set({
        confirmed: true,
        resultEntityType: updates.resultEntityType,
        resultEntityId: updates.resultEntityId,
        confirmedAt: new Date(),
      })
      .where(and(eq(sttLogs.id, logId), eq(sttLogs.tenantId, tenantId)));
  },
  async getLastUnconfirmedLog(tenantId: number, userId: number, context: string) {
    const [log] = await db
      .select()
      .from(sttLogs)
      .where(and(
        eq(sttLogs.tenantId, tenantId),
        eq(sttLogs.userId, userId),
        eq(sttLogs.context, context),
        eq(sttLogs.confirmed, false),
      ))
      .orderBy(desc(sttLogs.createdAt))
      .limit(1);
    return log;
  },
  async createSttInteraction(data: InsertSttInteraction) {
    const values = {
      tenantId: data.tenantId,
      userId: data.userId ?? null,
      transcript: data.transcript,
      intentConfirmed: data.intentConfirmed,
      entitiesConfirmed: data.entitiesConfirmed,
      status: data.status ?? "PENDING",
      errorCode: data.errorCode ?? null,
      idempotencyKey: data.idempotencyKey,
      updatedAt: new Date(),
    };
    const [row] = await db.insert(sttInteractions).values(values).returning();
    return row;
  },
  async updateSttInteractionResult(id: number, tenantId: number, patch: { status: "SUCCESS" | "FAILED"; transcript?: string; intentConfirmed?: string; entitiesConfirmed?: Record<string, unknown>; errorCode?: string | null }) {
    await db
      .update(sttInteractions)
      .set({
        status: patch.status,
        transcript: patch.transcript,
        intentConfirmed: patch.intentConfirmed,
        entitiesConfirmed: patch.entitiesConfirmed,
        errorCode: patch.errorCode ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(sttInteractions.id, id), eq(sttInteractions.tenantId, tenantId)));
  },
  async getSttInteractionByIdempotency(tenantId: number, userId: number, idempotencyKey: string) {
    const [row] = await db
      .select()
      .from(sttInteractions)
      .where(and(eq(sttInteractions.tenantId, tenantId), eq(sttInteractions.userId, userId), eq(sttInteractions.idempotencyKey, idempotencyKey)))
      .limit(1);
    return row;
  },
  async getSttInteractionsByTenant(tenantId: number, userId?: number | null, limit = 50) {
    return db
      .select()
      .from(sttInteractions)
      .where(userId ? and(eq(sttInteractions.tenantId, tenantId), eq(sttInteractions.userId, userId)) : eq(sttInteractions.tenantId, tenantId))
      .orderBy(desc(sttInteractions.createdAt))
      .limit(limit);
  },
};
