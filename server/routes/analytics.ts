import type { Express } from "express";
import { requireRoleAny, tenantAuth } from "../auth";
import { resolveBranchScope, requireBranchAccess } from "../middleware/branch-scope";
import { getDashboardSummary, getSalesOverTime, getTopCustomers, getTopProducts, getTopTechnicians } from "../services/analytics";

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/analytics/dashboard", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), resolveBranchScope(false), requireBranchAccess, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = await getDashboardSummary(tenantId, (req as any).branchScopeId || null);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar analytics", code: "ANALYTICS_DASHBOARD_ERROR" });
    }
  });

  app.get("/api/analytics/products", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), resolveBranchScope(false), requireBranchAccess, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = await getTopProducts(tenantId, 10, (req as any).branchScopeId || null);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar top productos", code: "ANALYTICS_PRODUCTS_ERROR" });
    }
  });

  app.get("/api/analytics/customers", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), resolveBranchScope(false), requireBranchAccess, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = await getTopCustomers(tenantId, 10, (req as any).branchScopeId || null);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar top clientes", code: "ANALYTICS_CUSTOMERS_ERROR" });
    }
  });

  app.get("/api/analytics/technicians", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), resolveBranchScope(false), requireBranchAccess, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = await getTopTechnicians(tenantId, 10, (req as any).branchScopeId || null);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar top técnicos", code: "ANALYTICS_TECHNICIANS_ERROR" });
    }
  });

  app.get("/api/analytics/sales", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), resolveBranchScope(false), requireBranchAccess, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const range = typeof req.query?.range === "string" ? req.query.range : "30d";
      const data = await getSalesOverTime(tenantId, range, (req as any).branchScopeId || null);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar serie de ventas", code: "ANALYTICS_SALES_ERROR" });
    }
  });
}
