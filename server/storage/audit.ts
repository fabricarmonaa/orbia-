import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { auditLogs, type InsertAuditLog } from "@shared/schema";
import { appendTenantEvent } from "../services/tenant-logger";

export const auditStorage = {
    async createAuditLog(data: {
        tenantId: number;
        userId: number | null;
        action: string;
        entityType: string;
        entityId?: number;
        changes?: any;
        metadata?: any;
    }) {
        const [log] = await db.insert(auditLogs).values(data).returning();
        appendTenantEvent({ tenantId: data.tenantId, userId: data.userId, action: data.action, entityType: data.entityType, entityId: data.entityId, metadata: data.metadata, ts: log.createdAt?.toISOString?.() });
        return log;
    },

    async getAuditLogs(tenantId: number, filters?: {
        entityType?: string;
        entityId?: number;
        userId?: number;
        limit?: number;
    }) {
        const conditions = [eq(auditLogs.tenantId, tenantId)];

        if (filters?.entityType) {
            conditions.push(eq(auditLogs.entityType, filters.entityType));
        }
        if (filters?.entityId !== undefined) {
            conditions.push(eq(auditLogs.entityId, filters.entityId));
        }
        if (filters?.userId !== undefined) {
            conditions.push(eq(auditLogs.userId, filters.userId));
        }

        const baseQuery = db
            .select()
            .from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt));

        if (filters?.limit) {
            return baseQuery.limit(filters.limit);
        }

        return baseQuery;
    },

    async getAuditLogsByEntity(tenantId: number, entityType: string, entityId: number) {
        return db
            .select()
            .from(auditLogs)
            .where(
                and(
                    eq(auditLogs.tenantId, tenantId),
                    eq(auditLogs.entityType, entityType),
                    eq(auditLogs.entityId, entityId)
                )
            )
            .orderBy(desc(auditLogs.createdAt));
    },
};
