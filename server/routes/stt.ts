import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, requireFeature, enforceBranchScope, requirePlanCodes } from "../auth";
import { sttRateLimiter, sttConcurrencyGuard, validateSttPayload, estimateAudioDurationSec } from "../middleware/stt-guards";

const STT_TIMEOUT_MS = parseInt(process.env.STT_TIMEOUT_MS || "30000", 10);
const STT_RETRY_ON_FAILURE = process.env.STT_RETRY_ON_FAILURE === "true";
const STT_DEBUG = process.env.STT_DEBUG === "true";

function sttLog(message: string, data?: Record<string, unknown>) {
  if (!STT_DEBUG) return;
  console.log(`[stt] ${message}`, data || {});
}

function mapSttError(status: number, body?: any) {
  if (status === 413 || body?.code === "PAYLOAD_TOO_LARGE") {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", error: "Audio demasiado largo. Probá un dictado más corto." };
  }
  if (status === 429 || body?.code === "RATE_LIMIT_EXCEEDED" || body?.code === "CONCURRENCY_LIMIT") {
    return { status: 429, code: body?.code || "RATE_LIMIT_EXCEEDED", error: "Ya hay una transcripción en curso o alcanzaste el límite. Intentá nuevamente en unos segundos." };
  }
  if (status === 503 || body?.code === "AI_SERVICE_UNAVAILABLE") {
    return { status: 503, code: "AI_SERVICE_UNAVAILABLE", error: "Servicio de dictado no disponible. Intentá de nuevo más tarde." };
  }
  if (status === 504) {
    return { status: 504, code: "AI_TIMEOUT", error: "La transcripción tardó demasiado. Probá con un audio más corto." };
  }
  return { status: status >= 500 ? 500 : status, code: body?.code || "STT_PROCESSING_ERROR", error: "No se pudo transcribir. Probá de nuevo o hablá más cerca del micrófono." };
}

async function callAiStt(aiServiceUrl: string, audio: string, context: string, signal: AbortSignal) {
  const aiRes = await fetch(`${aiServiceUrl}/api/stt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio, context }),
    signal,
  });

  if (!aiRes.ok) {
    const errBody = await aiRes.json().catch(() => ({}));
    const err = new Error(`AI service responded ${aiRes.status}`) as Error & { status?: number; body?: any };
    err.status = aiRes.status;
    err.body = errBody;
    throw err;
  }

  return await aiRes.json() as { transcription: string; intent: any };
}

export function registerSttRoutes(app: Express) {
  app.post("/api/ai/stt",
    tenantAuth,
    requireFeature("stt"),
    requirePlanCodes(["ESCALA"]),
    sttRateLimiter,
    sttConcurrencyGuard,
    validateSttPayload,
    async (req, res) => {
      let timeout: NodeJS.Timeout | null = null;
      let clientClosed = false;
      const controller = new AbortController();

      req.on("close", () => {
        clientClosed = true;
        controller.abort();
      });

      try {
        const { audio, context } = req.body;

        const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
        let sttResult: { transcription: string; intent: any };
        timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

        sttLog("incoming_audio", {
          tenantId: req.auth?.tenantId,
          userId: req.auth?.userId,
          context,
          base64Bytes: audio?.length,
          estimatedDurationSec: estimateAudioDurationSec(audio),
        });

        try {
          sttResult = await callAiStt(aiServiceUrl, audio, context, controller.signal);
        } catch (fetchErr: any) {
          sttLog("ai_call_error", { message: fetchErr?.message, status: fetchErr?.status, body: fetchErr?.body });

          const isUnavailable =
            fetchErr.name === "AbortError" ||
            fetchErr.code === "ECONNREFUSED" ||
            fetchErr?.cause?.code === "ECONNREFUSED" ||
            fetchErr.message?.includes("fetch failed");

          if (isUnavailable && !clientClosed) {
            return res.status(503).json({
              error: "Servicio de IA no disponible. Intentá de nuevo más tarde.",
              code: "AI_SERVICE_UNAVAILABLE",
            });
          }

          if (STT_RETRY_ON_FAILURE && [502, 503, 504].includes(fetchErr?.status || 0) && !clientClosed) {
            sttLog("retrying_ai_call_once");
            sttResult = await callAiStt(aiServiceUrl, audio, context, controller.signal);
          } else {
            throw fetchErr;
          }
        }

        if (clientClosed || res.headersSent) return;

        sttLog("ai_response_ok", {
          transcriptionLength: sttResult.transcription?.length || 0,
          intentKeys: sttResult.intent ? Object.keys(sttResult.intent) : [],
        });

        const log = await storage.createSttLog({
          tenantId: req.auth!.tenantId!,
          userId: req.auth!.userId,
          context,
          transcription: sttResult.transcription,
          intentJson: sttResult.intent,
          confirmed: false,
        });

        if (!res.headersSent) {
          res.json({
            data: {
              logId: log.id,
              transcription: sttResult.transcription,
              intent: sttResult.intent,
              context,
            },
          });
        }
      } catch (err: any) {
        const mapped = mapSttError(err?.status || 500, err?.body);
        sttLog("stt_error", { message: err?.message, mapped, clientClosed });
        if (!clientClosed && !res.headersSent) {
          res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
        }
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });

  app.post("/api/ai/apply", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), enforceBranchScope, async (req, res) => {
    try {
      const { context, intent, logId } = req.body;
      if (!context || !intent) {
        return res.status(400).json({ error: "Contexto e intent requeridos" });
      }
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (intent.branchId || null);

      const missingFields: string[] = [];
      if (context === "products" && intent.action === "create") {
        if (!intent.name) missingFields.push("name");
        if (!intent.price && intent.price !== 0) missingFields.push("price");
      } else if (context === "cash" && (intent.action === "income" || intent.action === "expense")) {
        if (!intent.amount && intent.amount !== 0) missingFields.push("amount");
      } else if (context === "orders" && intent.action === "create") {
        if (!intent.customerName && !intent.description) missingFields.push("customerName o description");
      }

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          missing_fields: missingFields,
          message: `Faltan campos requeridos: ${missingFields.join(", ")}`,
        });
      }

      let result: any;
      let entityType: string = "";

      if (context === "orders" && intent.action === "create") {
        const orderNumber = await storage.getNextOrderNumber(tenantId);
        result = await storage.createOrder({
          tenantId,
          orderNumber,
          type: intent.type || "PEDIDO",
          customerName: intent.customerName || null,
          customerPhone: intent.customerPhone || null,
          customerEmail: null,
          description: intent.description || null,
          statusId: intent.statusId || null,
          totalAmount: intent.totalAmount ? String(intent.totalAmount) : null,
          branchId,
          createdById: req.auth!.userId,
          createdByScope: req.auth!.scope || "TENANT",
          createdByBranchId: req.auth!.branchId || null,
          requiresDelivery: false,
          deliveryAddress: null,
          deliveryCity: null,
          deliveryAddressNotes: null,
          deliveryStatus: null,
        });
        entityType = "order";
      } else if (context === "cash" && intent.action === "income") {
        result = await storage.createCashMovement({
          tenantId,
          type: "ingreso",
          amount: String(intent.amount || 0),
          method: intent.method || "efectivo",
          category: intent.category || null,
          description: intent.description || null,
          sessionId: null,
          branchId,
          createdById: req.auth!.userId,
        });
        entityType = "cash_movement";
      } else if (context === "cash" && intent.action === "expense") {
        result = await storage.createCashMovement({
          tenantId,
          type: "egreso",
          amount: String(intent.amount || 0),
          method: intent.method || "efectivo",
          category: intent.category || null,
          description: intent.description || null,
          sessionId: null,
          branchId,
          createdById: req.auth!.userId,
        });
        entityType = "cash_movement";
      } else if (context === "products" && intent.action === "create") {
        result = await storage.createProduct({
          tenantId,
          name: intent.name,
          description: intent.description || null,
          price: String(intent.price),
          sku: intent.sku || null,
          categoryId: intent.categoryId || null,
        });
        entityType = "product";
      } else {
        return res.status(400).json({ error: "Acción no soportada para este contexto" });
      }

      if (logId) {
        try {
          await storage.updateSttLogConfirmed(logId, tenantId, {
            resultEntityType: entityType,
            resultEntityId: result.id,
          });
        } catch (_e) { }
      } else {
        const lastLog = await storage.getLastUnconfirmedLog(tenantId, req.auth!.userId, context);
        if (lastLog) {
          try {
            await storage.updateSttLogConfirmed(lastLog.id, tenantId, {
              resultEntityType: entityType,
              resultEntityId: result.id,
            });
          } catch (_e) { }
        }
      }

      res.status(201).json({ data: result, entityType });
    } catch {
      res.status(500).json({ error: "No se pudo aplicar el comando", code: "STT_APPLY_ERROR" });
    }
  });
}
