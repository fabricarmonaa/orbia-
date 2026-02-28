import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  requests: number[];
}

const rateLimitStore = new Map<string, RateLimitStore>();
const concurrencyTracker = new Map<number, boolean>();

const STT_RATE_LIMIT_PER_MIN = parseInt(process.env.STT_RATE_LIMIT_PER_MIN || '12', 10);
const STT_CONCURRENCY_PER_TENANT = parseInt(process.env.STT_CONCURRENCY_PER_TENANT || '1', 10);
export function sttRateLimiter(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.auth?.tenantId;
  const userId = req.auth?.userId;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'No autorizado', code: 'AUTH_REQUIRED' });
  }

  const key = `${tenantId}:${userId}:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;

  if (!rateLimitStore.has(key)) rateLimitStore.set(key, { requests: [] });

  const store = rateLimitStore.get(key)!;
  store.requests = store.requests.filter((timestamp) => now - timestamp < windowMs);

  if (store.requests.length >= STT_RATE_LIMIT_PER_MIN) {
    return res.status(429).json({
      error: `Límite de STT alcanzado. Máximo ${STT_RATE_LIMIT_PER_MIN} por minuto.`,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((store.requests[0] + windowMs - now) / 1000),
    });
  }

  store.requests.push(now);
  next();
}

export function sttConcurrencyGuard(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.auth?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: 'No autorizado', code: 'AUTH_REQUIRED' });
  }

  if (STT_CONCURRENCY_PER_TENANT === 0) return next();

  if (concurrencyTracker.get(tenantId)) {
    return res.status(429).json({
      error: 'Ya hay una transcripción en curso. Esperá a que termine.',
      code: 'CONCURRENCY_LIMIT',
    });
  }

  concurrencyTracker.set(tenantId, true);
  res.on('finish', () => concurrencyTracker.delete(tenantId));
  res.on('close', () => concurrencyTracker.delete(tenantId));
  next();
}

export function validateSttPayload(req: Request, res: Response, next: NextFunction) {
  const text = req.body?.text as string | undefined;
  const hasAudioFile = Boolean(req.file && req.file.size > 0);

  if (!hasAudioFile && !text) {
    return res.status(400).json({ error: 'Audio o texto requerido', code: 'STT_PAYLOAD_INVALID' });
  }

  if (text && (typeof text !== 'string' || text.trim().length > 500)) {
    return res.status(400).json({ error: 'Texto inválido', code: 'STT_TEXT_INVALID' });
  }

  next();
}
