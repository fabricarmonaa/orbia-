import type { Express } from "express";
import { z } from "zod";
import { createPublicTrialSignup } from "../services/public-signup";
import { strictSignupLimiter } from "../middleware/http-rate-limit";

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
