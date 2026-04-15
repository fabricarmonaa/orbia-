import type { Request, Response, NextFunction } from "express";
import cors from "cors";

const explicitOrigins = [
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
  process.env.CORS_ORIGINS,
]
  .filter(Boolean)
  .flatMap((value) => value!.split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = new Set(explicitOrigins);
const landingOrigins = [
  process.env.LANDING_URL,
  process.env.PUBLIC_WEB_URL,
  "https://orbiapanel.com",
  "https://www.orbiapanel.com",
  "http://localhost:5001",
  "http://127.0.0.1:5001",
].filter(Boolean) as string[];

export function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const isPublicTracking = req.path.startsWith("/api/public/tracking") || req.path.startsWith("/api/public/track");
  const isPublicSignup = req.path === "/api/public/signup" || req.path === "/api/public/onboard";
  const isPublicPlans = req.path === "/api/public/plans";
  
  if (origin) {
    const isAllowed = allowedOrigins.has(origin);
    const isAllowedLandingPublicOrigin = (isPublicSignup || isPublicPlans) && landingOrigins.includes(origin);
    const isGoogleStartFromLanding = req.path === "/api/auth/google/start" && landingOrigins.includes(origin);

    if (isAllowed || isPublicTracking || isAllowedLandingPublicOrigin || isGoogleStartFromLanding || req.path.startsWith("/webhook/")) {
      return cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
      })(req, res, next);
    }

    if (req.path.startsWith("/api")) {
      return res.status(403).json({ error: "Origen no permitido" });
    }
  }

  if (req.method === "OPTIONS") {
    return cors({ origin: true, credentials: true })(req, res, next);
  }

  return cors({ origin: false })(req, res, next);
}
