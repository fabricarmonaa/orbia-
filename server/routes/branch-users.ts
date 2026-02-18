import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, blockBranchScope, hashPassword, requireTenantAdmin } from "../auth";

export function registerBranchUserRoutes(app: Express) {
  app.get("/api/branch-users", tenantAuth, requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.query.branchId ? parseInt(req.query.branchId as string) : undefined;
      const users = await storage.getBranchUsers(tenantId, branchId);
      const safeUsers = users.map((u: any) => { const { password: _, ...rest } = u; return rest; });
      res.json({ data: safeUsers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/branch-users", tenantAuth, requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { branchId, fullName, email, password, phone } = req.body;

      if (!branchId || !fullName || !email || !password) {
        return res.status(400).json({ error: "Campos requeridos: branchId, fullName, email, password" });
      }

      const branch = await storage.getBranchById(branchId, tenantId);
      if (!branch) {
        return res.status(400).json({ error: "Sucursal no encontrada" });
      }

      const existingUser = await storage.getUserByEmail(email, tenantId);
      if (existingUser) {
        return res.status(400).json({ error: "Ya existe un usuario con ese email" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        tenantId,
        email,
        password: hashedPassword,
        fullName,
        role: "branch_staff",
        scope: "BRANCH",
        branchId,
        isActive: true,
        isSuperAdmin: false,
      });

      const { password: _, ...safeUser } = user;
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "branch_user",
        entityId: user.id,
        metadata: { branchId, email },
      });
      res.status(201).json({ data: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/branch-users/:id", tenantAuth, requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = parseInt(req.params.id as string);
      const { isActive, fullName, branchId } = req.body;

      const updates: any = {};
      if (isActive !== undefined) updates.isActive = isActive;
      if (fullName) updates.fullName = fullName;
      if (branchId) {
        const branch = await storage.getBranchById(branchId, tenantId);
        if (!branch) {
          return res.status(400).json({ error: "Sucursal no encontrada" });
        }
        updates.branchId = branchId;
      }

      const user = await storage.updateUser(userId, tenantId, updates);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "update",
        entityType: "branch_user",
        entityId: userId,
        metadata: { updates },
      });
      const { password: _, ...safeUser } = user;
      res.json({ data: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/branch-users/:id/reset-password",
    tenantAuth,
    requireTenantAdmin,
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = parseInt(req.params.id as string);

      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const hashedPin = await hashPassword(pin);

      const user = await storage.updateUser(userId, tenantId, { password: hashedPin });
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "reset_password",
        entityType: "branch_user",
        entityId: userId,
      });

      res.json({ data: { temporaryPassword: pin } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(
    "/api/branch-users/:id",
    tenantAuth,
    requireTenantAdmin,
    blockBranchScope,
    async (req, res) => {
      try {
        const tenantId = req.auth!.tenantId!;
        const userId = parseInt(req.params.id as string);
        const user = await storage.getUserById(userId, tenantId);
        if (!user) {
          return res.status(404).json({ error: "Usuario no encontrado" });
        }
        if (user.role === "admin") {
          const admins = await storage.getTenantAdmins(tenantId);
          if (admins.length <= 1) {
            return res.status(400).json({ error: "No podés eliminar el último administrador" });
          }
        }
        const deleted = await storage.softDeleteUser(userId, tenantId);
        await storage.createAuditLog({
          tenantId,
          userId: req.auth!.userId,
          action: "delete",
          entityType: "branch_user",
          entityId: userId,
        });
        res.json({ data: deleted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );
}
