import type { Express } from "express";
import multer from "multer";
import { tenantAuth, requireFeature, requirePlanCodes } from "../auth";
import { aiGetJson, aiPostForm, AiClientError, getAiServiceUrl } from "../services/ai-client";

const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

function aiErrorPayload(err: unknown) {
  if (err instanceof AiClientError) {
    return { ok: false, code: err.code, message: err.message, details: err.details };
  }
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

  app.post("/api/ai/stt", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), upload.single("audio"), async (req, res) => {
    try {
      const form = new FormData();
      if (req.file) {
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
        form.append("audio", blob, req.file.originalname || "voice.webm");
      }
      if (typeof req.body?.text === "string") form.append("text", req.body.text);
      if (typeof req.body?.history === "string") form.append("history", req.body.history);

      const body = await aiPostForm("/stt", form, { "x-request-id": String(req.requestId || "") });
      return res.json({ ok: true, data: body });
    } catch (err) {
      const payload = aiErrorPayload(err);
      return res.status(payload.code === "AI_TIMEOUT" ? 504 : 502).json(payload);
    }
  });
}
