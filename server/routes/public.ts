import type { Express } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { createPublicTrialSignup } from "../services/public-signup";
import { strictSignupLimiter } from "../middleware/http-rate-limit";
import { storage } from "../storage";
import { getPlanDisplayName } from "@shared/plan-display";

const ORBIA_LEGAL_SLUG_KEY = "orbia_legal_slug";
const ORBIA_LEGAL_TERMS_KEY = "orbia_legal_terms";
const ORBIA_LEGAL_PRIVACY_KEY = "orbia_legal_privacy";
const ORBIA_DEFAULT_SLUG = "orbia";

async function getOrbiaLegalConfig() {
  const [slugRow, termsRow, privacyRow, appBranding] = await Promise.all([
    storage.getSystemSetting(ORBIA_LEGAL_SLUG_KEY),
    storage.getSystemSetting(ORBIA_LEGAL_TERMS_KEY),
    storage.getSystemSetting(ORBIA_LEGAL_PRIVACY_KEY),
    storage.getAppBranding(),
  ]);

  const slug = (slugRow?.value || ORBIA_DEFAULT_SLUG).trim().toLowerCase();
  const termsText = (termsRow?.value || "").trim();
  const privacyText = (privacyRow?.value || "").trim();
  const updatedAt = [slugRow?.updatedAt, termsRow?.updatedAt, privacyRow?.updatedAt]
    .filter(Boolean)
    .map((d) => new Date(d as any).getTime())
    .sort((a, b) => b - a)[0] || null;

  return {
    slug,
    termsText,
    privacyText,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    logoUrl: appBranding?.orbiaLogoUrl || null,
  };
}

function legalHtmlPage(title: string, logoUrl: string | null, bodyText: string, updatedAt: string | null) {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeText = bodyText.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleString("es-AR") : "Sin fecha";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${safeTitle} - ORBIA</title>
<style>body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;color:#111;margin:0;padding:24px}.card{max-width:920px;margin:0 auto;background:#fff;border:1px solid #e7e9f0;border-radius:14px;padding:24px}.meta{color:#667085;font-size:12px}.logo{max-height:56px;max-width:220px;margin-bottom:16px}</style></head>
<body><div class="card">${logoUrl ? `<img class="logo" src="${logoUrl}" alt="ORBIA"/>` : ""}<h1>${safeTitle}</h1><p class="meta">Última actualización: ${updatedLabel}</p><hr/>${safeText || "<p>No hay contenido configurado.</p>"}</div></body></html>`;
}

const signupSchema = z.object({
  companyName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  dni: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  password: z.string().min(6).max(120),
  industry: z.string().max(120).optional(),
});

const onboardSchema = z.object({
  companyName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  password: z.string().min(6).max(120),
  industry: z.string().min(2).max(120),
});

export function registerPublicRoutes(app: Express) {
  app.get("/legal/terms", async (_req, res) => {
    const legal = await getOrbiaLegalConfig();
    if (legal.termsText) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(legalHtmlPage("Términos y Condiciones", legal.logoUrl, legal.termsText, legal.updatedAt));
    }
    const filePath = path.join(process.cwd(), "uploads", "Terminos-y condiciones-ORBIA.pdf");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no encontrado", code: "FILE_NOT_FOUND" });
    }
    res.setHeader("Content-Type", "application/pdf");
    return res.sendFile(filePath);
  });

  app.get("/legal/privacy", async (_req, res) => {
    const legal = await getOrbiaLegalConfig();
    if (legal.privacyText) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(legalHtmlPage("Política de Privacidad", legal.logoUrl, legal.privacyText, legal.updatedAt));
    }
    const filePath = path.join(process.cwd(), "uploads", "Politica-de-privacidad-ORBIA.pdf");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no encontrado", code: "FILE_NOT_FOUND" });
    }
    res.setHeader("Content-Type", "application/pdf");
    return res.sendFile(filePath);
  });

  app.get("/api/public/plans", async (_req, res) => {
    try {
      const plans = await storage.getPlans();
      const data = plans.map((plan) => ({
        code: plan.planCode,
        displayName: getPlanDisplayName(plan.planCode, plan.name),
        price: plan.priceMonthly,
        currency: plan.currency || "ARS",
        description: plan.description || null,
      }));
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudo obtener planes", code: "PUBLIC_PLANS_ERROR" });
    }
  });

  app.get("/api/public/legal/:slug", async (req, res) => {
    try {
      const legal = await getOrbiaLegalConfig();
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug || slug !== legal.slug) {
        return res.status(404).json({ error: "Legal no encontrado", code: "LEGAL_NOT_FOUND" });
      }
      return res.json({
        data: {
          slug: legal.slug,
          logoUrl: legal.logoUrl,
          termsText: legal.termsText,
          privacyText: legal.privacyText,
          updatedAt: legal.updatedAt,
          termsUrl: `/legal/${legal.slug}/terms`,
          privacyUrl: `/legal/${legal.slug}/privacy`,
        },
      });
    } catch {
      return res.status(500).json({ error: "No se pudo obtener legales", code: "LEGAL_READ_ERROR" });
    }
  });

  app.get("/legal/:slug/terms", async (req, res) => {
    const legal = await getOrbiaLegalConfig();
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug || slug !== legal.slug) return res.status(404).json({ error: "Legal no encontrado", code: "LEGAL_NOT_FOUND" });
    if (legal.termsText) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(legalHtmlPage("Términos y Condiciones", legal.logoUrl, legal.termsText, legal.updatedAt));
    }
    return res.redirect(302, "/legal/terms");
  });

  app.get("/legal/:slug/privacy", async (req, res) => {
    const legal = await getOrbiaLegalConfig();
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug || slug !== legal.slug) return res.status(404).json({ error: "Legal no encontrado", code: "LEGAL_NOT_FOUND" });
    if (legal.privacyText) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(legalHtmlPage("Política de Privacidad", legal.logoUrl, legal.privacyText, legal.updatedAt));
    }
    return res.redirect(302, "/legal/privacy");
  });

  app.post("/api/public/onboard", strictSignupLimiter, async (req, res) => {
    try {
      const payload = onboardSchema.parse(req.body || {});
      const created = await createPublicTrialSignup({
        tenantName: payload.companyName.trim(),
        adminName: payload.ownerName.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        industry: payload.industry.trim(),
      });

      return res.status(201).json({
        ok: true,
        tenantCode: created.tenantCode,
        tenantSlug: created.tenantSlug,
        appOrigin: created.appOrigin,
        loginUrl: created.loginUrl,
        next: { loginUrl: created.loginUrl },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ONBOARD_INVALID", details: err.issues });
      }
      if (err?.message === "EMAIL_ALREADY_REGISTERED") {
        return res.status(409).json({ error: "El email ya está registrado", code: "EMAIL_ALREADY_REGISTERED" });
      }
      return res.status(Number(err?.statusCode || 500)).json({ error: "No se pudo completar el onboarding", code: "ONBOARD_ERROR" });
    }
  });

  app.post("/api/public/signup", strictSignupLimiter, async (req, res) => {
    try {
      const payload = signupSchema.parse(req.body || {});
      const created = await createPublicTrialSignup({
        tenantName: payload.companyName.trim(),
        adminName: payload.ownerName.trim(),
        email: payload.email.trim().toLowerCase(),
        dni: payload.dni?.trim() || null,
        phone: payload.phone?.trim() || null,
        password: payload.password,
      });

      return res.status(201).json({ ok: true, ...created });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "SIGNUP_INVALID", details: err.issues });
      }
      if (err?.message === "EMAIL_ALREADY_REGISTERED") {
        return res.status(409).json({ error: "El email ya está registrado", code: "EMAIL_ALREADY_REGISTERED" });
      }
      return res.status(Number(err?.statusCode || 500)).json({ error: "No se pudo crear la cuenta", code: "SIGNUP_ERROR" });
    }
  });
}
