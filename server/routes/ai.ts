import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import os from "os";
import path from "path";
import crypto from "crypto";
import { openAsBlob } from "node:fs";
import { promises as fs } from "node:fs";
import { tenantAuth, requireFeature, requirePlanCodes } from "../auth";
import { aiGetJson, aiPostForm, getAiServiceUrl, AiClientError } from "../services/ai-client";

const STT_MAX_FILE_MB = Number(process.env.STT_MAX_FILE_MB || "10");
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, process.env.STT_UPLOAD_TMP_DIR || os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `ai-proxy-${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname || "") || ".bin"}`),
  }),
  limits: { fileSize: Math.max(1, STT_MAX_FILE_MB) * 1024 * 1024 },
});

function uploadAudio(req: Request, res: Response, next: NextFunction) {
  upload.single("audio")(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok: false, code: "AI_BAD_RESPONSE", message: "Audio demasiado largo" });
    return res.status(400).json({ ok: false, code: "AI_BAD_RESPONSE", message: "Error procesando archivo" });
  });
}

function aiErrorPayload(err: unknown) {
  if (err instanceof AiClientError) return { ok: false, code: err.code, message: err.message, details: err.details };
  return { ok: false, code: "AI_UNAVAILABLE", message: "AI service unavailable" };
}

export function registerAiRoutes(app: Express) {
  app.get("/api/ai/health", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), async (req, res) => {
    try {
      const health = await aiGetJson("/health", { "x-request-id": String(req.requestId || "") });
      return res.json({ ok: true, upstream: getAiServiceUrl(), health });
    } catch (err) {
      const payload = aiErrorPayload(err);
      return res.status(payload.code === "AI_TIMEOUT" ? 504 : 502).json(payload);
    }
  });

  app.post("/api/ai/stt", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), uploadAudio, async (req, res) => {
    try {
      const form = new FormData();
      if (req.file?.path) {
        const blob = await openAsBlob(req.file.path, { type: req.file.mimetype || "application/octet-stream" });
        form.append("audio", blob, req.file.originalname || path.basename(req.file.path));
      }
      if (typeof req.body?.text === "string") form.append("text", req.body.text);
      if (typeof req.body?.history === "string") form.append("history", req.body.history);
      const body = await aiPostForm("/stt", form, { "x-request-id": String(req.requestId || "") });
      return res.json({ ok: true, data: body });
    } catch (err) {
      const payload = aiErrorPayload(err);
      return res.status(payload.code === "AI_TIMEOUT" ? 504 : 502).json(payload);
    } finally {
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => undefined);
    }
  });
}
