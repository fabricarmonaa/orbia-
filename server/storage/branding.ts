import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  tenantBranding,
  appBranding,
  tenantConfig,
  tenants,
  type InsertTenantBranding,
  type InsertAppBranding,
} from "@shared/schema";

const DEFAULT_COLORS = {
  primary: "#6366f1",
  secondary: "#8b5cf6",
  accent: "#10b981",
  background: "#ffffff",
  text: "#111827",
  trackingButton: "#6366f1",
  trackingHeader: "#111827",
  trackingBadge: "#10b981",
};

const DEFAULT_TEXTS = {
  trackingHeader: "Seguimiento de tu pedido",
  trackingFooter: "Gracias por tu compra",
};

const DEFAULT_LINKS = {
  instagram: "",
  whatsapp: "",
  web: "",
};

const DEFAULT_PDF = {
  headerText: "",
  footerText: "",
  showLogo: true,
};

function withCacheBusting(url: string | null, updatedAt?: Date | null) {
  if (!url) return null;
  const version = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

function mergeDefaults<T extends Record<string, unknown>>(defaults: T, value?: Record<string, unknown> | null) {
  return { ...defaults, ...(value || {}) } as T;
}

export const brandingStorage = {
  async getTenantBranding(tenantId: number) {
    const [branding] = await db
      .select()
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, tenantId));

    const [config] = await db
      .select()
      .from(tenantConfig)
      .where(eq(tenantConfig.tenantId, tenantId));

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    const displayName = branding?.displayName || config?.businessName || tenant?.name || "";
    const logoUrl = branding?.logoUrl || config?.logoUrl || null;
    const colors = mergeDefaults(DEFAULT_COLORS, branding?.colorsJson as Record<string, unknown>);
    const texts = mergeDefaults(DEFAULT_TEXTS, branding?.textsJson as Record<string, unknown>);
    const links = mergeDefaults(DEFAULT_LINKS, branding?.linksJson as Record<string, unknown>);
    const pdf = mergeDefaults(DEFAULT_PDF, branding?.pdfConfigJson as Record<string, unknown>);
    const updatedAt = branding?.updatedAt || new Date();

    return {
      id: branding?.id || null,
      tenantId,
      logoUrl: withCacheBusting(logoUrl, updatedAt),
      displayName,
      colors,
      texts,
      links,
      pdfConfig: pdf,
      updatedAt,
    };
  },

  async upsertTenantBranding(tenantId: number, payload: Partial<InsertTenantBranding>) {
    const [existing] = await db
      .select()
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, tenantId));

    if (existing) {
      const [updated] = await db
        .update(tenantBranding)
        .set({
          logoUrl: payload.logoUrl !== undefined ? payload.logoUrl : existing.logoUrl,
          displayName: payload.displayName !== undefined ? payload.displayName : existing.displayName,
          colorsJson: {
            ...(existing.colorsJson as Record<string, unknown>),
            ...(payload.colorsJson as Record<string, unknown>),
          },
          textsJson: {
            ...(existing.textsJson as Record<string, unknown>),
            ...(payload.textsJson as Record<string, unknown>),
          },
          linksJson: {
            ...(existing.linksJson as Record<string, unknown>),
            ...(payload.linksJson as Record<string, unknown>),
          },
          pdfConfigJson: {
            ...(existing.pdfConfigJson as Record<string, unknown>),
            ...(payload.pdfConfigJson as Record<string, unknown>),
          },
          updatedAt: new Date(),
        })
        .where(eq(tenantBranding.tenantId, tenantId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(tenantBranding)
      .values({
        tenantId,
        logoUrl: payload.logoUrl || null,
        displayName: payload.displayName || null,
        colorsJson: mergeDefaults(DEFAULT_COLORS, payload.colorsJson as Record<string, unknown>),
        textsJson: mergeDefaults(DEFAULT_TEXTS, payload.textsJson as Record<string, unknown>),
        linksJson: mergeDefaults(DEFAULT_LINKS, payload.linksJson as Record<string, unknown>),
        pdfConfigJson: mergeDefaults(DEFAULT_PDF, payload.pdfConfigJson as Record<string, unknown>),
      })
      .returning();
    return created;
  },

  async getAppBranding() {
    const [branding] = await db.select().from(appBranding);
    if (!branding) {
      return {
        id: null,
        orbiaLogoUrl: null,
        orbiaName: "Orbia",
        updatedAt: new Date(),
      };
    }
    return {
      ...branding,
      orbiaName: branding.orbiaName || "Orbia",
      orbiaLogoUrl: withCacheBusting(branding.orbiaLogoUrl, branding.updatedAt),
    };
  },

  async updateAppBranding(payload: Partial<InsertAppBranding>) {
    const [existing] = await db.select().from(appBranding);
    if (existing) {
      const [updated] = await db
        .update(appBranding)
        .set({
          orbiaLogoUrl: payload.orbiaLogoUrl !== undefined ? payload.orbiaLogoUrl : existing.orbiaLogoUrl,
          orbiaName: payload.orbiaName ?? existing.orbiaName,
          updatedAt: new Date(),
        })
        .where(eq(appBranding.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(appBranding)
      .values({
        orbiaLogoUrl: payload.orbiaLogoUrl || null,
        orbiaName: payload.orbiaName || "Orbia",
        updatedAt: new Date(),
      })
      .returning();
    return created;
  },
};
