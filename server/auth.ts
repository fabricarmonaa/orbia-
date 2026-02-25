import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { getSessionSecret } from "./config";

function unauthorizedResponse(res: Response, type: "required" | "expired" | "invalid") {
  if (type == "required") {
    return res.status(401).json({ error: "Token requerido", code: "AUTH_REQUIRED" });
  }
  if (type == "expired") {
    return res.status(401).json({ error: "Sesión expirada. Iniciá sesión nuevamente", code: "AUTH_EXPIRED" });
  }
  return res.status(401).json({ error: "Token inválido", code: "AUTH_INVALID" });
}





export function getClientIp(req: Request) {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function isIpAllowedForSuperAdmin(req: Request) {
  const raw = (process.env.SUPERADMIN_IP_ALLOWLIST || "").trim();
  if (!raw) return true;
  const allow = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const ip = getClientIp(req);
  return allow.includes(ip);
}

function buildUpgradeUrl(tenantCode?: string | null) {
  if (!tenantCode) return "https://wa.me/5492236979026";
  const text = `Hola! Mi código de negocio es ${tenantCode} y quiero mejorar mi plan`;
  return `https://wa.me/5492236979026?text=${encodeURIComponent(text)}`;
}

function mapJwtError(err: unknown): "expired" | "invalid" {
  if (err && typeof err === "object" && "name" in err && (err as any).name === "TokenExpiredError") {
    return "expired";
  }
  return "invalid";
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  tenantId: number | null;
  isSuperAdmin: boolean;
  branchId: number | null;
  scope?: string;
  deliveryAgentId?: number;
  cashierId?: number;
}

export interface PlanFeatures {
  orders: boolean;
  tracking: boolean;
  cash_simple: boolean;
  cash_sessions: boolean;
  products: boolean;
  branches: boolean;
  fixed_expenses: boolean;
  variable_expenses: boolean;
  reports_advanced: boolean;
  stt: boolean;
  [key: string]: boolean;
}

export interface PlanLimits {
  max_branches: number;
  max_staff_users: number;
  max_orders_month: number;
  tracking_retention_min_hours: number;
  tracking_retention_max_hours: number;
  [key: string]: number;
}

export interface TenantPlanInfo {
  planCode: string;
  name: string;
  features: PlanFeatures;
  limits: PlanLimits;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn: "24h", algorithm: "HS256" });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSessionSecret(), { algorithms: ["HS256"] }) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getTenantPlan(tenantId: number): Promise<TenantPlanInfo | null> {
  const tenant = await storage.getTenantById(tenantId);
  if (!tenant?.planId) return null;
  const plan = await storage.getPlanById(tenant.planId);
  if (!plan) return null;

  // featuresJson is the canonical source of truth (populated by seed / super admin).
  // For backwards compat, also merge the legacy boolean columns on the plans table
  // so that tenants created before the featuresJson migration keep working.
  const baseFeatures = (plan.featuresJson || {}) as PlanFeatures;
  const computedFeatures: PlanFeatures = {
    // Backcompat: legacy boolean columns take effect if not explicitly in JSON
    cashiers: baseFeatures.cashiers ?? Boolean((plan as any).allowCashiers),
    CASHIERS: baseFeatures.CASHIERS ?? Boolean((plan as any).allowCashiers),
    margin_pricing: baseFeatures.margin_pricing ?? Boolean((plan as any).allowMarginPricing),
    MARGIN_PRICING: baseFeatures.MARGIN_PRICING ?? Boolean((plan as any).allowMarginPricing),
    excel_import: baseFeatures.excel_import ?? Boolean((plan as any).allowExcelImport),
    EXCEL_IMPORT: baseFeatures.EXCEL_IMPORT ?? Boolean((plan as any).allowExcelImport),
    custom_tos: baseFeatures.custom_tos ?? Boolean((plan as any).allowCustomTos),
    CUSTOM_TOS: baseFeatures.CUSTOM_TOS ?? Boolean((plan as any).allowCustomTos),
    ...baseFeatures, // JSON keys win over backcompat defaults
  } as PlanFeatures;

  const legacyMaxBranches = Number((plan as any).maxBranches ?? 0);
  const baseLimits = (plan.limitsJson || {}) as PlanLimits;
  const computedLimits: PlanLimits = {
    // Spread JSON first; then override with legacy column values when the JSON key is absent
    ...baseLimits,
    branches_max: baseLimits.branches_max ?? legacyMaxBranches,
    max_branches: baseLimits.max_branches ?? legacyMaxBranches,
  } as PlanLimits;

  return {
    planCode: plan.planCode,
    name: plan.name,
    features: computedFeatures,
    limits: computedLimits,
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
      plan?: TenantPlanInfo;
      context?: {
        tenantId: number | null;
        branchId: number | null;
        userId: number;
        scope: string;
      };
    }
  }
}

export function superAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isIpAllowedForSuperAdmin(req)) {
      return res.status(403).json({ error: "Acceso restringido", code: "SUPERADMIN_IP_BLOCKED" });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorizedResponse(res, "required");
    }
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload.isSuperAdmin) {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    req.auth = payload;
    next();
  } catch (err) {
    return unauthorizedResponse(res, mapJwtError(err));
  }
}

export function tenantAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorizedResponse(res, "required");
    }
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload.tenantId) {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    req.auth = payload;
    storage.getTenantById(payload.tenantId)
      .then((tenant) => {
        if (!tenant || tenant.deletedAt) {
          return res.status(403).json({ error: "Negocio eliminado", code: "TENANT_DELETED" });
        }
        if (tenant.isBlocked) {
          return res.status(403).json({ error: "Negocio bloqueado", code: "TENANT_BLOCKED" });
        }
        if (!tenant.isActive) {
          return res.status(403).json({ error: "Cuenta bloqueada por falta de pago. Contacte al administrador.", code: "ACCOUNT_BLOCKED" });
        }
        next();
      })
      .catch(() => res.status(500).json({ error: "Error verificando negocio" }));
  } catch (err) {
    return unauthorizedResponse(res, mapJwtError(err));
  }
}

export function enforceBranchScope(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.scope === "BRANCH") {
    if (!req.auth.branchId) {
      return res.status(403).json({ error: "Usuario BRANCH sin sucursal asignada" });
    }
    if (req.body && req.body.branchId !== undefined) {
      req.body.branchId = req.auth.branchId;
    }
  }
  next();
}

export function blockBranchScope(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.scope === "BRANCH") {
    return res.status(403).json({ error: "Acceso denegado para usuarios de sucursal" });
  }
  next();
}

export function requireFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.tenantId) {
        return res.status(403).json({ error: "Acceso denegado" });
      }
      const plan = await getTenantPlan(req.auth.tenantId);
      if (!plan) {
        return res.status(403).json({ error: "Sin plan asignado", code: "NO_PLAN" });
      }
      req.plan = plan;
      if (!plan.features[featureKey]) {
        const tenant = await storage.getTenantById(req.auth.tenantId);
        return res.status(403).json({
          error: `Tu plan "${plan.name}" no incluye esta funcionalidad. Mejorá tu plan para acceder.`,
          code: "FEATURE_BLOCKED",
          feature: featureKey,
          currentPlan: plan.planCode,
          upgradeUrl: buildUpgradeUrl(tenant?.code),
        });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Error verificando plan" });
    }
  };
}


export function requirePlanCodes(allowedPlanCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.tenantId) {
        return res.status(403).json({ error: "Acceso denegado", code: "FORBIDDEN" });
      }
      const plan = await getTenantPlan(req.auth.tenantId);
      if (!plan) {
        return res.status(403).json({ error: "Sin plan asignado", code: "NO_PLAN" });
      }
      req.plan = plan;
      const planCode = (plan.planCode || "").toUpperCase();
      const allowed = allowedPlanCodes.map((c) => c.toUpperCase());
      if (!allowed.includes(planCode)) {
        const tenant = await storage.getTenantById(req.auth.tenantId);
        return res.status(403).json({
          error: "Tu plan no incluye esta función.",
          code: "FEATURE_BLOCKED",
          currentPlan: plan.planCode,
          upgradeUrl: buildUpgradeUrl(tenant?.code),
        });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Error verificando plan", code: "PLAN_CHECK_ERROR" });
    }
  };
}

export function requireNotPlanCodes(blockedPlanCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.tenantId) {
        return res.status(403).json({ error: "Acceso denegado", code: "FORBIDDEN" });
      }
      const plan = await getTenantPlan(req.auth.tenantId);
      if (!plan) {
        return res.status(403).json({ error: "Sin plan asignado", code: "NO_PLAN" });
      }
      req.plan = plan;
      const blocked = blockedPlanCodes.map((c) => c.toUpperCase());
      if (blocked.includes((plan.planCode || "").toUpperCase())) {
        const tenant = await storage.getTenantById(req.auth.tenantId);
        return res.status(403).json({
          error: "Tu plan no incluye esta función. Mejorá tu plan para usarla.",
          code: "FEATURE_BLOCKED",
          currentPlan: plan.planCode,
          upgradeUrl: buildUpgradeUrl(tenant?.code),
        });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Error verificando plan", code: "PLAN_CHECK_ERROR" });
    }
  };
}

export function requireAddon(addonKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        return res.status(403).json({ error: "Acceso denegado" });
      }
      const addon = await storage.getTenantAddon(tenantId, addonKey);
      if (!addon?.enabled) {
        return res.status(403).json({
          error: "Este addon no está habilitado para tu negocio",
          code: "ADDON_NOT_ENABLED",
          addon: addonKey,
        });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Error verificando addon" });
    }
  };
}

export function deliveryAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorizedResponse(res, "required");
    }
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload.scope !== "DELIVERY" || !payload.deliveryAgentId) {
      return res.status(403).json({ error: "Acceso denegado: se requiere token de delivery" });
    }
    req.auth = payload;
    next();
  } catch (err) {
    return unauthorizedResponse(res, mapJwtError(err));
  }
}

// Helper: Require tenant context
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.tenantId) {
    return res.status(403).json({ error: "Contexto de tenant requerido" });
  }
  next();
}

// Helper: Inject context
export function injectContext(req: Request, res: Response, next: NextFunction) {
  if (req.auth) {
    req.context = {
      tenantId: req.auth.tenantId || null,
      branchId: req.auth.branchId || null,
      userId: req.auth.userId,
      scope: req.auth.scope || "TENANT",
    };
  }
  next();
}

// Middleware: Validate entity branch ownership
export function validateBranchOwnership<T extends { branchId?: number | null }>(
  entityGetter: (id: number, tenantId: number) => Promise<T | undefined>,
  entityIdParam: string = "id"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.scope !== "BRANCH") {
      return next();
    }
    const entityId = parseInt(req.params[entityIdParam] as string);
    const tenantId = req.auth.tenantId!;
    const entity = await entityGetter(entityId, tenantId);
    if (!entity) {
      return res.status(404).json({ error: "No encontrado" });
    }
    if (entity.branchId !== req.auth.branchId) {
      return res.status(403).json({ error: "No tenés acceso a este recurso" });
    }
    next();
  };
}

// Permission check (granular)
export function requirePermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.userId || !req.auth?.tenantId) {
        return res.status(403).json({ error: "Acceso denegado" });
      }
      if (req.auth.isSuperAdmin) return next();
      const hasPermission = await storage.userHasPermission(
        req.auth.userId,
        req.auth.tenantId,
        permissionKey
      );
      if (!hasPermission) {
        return res.status(403).json({
          error: "No tenés permisos para realizar esta acción",
          code: "PERMISSION_DENIED",
          permission: permissionKey,
        });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Error verificando permisos" });
    }
  };
}

export function requireTenantAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.isSuperAdmin) return next();
  if (req.auth?.role !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
}


export function requirePlanFeature(featureKey: string) {
  return requireFeature(featureKey);
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.role === role) return next();
    return res.status(403).json({ error: "Acceso denegado", code: "ROLE_FORBIDDEN" });
  };
}

export function requireRoleAny(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.role && roles.includes(req.auth.role)) return next();
    return res.status(403).json({ error: "Acceso denegado", code: "ROLE_FORBIDDEN" });
  };
}


export const requireSuperAdmin = superAuth;
