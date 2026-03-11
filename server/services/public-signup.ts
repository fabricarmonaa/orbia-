import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { hashPassword } from "../auth";
import { orderTypeDefinitions, orderTypePresets, plans, statusDefinitions, tenantConfig, tenantSubscriptions, tenants, users } from "@shared/schema";

export type PublicSignupInput = {
  tenantName: string;
  adminName: string;
  industry?: string | null;
  dni?: string | null;
  email: string;
  phone?: string | null;
  password: string;
  appOrigin?: string | null;
};

function resolveAppOrigin(raw?: string | null) {
  const env = (raw || process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || "").trim();
  if (env) return env.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? "https://app.orbiapanel.com" : "http://localhost:5000";
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function buildUniqueTenantCode(baseName: string) {
  const base = slugify(baseName).replace(/-/g, "").slice(0, 12) || "negocio";
  for (let i = 0; i < 10; i++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${base}${suffix}`.toUpperCase();
    const [exists] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, code)).limit(1);
    if (!exists) return code;
  }
  return `${base.toUpperCase()}${Date.now().toString().slice(-4)}`;
}

export async function createPublicTrialSignup(input: PublicSignupInput) {
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, input.email.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (existingUser[0]) {
    const err = new Error("EMAIL_ALREADY_REGISTERED");
    (err as any).statusCode = 409;
    throw err;
  }

  const professionalPlan = await db
    .select()
    .from(plans)
    .where(and(eq(plans.isActive, true), or(eq(plans.planCode, "PROFESIONAL"), eq(plans.planCode, "PRO"))))
    .limit(1);

  const plan = professionalPlan[0];
  if (!plan) {
    const err = new Error("PLAN_NOT_AVAILABLE");
    (err as any).statusCode = 500;
    throw err;
  }

  const tenantCode = await buildUniqueTenantCode(input.tenantName);
  const slug = tenantCode.toLowerCase();
  const appOrigin = resolveAppOrigin(input.appOrigin);
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        code: tenantCode,
        slug,
        name: input.tenantName,
        planId: plan.id,
        subscriptionStartDate: now,
        subscriptionEndDate: trialEnd,
        isActive: true,
        isBlocked: false,
      })
      .returning({ id: tenants.id });

    await tx.insert(users).values({
      tenantId: tenant.id,
      branchId: null,
      email: input.email.trim().toLowerCase(),
      password: passwordHash,
      fullName: input.adminName,
      role: "admin",
      scope: "TENANT",
      isActive: true,
      isSuperAdmin: false,
    });

    await tx.insert(tenantSubscriptions).values({
      tenantId: tenant.id,
      planCode: plan.planCode,
      status: "TRIAL",
      startsAt: now,
      expiresAt: trialEnd,
      updatedAt: now,
    });

    await tx.insert(tenantConfig).values({
      tenantId: tenant.id,
      businessName: input.tenantName,
      businessType: input.industry || null,
      currency: "ARS",
      trackingExpirationHours: 24,
      language: "es",
      configJson: {
        onboarding: {
          dni: input.dni || null,
          phone: input.phone || null,
        },
      },
    });

    const defaultStatuses = [
      { entityType: "ORDER", code: "PENDING", label: "Pendiente", color: "#F59E0B", sortOrder: 0, isDefault: true, isFinal: false },
      { entityType: "ORDER", code: "IN_PROGRESS", label: "En proceso", color: "#3B82F6", sortOrder: 1, isDefault: false, isFinal: false },
      { entityType: "ORDER", code: "READY", label: "Listo", color: "#8B5CF6", sortOrder: 2, isDefault: false, isFinal: false },
      { entityType: "ORDER", code: "DELIVERED", label: "Entregado", color: "#10B981", sortOrder: 3, isDefault: false, isFinal: true },
      { entityType: "PRODUCT", code: "ACTIVE", label: "Activo", color: "#10B981", sortOrder: 0, isDefault: true, isFinal: false },
      { entityType: "DELIVERY", code: "PENDING", label: "Pendiente", color: "#F59E0B", sortOrder: 0, isDefault: true, isFinal: false },
    ] as const;

    await tx.insert(statusDefinitions).values(defaultStatuses.map((status) => ({
      tenantId: tenant.id,
      ...status,
      isActive: true,
      isLocked: false,
    })));

    const defaultOrderTypes = [
      { code: "PEDIDO", label: "Pedido" },
      { code: "ENCARGO", label: "Encargo" },
      { code: "TURNO", label: "Turno" },
      { code: "SERVICIO", label: "Servicio" },
    ];

    for (const ot of defaultOrderTypes) {
      const [typeRow] = await tx.insert(orderTypeDefinitions).values({
        tenantId: tenant.id,
        code: ot.code,
        label: ot.label,
        isActive: true,
      }).returning({ id: orderTypeDefinitions.id });

      await tx.insert(orderTypePresets).values({
        tenantId: tenant.id,
        orderTypeId: typeRow.id,
        code: "default",
        label: "Default",
        isActive: true,
        sortOrder: 0,
      });
    }
  });

  const loginUrl = `${appOrigin}/login?tenant=${encodeURIComponent(tenantCode)}`;

  return {
    tenantCode,
    tenantSlug: slug,
    appOrigin,
    loginUrl,
    email: input.email.trim().toLowerCase(),
    nextUrl: loginUrl,
  };
}
