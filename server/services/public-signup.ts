import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { hashPassword } from "../auth";
import { branches, plans, tenantAddons, tenantSubscriptions, tenants, users } from "@shared/schema";

export type PublicSignupInput = {
  companyName: string;
  ownerName: string;
  email: string;
  phone?: string | null;
  password: string;
  industry?: string | null;
};

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

  const tenantCode = await buildUniqueTenantCode(input.companyName);
  const slug = tenantCode.toLowerCase();
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        code: tenantCode,
        slug,
        name: input.companyName,
        planId: plan.id,
        subscriptionStartDate: now,
        subscriptionEndDate: trialEnd,
        isActive: true,
        isBlocked: false,
      })
      .returning({ id: tenants.id });

    const [branch] = await tx
      .insert(branches)
      .values({
        tenantId: tenant.id,
        name: "Sucursal Principal",
        phone: input.phone || null,
      })
      .returning({ id: branches.id });

    await tx.insert(users).values({
      tenantId: tenant.id,
      branchId: branch.id,
      email: input.email.trim().toLowerCase(),
      password: passwordHash,
      fullName: input.ownerName,
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

    await tx
      .insert(tenantAddons)
      .values({
        tenantId: tenant.id,
        addonKey: "messaging_whatsapp",
        enabled: true,
        enabledAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [tenantAddons.tenantId, tenantAddons.addonKey],
        set: {
          enabled: true,
          enabledAt: now,
          updatedAt: now,
        },
      });
  });

  return {
    tenantCode,
    email: input.email.trim().toLowerCase(),
    nextUrl: `https://app.orbiapanel.com/login?tenantCode=${encodeURIComponent(tenantCode)}`,
  };
}
