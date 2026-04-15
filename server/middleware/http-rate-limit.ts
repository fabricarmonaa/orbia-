import rateLimit from "express-rate-limit";

const ONE_MINUTE = 60 * 1000;

function jsonRateLimit(message: string, code: string) {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: any, res: any) => {
      res.status(429).json({ error: message, code });
    },
  };
}

export const globalApiLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  max: Number(process.env.API_RATE_LIMIT_PER_MIN || 300),
  skip: (req) => !req.path.startsWith("/api/"),
  ...jsonRateLimit("Demasiadas solicitudes. Intentá nuevamente en unos segundos.", "RATE_LIMIT_GLOBAL"),
});

export const strictLoginLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  max: Number(process.env.AUTH_LOGIN_LIMIT_PER_MIN || 5),
  ...jsonRateLimit("Demasiados intentos de login. Intentá en 1 minuto.", "RATE_LIMIT_LOGIN"),
});

export const strictSignupLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  max: Number(process.env.SIGNUP_LIMIT_PER_MIN || 3),
  ...jsonRateLimit("Demasiados intentos de registro. Esperá 1 minuto.", "RATE_LIMIT_SIGNUP"),
});

export const strictSttLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  max: Number(process.env.STT_RATE_LIMIT_PER_MIN || process.env.AI_MAX_CONCURRENT_JOBS || 6),
  ...jsonRateLimit("Límite de STT alcanzado. Esperá y reintentá.", "RATE_LIMIT_STT"),
});

// 60 req/min por IP para tracking público.
// Esto permite a un usuario legítimo consultar su pedido muchas veces sin ser bloqueado,
// pero previene scraping masivo y DoS.
export const publicTrackingLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  max: Number(process.env.PUBLIC_TRACKING_RATE_LIMIT_PER_MIN || 60),
  keyGenerator: (req: any) => {
    const trustProxy = process.env.TRUST_PROXY === "true";
    if (trustProxy) {
      const forwarded = req.headers?.["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.length > 0) {
        return `tracking:${forwarded.split(",")[0].trim()}`;
      }
    }
    return `tracking:${req.ip || "unknown"}`;
  },
  ...jsonRateLimit(
    "Demasiadas solicitudes de seguimiento. Intentá nuevamente en un minuto.",
    "RATE_LIMIT_TRACKING"
  ),
});
