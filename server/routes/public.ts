import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createPublicTrialSignup } from "../services/public-signup";

const signupSchema = z.object({
  companyName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  dni: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  password: z.string().min(6).max(120),
  industry: z.string().max(120).optional(),
});

type Bucket = { hits: number[] };
const ipBuckets = new Map<string, Bucket>();

function publicSignupRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = ipBuckets.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((ts) => now - ts < 60_000);
  if (bucket.hits.length >= 5) {
    return res.status(429).json({ error: "Demasiados intentos. Probá en 1 minuto.", code: "RATE_LIMIT" });
  }
  bucket.hits.push(now);
  ipBuckets.set(key, bucket);
  next();
}

export function registerPublicRoutes(app: Express) {
  app.post("/api/public/signup", publicSignupRateLimit, async (req, res) => {
    try {
      const payload = signupSchema.parse(req.body || {});
      const created = await createPublicTrialSignup({
        companyName: payload.companyName.trim(),
        ownerName: payload.ownerName.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone?.trim() || null,
        password: payload.password,
        industry: payload.industry?.trim() || null,
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
