import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  requests: number[];
}

const rateLimitStore = new Map<string, RateLimitStore>();
const concurrencyTracker = new Map<number, boolean>();

const STT_RATE_LIMIT_PER_MIN = parseInt(process.env.STT_RATE_LIMIT_PER_MIN || '12', 10);
const STT_CONCURRENCY_PER_TENANT = parseInt(process.env.STT_CONCURRENCY_PER_TENANT || '1', 10);
const STT_MAX_BASE64_BYTES = parseInt(process.env.STT_MAX_BASE64_BYTES || '1200000', 10);
const STT_MAX_AUDIO_SECONDS = parseInt(process.env.STT_MAX_AUDIO_SECONDS || '15', 10);

export function estimateAudioDurationSec(base64Audio?: string) {
  if (!base64Audio) return 0;
  const bytes = Math.floor((base64Audio.length * 3) / 4);
  const assumedVoiceBytesPerSecond = 3000;
  return Math.round(bytes / assumedVoiceBytesPerSecond);
}

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
  const { audio, text } = req.body as { audio?: string; text?: string };

  if (!audio && !text) {
    return res.status(400).json({ error: 'Audio o texto requerido', code: 'STT_PAYLOAD_INVALID' });
  }

  if (audio) {
    if (typeof audio !== 'string') {
      return res.status(400).json({ error: 'Audio inválido', code: 'STT_PAYLOAD_INVALID' });
    }
    if (audio.length > STT_MAX_BASE64_BYTES) {
      return res.status(413).json({
        error: `Audio demasiado largo. Máximo ${(STT_MAX_BASE64_BYTES / 1024 / 1024).toFixed(1)}MB.`,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    const estimatedDurationSec = estimateAudioDurationSec(audio);
    if (estimatedDurationSec > STT_MAX_AUDIO_SECONDS) {
      return res.status(413).json({
        error: `Audio demasiado largo. Máximo ${STT_MAX_AUDIO_SECONDS}s por comando.`,
        code: 'AUDIO_TOO_LONG',
      });
    }
  }

  if (text && (typeof text !== 'string' || text.trim().length > 500)) {
    return res.status(400).json({ error: 'Texto inválido', code: 'STT_TEXT_INVALID' });
  }

  next();
}
