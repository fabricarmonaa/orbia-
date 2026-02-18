import type { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  timestamps: number[];
}

const stores = new Map<string, RateLimitStore>();

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  errorMessage: string;
  code?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = options.keyGenerator(req);
    const now = Date.now();
    const windowMs = options.windowMs;

    if (!stores.has(key)) {
      stores.set(key, { timestamps: [] });
    }

    const store = stores.get(key)!;
    store.timestamps = store.timestamps.filter((ts) => now - ts < windowMs);

    if (store.timestamps.length >= options.max) {
      const retryAfter = Math.ceil((store.timestamps[0] + windowMs - now) / 1000);
      return res.status(429).json({
        error: options.errorMessage,
        code: options.code || "RATE_LIMIT_EXCEEDED",
        retryAfter,
      });
    }

    store.timestamps.push(now);
    return next();
  };
}
