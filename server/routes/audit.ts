import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin } from "../auth";
import { storage } from "../storage";

const auditQuerySchema = z.object({
  entityType: z.string().trim().max(100).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function registerAuditRoutes(app: Express) {
  app.get("/api/audit", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const query = auditQuerySchema.parse(req.query);
      const logs = await storage.getAuditLogs(req.auth!.tenantId!, {
        entityType: query.entityType,
        entityId: query.entityId,
        userId: query.userId,
        limit: query.limit ?? 50,
      });
      const userIds = Array.from(new Set(logs.map((log) => log.userId).filter(Boolean))) as number[];
      const users = await storage.getUsersByIds(req.auth!.tenantId!, userIds);
      const userMap = new Map(users.map((u) => [u.id, u]));
      const data = logs.map((log) => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) || null : null,
      }));
      res.json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });
}
