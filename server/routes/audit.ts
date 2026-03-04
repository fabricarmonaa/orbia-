import type { Express } from "express";
import { z } from "zod";
import { requireTenantAdmin, tenantAuth } from "../auth";
import { listAuditEvents } from "../services/audit";

const auditQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  entityType: z.string().trim().max(120).optional(),
  action: z.string().trim().max(120).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  actor: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export function registerAuditRoutes(app: Express) {
  app.get("/api/audit", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const query = auditQuerySchema.parse(req.query);
      const actorId = query.actor && /^\d+$/.test(query.actor) ? Number(query.actor) : undefined;
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;

      if (from && Number.isNaN(from.getTime())) return res.status(400).json({ error: "La fecha desde es inválida", code: "AUDIT_INVALID_FROM" });
      if (to && Number.isNaN(to.getTime())) return res.status(400).json({ error: "La fecha hasta es inválida", code: "AUDIT_INVALID_TO" });

      const result = await listAuditEvents(req.auth!.tenantId!, {
        from,
        to,
        entityType: query.entityType,
        action: query.action,
        branchId: query.branchId,
        actorUserId: actorId,
        actorCashierId: actorId,
        page: query.page,
        pageSize: query.pageSize,
      });

      return res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Parámetros inválidos", code: "AUDIT_INVALID_QUERY", details: err.errors });
      }
      return res.status(500).json({ error: "No se pudo consultar la auditoría", code: "AUDIT_LIST_ERROR" });
    }
  });
}
