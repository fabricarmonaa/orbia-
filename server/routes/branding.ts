import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { tenantAuth, requireTenantAdmin, requireRoleAny, superAuth, getTenantPlan } from "../auth";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateParams } from "../middleware/validate";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { tenants } from "@shared/schema";
import { isValidTenantSlug, normalizeTenantSlug, sanitizeTosContent } from "../services/tos";

const colorValue = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .refine(
    (value) =>
      /^#([0-9a-fA-F]{6})$/.test(value) ||
      /^rgba?\(.+\)$/.test(value) ||
      /^hsla?\(.+\)$/.test(value) ||
      /^var\(--[a-zA-Z0-9-]+\)$/.test(value) ||
      /^[a-zA-Z]+$/.test(value),
    { message: "Color inválido" }
  );

const linkValue = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) => value === "" || /^https?:\/\//.test(value) || /^www\./.test(value),
    { message: "Link inválido" }
  );

const whatsappValue = z
  .string()
  .trim()
  .max(50)
  .refine(
    (value) =>
      value === "" ||
      /^(\+?\d{6,15})$/.test(value) ||
      /^https?:\/\/wa\.me\//.test(value),
    { message: "Whatsapp inválido" }
  );

const tenantBrandingSchema = z.object({
  logoUrl: z.string().trim().max(255).nullable().optional(),
  displayName: z.string().transform((value) => sanitizeShortText(value, 60)).nullable().optional(),
  colors: z
    .object({
      primary: colorValue.optional(),
      secondary: colorValue.optional(),
      accent: colorValue.optional(),
      background: colorValue.optional(),
      text: colorValue.optional(),
      trackingButton: colorValue.optional(),
      trackingHeader: colorValue.optional(),
      trackingBadge: colorValue.optional(),
    })
    .optional(),
  texts: z
    .object({
      trackingHeader: z.string().transform((value) => sanitizeShortText(value, 120)).optional(),
      trackingFooter: z.string().transform((value) => sanitizeShortText(value, 120)).optional(),
    })
    .optional(),
  links: z
    .object({
      instagram: linkValue.optional(),
      whatsapp: whatsappValue.optional(),
      web: linkValue.optional(),
    })
    .optional(),
  pdfConfig: z
    .object({
      headerText: z.string().transform((value) => sanitizeShortText(value, 120)).optional(),
      footerText: z.string().transform((value) => sanitizeLongText(value, 120)).optional(),
      showLogo: z.boolean().optional(),
    })
    .optional(),
});

const appBrandingSchema = z.object({
  orbiaLogoUrl: z.string().trim().max(255).nullable().optional(),
  orbiaName: z.string().transform((value) => sanitizeShortText(value, 120)).optional(),
});

const publicSlugSchema = z.object({
  slug: z.string().min(1).max(120).transform((value) => normalizeTenantSlug(value)),
});

const tosSchema = z.object({
  tosContent: z.string().max(20000).transform((value) => sanitizeTosContent(value, 20000)),
});

const slugSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(120).refine((value) => isValidTenantSlug(value), {
    message: "Slug inválido",
  }),
});

export function registerBrandingRoutes(app: Express) {
  app.get("/api/public/tenant/:slug/tos", validateParams(publicSlugSchema), async (req, res) => {
    try {
      const slug = req.params.slug as unknown as string;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!tenant || !tenant.tosContent) {
        return res.status(404).json({ error: "Términos no configurados", code: "TOS_NOT_FOUND" });
      }
      const branding = await storage.getTenantBranding(tenant.id);
      return res.json({
        companyName: branding.displayName || tenant.name,
        logoUrl: branding.logoUrl,
        slogan: String(branding.texts?.trackingFooter || ""),
        tosContent: tenant.tosContent,
        updatedAt: tenant.tosUpdatedAt,
      });
    } catch {
      return res.status(500).json({ error: "No se pudo obtener términos", code: "PUBLIC_TOS_ERROR" });
    }
  });
  app.get("/api/branding/tenant", tenantAuth, requireRoleAny(["admin", "staff"]), async (req, res) => {
    try {
      const data = await storage.getTenantBranding(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/branding/tenant", tenantAuth, requireRoleAny(["admin", "staff"]), requireTenantAdmin, validateBody(tenantBrandingSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof tenantBrandingSchema>;
      const plan = await getTenantPlan(req.auth!.tenantId!);
      const isEconomic = (plan?.planCode || "").toUpperCase() === "ECONOMICO";
      await storage.upsertTenantBranding(req.auth!.tenantId!, {
        logoUrl: payload.logoUrl,
        displayName: payload.displayName,
        colorsJson: payload.colors ?? undefined,
        textsJson: payload.texts ?? undefined,
        linksJson: isEconomic ? { instagram: "", whatsapp: "", web: "" } : (payload.links ?? undefined),
        pdfConfigJson: payload.pdfConfig ?? undefined,
      });
      const data = await storage.getTenantBranding(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });


  app.get("/api/branding/tos", tenantAuth, requireRoleAny(["admin", "staff"]), requireTenantAdmin, async (req, res) => {
    try {
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      if (!tenant) return res.status(404).json({ error: "Tenant no encontrado", code: "TENANT_NOT_FOUND" });
      res.json({
        data: {
          slug: tenant.slug,
          tosContent: tenant.tosContent || "",
          tosUpdatedAt: tenant.tosUpdatedAt,
          publicUrl: `${req.protocol}://${req.get("host")}/t/${tenant.slug}/tos`,
        },
      });
    } catch {
      res.status(500).json({ error: "No se pudo obtener configuración de términos", code: "TOS_SETTINGS_ERROR" });
    }
  });

  app.patch("/api/branding/tos", tenantAuth, requireRoleAny(["admin", "staff"]), requireTenantAdmin, validateBody(tosSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof tosSchema>;
      await db.update(tenants).set({ tosContent: payload.tosContent, tosUpdatedAt: new Date() }).where(eq(tenants.id, req.auth!.tenantId!));
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      res.json({ data: { tosContent: tenant?.tosContent || "", tosUpdatedAt: tenant?.tosUpdatedAt || null } });
    } catch {
      res.status(500).json({ error: "No se pudo actualizar términos", code: "TOS_UPDATE_ERROR" });
    }
  });

  app.patch("/api/branding/slug", tenantAuth, requireRoleAny(["admin", "staff"]), requireTenantAdmin, validateBody(slugSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof slugSchema>;
      if (!isValidTenantSlug(payload.slug)) {
        return res.status(400).json({ error: "Slug inválido", code: "SLUG_INVALID" });
      }
      const [existing] = await db.select().from(tenants).where(eq(tenants.slug, payload.slug)).limit(1);
      if (existing && existing.id !== req.auth!.tenantId) {
        return res.status(409).json({ error: "Slug ya en uso", code: "SLUG_ALREADY_EXISTS" });
      }
      await db.update(tenants).set({ slug: payload.slug }).where(eq(tenants.id, req.auth!.tenantId!));
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      res.json({ data: { slug: tenant?.slug } });
    } catch {
      res.status(500).json({ error: "No se pudo actualizar slug", code: "SLUG_UPDATE_ERROR" });
    }
  });

  app.get("/api/branding/app", async (_req, res) => {
    try {
      const data = await storage.getAppBranding();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/branding/app", superAuth, validateBody(appBrandingSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof appBrandingSchema>;
      await storage.updateAppBranding({
        orbiaLogoUrl: payload.orbiaLogoUrl,
        orbiaName: payload.orbiaName ?? undefined,
      });
      const data = await storage.getAppBranding();
      res.json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });
}
