import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userBranches, users } from "@shared/schema";

interface BranchAccessDeps {
  findUserRoleAndScope: (tenantId: number, userId: number) => Promise<{ role: string | null; scope: string | null } | null>;
  hasBranchAssignment: (tenantId: number, userId: number, branchId: number) => Promise<boolean>;
}

const defaultDeps: BranchAccessDeps = {
  async findUserRoleAndScope(tenantId, userId) {
    const [user] = await db
      .select({ role: users.role, scope: users.scope })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return user ?? null;
  },
  async hasBranchAssignment(tenantId, userId, branchId) {
    const [assignment] = await db
      .select({ id: userBranches.id })
      .from(userBranches)
      .where(and(eq(userBranches.tenantId, tenantId), eq(userBranches.userId, userId), eq(userBranches.branchId, branchId)));
    return Boolean(assignment?.id);
  },
};

function normalizeBranchId(raw: unknown): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveBranchScope(required: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth?.tenantId || !auth?.userId) {
      return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
    }

    let branchId: number | null = null;
    const headerBranch = req.headers["x-branch-id"];
    if (headerBranch && !Array.isArray(headerBranch)) {
      branchId = normalizeBranchId(headerBranch);
    }

    if (!branchId && req.method === "GET" && req.query?.branchId) {
      branchId = normalizeBranchId(req.query.branchId);
    }

    if (!branchId && auth.scope === "BRANCH" && auth.branchId) {
      branchId = auth.branchId;
    }

    (req as Request & { branchScopeId?: number | null }).branchScopeId = branchId;

    if (required && !branchId) {
      return res.status(403).json({ code: "BRANCH_REQUIRED", message: "Seleccioná una sucursal para continuar" });
    }

    next();
  };
}


export async function hasBranchAccessForUser(params: {
  tenantId: number;
  userId: number;
  role: string | null | undefined;
  scope: string | null | undefined;
  branchId: number;
}, deps: BranchAccessDeps = defaultDeps) {
  const normalizedRole = String(params.role || "").toLowerCase();
  if (normalizedRole === "admin" && params.scope !== "BRANCH") return true;
  return deps.hasBranchAssignment(params.tenantId, params.userId, params.branchId);
}

export function createRequireBranchAccess(deps: BranchAccessDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    const branchId = (req as Request & { branchScopeId?: number | null }).branchScopeId ?? null;
    if (!auth?.tenantId || !auth.userId) {
      return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
    }
    if (!branchId) return next();

    const user = await deps.findUserRoleAndScope(auth.tenantId, auth.userId);
    const role = String(user?.role || auth.role || "").toLowerCase();
    if (role === "admin" && user?.scope !== "BRANCH") return next();

    const hasAccess = await deps.hasBranchAssignment(auth.tenantId, auth.userId, branchId);
    if (!hasAccess) {
      return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
    }

    next();
  };
}

export const requireBranchAccess = createRequireBranchAccess(defaultDeps);
