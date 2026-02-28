import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { securityHeaders } from "./middleware/security-headers";
import { corsGuard } from "./middleware/cors";
import { HttpError } from "./lib/http-errors";
import { requestContext } from "./middleware/request-context";

const app = express();
const httpServer = createServer(app);

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "10mb";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "30000");

app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(corsGuard);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
    requestId?: string;
  }
}

app.use(
  express.json({
    limit: REQUEST_BODY_LIMIT,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
app.use(requestContext);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [${req.requestId || "n/a"}]`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const seedEnabled = String(process.env.SEED ?? "").trim().toLowerCase() === "true";
  log(`[BOOT] SEED env="${process.env.SEED}" → seedEnabled=${seedEnabled}`);
  if (seedEnabled) {
    const { seedDatabase, seedDeliveryData } = await import("./seed");
    await seedDatabase();
    await seedDeliveryData();
  } else {
    log("[BOOT] Seeding disabled");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const isHttpError = err instanceof HttpError;
    const status = isHttpError ? err.status : (err.status || err.statusCode || 500);
    const code = isHttpError
      ? err.code
      : (err.code || (status === 401 ? "AUTH_REQUIRED" : status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"));
    const message = status >= 500 ? "Error interno del servidor" : err.message || "Solicitud inválida";

    if (status >= 500) {
      console.error("[global-error-handler] Unhandled error:", {
        requestId: req.requestId,
        route: req.path,
        status,
        code,
        message: err?.message,
        stack: err?.stack,
      });
    }

    if (res.headersSent) {
      return next(err);
    }

    const payload: Record<string, unknown> = { error: message, code, requestId: req.requestId || null };
    if (isHttpError && err.extra) {
      Object.assign(payload, err.extra);
    }
    return res.status(status).json(payload);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Tracking purge job: revoke expired tracking links every 5 minutes
  const { storage } = await import("./storage");
  const purgeInterval = setInterval(async () => {
    try {
      const purged = await storage.purgeExpiredTracking();
      if (purged > 0) {
        log(`Purged ${purged} expired tracking link(s)`, "purge");
      }
    } catch (err) {
      console.error("Tracking purge error:", err);
    }
  }, 5 * 60 * 1000);

  // Railway compatibility: use PORT env var, bind to 0.0.0.0
  process.on("unhandledRejection", (reason) => {
    console.error("[UNHANDLED_REJECTION]", reason);
  });

  process.on("SIGTERM", () => {
    clearInterval(purgeInterval);
    httpServer.close(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    clearInterval(purgeInterval);
    httpServer.close(() => process.exit(0));
  });

  const PORT = parseInt(process.env.PORT || "5000");
  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = REQUEST_TIMEOUT_MS + 5000;

  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`Server running on port ${PORT}`);
  });
})();
