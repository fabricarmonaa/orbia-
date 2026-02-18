import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { tenantAuth, requireTenantAdmin, superAuth, getTenantPlan } from "../auth";

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
  displayName: z.string().trim().max(60).nullable().optional(),
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
      trackingHeader: z.string().trim().max(120).optional(),
      trackingFooter: z.string().trim().max(120).optional(),
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
      headerText: z.string().trim().max(120).optional(),
      footerText: z.string().trim().max(120).optional(),
      showLogo: z.boolean().optional(),
    })
    .optional(),
});

const appBrandingSchema = z.object({
  orbiaLogoUrl: z.string().trim().max(255).nullable().optional(),
  orbiaName: z.string().trim().max(120).optional(),
});

export function registerBrandingRoutes(app: Express) {
  app.get("/api/branding/tenant", tenantAuth, async (req, res) => {
    try {
      const data = await storage.getTenantBranding(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/branding/tenant", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const payload = tenantBrandingSchema.parse(req.body);
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

  app.get("/api/branding/app", async (_req, res) => {
    try {
      const data = await storage.getAppBranding();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/branding/app", superAuth, async (req, res) => {
    try {
      const payload = appBrandingSchema.parse(req.body);
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
