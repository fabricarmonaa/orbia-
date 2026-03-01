import type { Express } from "express";
import { enforceBranchScope, requireRoleAny, tenantAuth } from "../auth";
import { getDashboardAnalytics } from "../services/analytics.service";

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/analytics/dashboard", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : undefined;
      const data = await getDashboardAnalytics(tenantId, branchId);
      return res.json({ data });
    } catch (err: any) {
      return res.status(500).json({ error: "No se pudo cargar analytics", code: "ANALYTICS_DASHBOARD_ERROR" });
    }
  });
}
