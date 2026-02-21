import type { Express } from "express";
import { storage } from "../storage";
import {
  tenantAuth,
  requireFeature,
  blockBranchScope,
  enforceBranchScope,
  requireTenantAdmin,
  requirePlanCodes,
} from "../auth";

export function registerBranchRoutes(app: Express) {
  app.get(
    "/api/branches",
    tenantAuth,
    requireTenantAdmin,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const tenant = await storage.getTenantById(tenantId);
      const plan = tenant?.planId ? await storage.getPlanById(tenant.planId) : null;
      const features = (plan?.featuresJson || {}) as Record<string, boolean>;
      const hasBranchesFeature = Boolean(features.branches) || Boolean((plan as any)?.allowBranches);
      if (!hasBranchesFeature) {
        return res.json({ data: [{ id: 0, tenantId, name: "Casa Central", address: null, phone: null, isActive: true }] });
      }
      if (req.auth!.scope === "BRANCH" && req.auth!.branchId) {
        const branch = await storage.getBranchById(req.auth!.branchId, tenantId);
        return res.json({ data: branch ? [branch] : [] });
      }
      const data = await storage.getBranches(tenantId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/branches",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("branches"),
    requirePlanCodes(["ESCALA"]),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const plan = req.plan!;
      const maxBranches = plan.limits.max_branches;
      if (maxBranches >= 0) {
        const existing = await storage.getBranches(tenantId);
        if (existing.length >= maxBranches) {
          return res.status(403).json({
            error: `Tu plan "${plan.name}" permite máximo ${maxBranches} sucursales. Mejorá tu plan para agregar más.`,
            code: "LIMIT_REACHED",
            limit: "max_branches",
            currentPlan: plan.planCode,
          });
        }
      }
      const data = await storage.createBranch({
        tenantId,
        ...req.body,
      });
      res.status(201).json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(
    "/api/branches/:branchId/orders",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("branches"),
    requirePlanCodes(["ESCALA"]),
    enforceBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = parseInt(req.params.branchId as string);
      if (req.auth!.scope === "BRANCH" && req.auth!.branchId !== branchId) {
        return res.status(403).json({ error: "No tenés acceso a esta sucursal" });
      }
      const branch = await storage.getBranchById(branchId, tenantId);
      if (!branch) return res.status(404).json({ error: "Sucursal no encontrada" });
      const data = await storage.getOrdersByBranch(tenantId, branchId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(
    "/api/branches/:branchId/cash/movements",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("branches"),
    requirePlanCodes(["ESCALA"]),
    enforceBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = parseInt(req.params.branchId as string);
      if (req.auth!.scope === "BRANCH" && req.auth!.branchId !== branchId) {
        return res.status(403).json({ error: "No tenés acceso a esta sucursal" });
      }
      const branch = await storage.getBranchById(branchId, tenantId);
      if (!branch) return res.status(404).json({ error: "Sucursal no encontrada" });
      const data = await storage.getCashMovementsByBranch(tenantId, branchId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(
    "/api/branches/:branchId",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("branches"),
    requirePlanCodes(["ESCALA"]),
    blockBranchScope,
    async (req, res) => {
      try {
        const tenantId = req.auth!.tenantId!;
        const branchId = parseInt(req.params.branchId as string);
        const branch = await storage.getBranchById(branchId, tenantId);
        if (!branch) return res.status(404).json({ error: "Sucursal no encontrada" });

        const stockCount = await storage.getBranchStockCount(tenantId, branchId);
        if (stockCount > 0) {
          return res.status(400).json({ error: "No se puede eliminar: la sucursal tiene stock disponible." });
        }

        const cashMovements = await storage.getCashMovementsByBranch(tenantId, branchId);
        if (cashMovements.length > 0) {
          return res.status(400).json({ error: "No se puede eliminar: la sucursal tiene movimientos de caja." });
        }

        const orders = await storage.getOrdersByBranch(tenantId, branchId);
        const statuses = await storage.getOrderStatuses(tenantId);
        const finalStatusIds = new Set(statuses.filter((s) => s.isFinal).map((s) => s.id));
        const activeOrders = orders.filter((o) => !finalStatusIds.has(o.statusId ?? -1));
        if (activeOrders.length > 0) {
          return res.status(400).json({ error: "No se puede eliminar: la sucursal tiene pedidos activos." });
        }

        const deleted = await storage.softDeleteBranch(branchId, tenantId);
        await storage.createAuditLog({
          tenantId,
          userId: req.auth!.userId,
          action: "delete",
          entityType: "branch",
          entityId: branchId,
          metadata: { ip: req.ip, branchName: branch.name },
        });
        res.json({ data: deleted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.get("/api/order-statuses", tenantAuth, async (req, res) => {
    try {
      const data = await storage.getOrderStatuses(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
