import type { Request, Response, NextFunction } from "express";

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
].filter(Boolean) as string[];


export function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const isPublicTracking = req.path.startsWith("/api/public/tracking");
  const isPublicSignup = req.path === "/api/public/signup";

  if (origin) {
    const isAllowed = allowedOrigins.has(origin);
    const isAllowedPublicSignupOrigin = isPublicSignup && landingOrigins.includes(origin);
    if (isAllowed || isPublicTracking || isAllowedPublicSignupOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    } else if (req.path.startsWith("/api")) {
      return res.status(403).json({ error: "Origen no permitido" });
    }
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
}
