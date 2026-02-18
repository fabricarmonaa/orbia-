import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { sttLogs, type InsertSttLog } from "@shared/schema";

export const sttStorage = {
  async createSttLog(data: InsertSttLog) {
    const [log] = await db.insert(sttLogs).values(data).returning();
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
};
