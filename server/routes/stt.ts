import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { tenantAuth, requireFeature, enforceBranchScope, requirePlanCodes } from "../auth";
import { sttRateLimiter, sttConcurrencyGuard, validateSttPayload } from "../middleware/stt-guards";
import { customers, products } from "@shared/schema";
import { sanitizeShortText } from "../security/sanitize";
import { issueIntentTicket, consumeIntentTicket } from "../services/stt-intent-ticket";
import { detectExfiltration, hasSearchFilters, resolveCustomerPurchasesIntent } from "../services/stt-policy";

const upload = multer({ limits: { fileSize: 12 * 1024 * 1024 } });
const uploadAudio = (req: Request, res: Response, next: NextFunction) => {
  upload.single("audio")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Audio demasiado largo (máx 12MB)", code: "STT_AUDIO_TOO_LARGE" });
      }
      return res.status(400).json({ error: "Error procesando archivo", code: "STT_UPLOAD_ERROR" });
    }
    next();
  });
};

const STT_TIMEOUT_MS = parseInt(process.env.STT_TIMEOUT_MS || "15000", 10);
const ALLOWED_INTENTS = new Set([
  "customer.create",
  "customer.search",
  "customer.purchases",
  "product.create",
  "product.search",
  "sale.create",
  "sale.search",
]);

const executeSchema = z.object({
  intent: z.string(),
  entities: z.record(z.any()).default({}),
  transcript: z.string().optional(),
  intentTicket: z.string().min(10),
  clientConfirmation: z.literal(true),
});

class AiInterpretError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AiInterpretError";
    this.statusCode = statusCode;
  }
}

function n(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function callAiInterpret(payload: Record<string, unknown>, signal: AbortSignal) {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://ai:8000";
  const aiRes = await fetch(`${aiServiceUrl}/api/stt/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!aiRes.ok) {
    const body = await aiRes.json().catch(() => ({}));
    const message = body?.detail || `AI service error ${aiRes.status}`;
    throw new AiInterpretError(message, aiRes.status);
  }

  return aiRes.json() as Promise<{ transcript: string; intent: string; entities: Record<string, unknown>; confidence: number; summary: string }>;
}

export function registerSttRoutes(app: Express) {
  app.post("/api/stt/interpret", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), uploadAudio, sttRateLimiter, sttConcurrencyGuard, validateSttPayload, async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const transcript = typeof req.body.text === "string" ? sanitizeShortText(req.body.text, 500) : undefined;
      const history = await storage.getSttInteractionsByTenant(tenantId, userId, 25);

      const response = await callAiInterpret({
        audio: req.body.audio,
        text: transcript,
        history: history.map((h) => ({ transcript: h.transcript, intent: h.intentConfirmed, entities: h.entitiesConfirmed })),
      }, controller.signal);

      if (!ALLOWED_INTENTS.has(response.intent)) {
        return res.status(400).json({ error: "Intent no permitido", code: "INTENT_NOT_ALLOWED" });
      }

      const log = await storage.createSttLog({
        tenantId,
        userId,
        context: "voice_global",
        transcription: response.transcript,
        intentJson: { intent: response.intent, entities: response.entities, confidence: response.confidence, summary: response.summary },
        confirmed: false,
      });

      const ticket = issueIntentTicket({ tenantId, userId, intent: response.intent, entities: response.entities });

      return res.json({
        data: {
          logId: log.id,
          transcript: response.transcript,
          intent: response.intent,
          entities: response.entities,
          confidence: response.confidence,
          summary: response.summary,
          intentTicket: ticket.ticket,
          ticketExpiresAt: ticket.expiresAt,
          ticketTtlMs: ticket.ttlMs,
        },
      });
    } catch (err: any) {
      console.error("[STT_INTERPRET_ERROR]", {
        requestId,
        message: err?.message,
        code: err?.code,
        statusCode: err?.statusCode,
        stack: err?.stack,
      });
      if (err?.name === "AbortError") {
        return res.status(504).json({ error: "AI_SERVICE_TIMEOUT", requestId });
      }
      if (err instanceof AiInterpretError) {
        return res.status(502).json({ error: "AI_SERVICE_UNAVAILABLE", requestId });
      }
      if (err?.message?.includes("fetch failed") || err?.message?.includes("ECONNREFUSED")) {
        return res.status(502).json({ error: "AI_SERVICE_UNAVAILABLE", requestId });
      }
      return res.status(500).json({ error: "AI_SERVICE_UNAVAILABLE", requestId });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post("/api/stt/execute", tenantAuth, requireFeature("stt"), requirePlanCodes(["ESCALA"]), enforceBranchScope, async (req, res) => {
    try {
      const payload = executeSchema.parse(req.body);
      if (!ALLOWED_INTENTS.has(payload.intent)) {
        return res.status(403).json({ error: "Intent no permitido", code: "INTENT_NOT_ALLOWED" });
      }

      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;

      if (req.auth!.scope === "BRANCH" && !branchId) {
        return res.status(403).json({ error: "Branch scope requerido", code: "BRANCH_SCOPE_REQUIRED" });
      }

      if (detectExfiltration(JSON.stringify(payload.entities))) {
        return res.status(403).json({ error: "Consulta no permitida", code: "DATA_EXFIL_BLOCKED" });
      }

      if (!consumeIntentTicket({
        ticket: payload.intentTicket,
        tenantId,
        userId,
        intent: payload.intent,
        entities: payload.entities,
      })) {
        return res.status(403).json({ error: "Intent ticket inválido o expirado", code: "INTENT_TICKET_INVALID" });
      }

      if (!hasSearchFilters(payload.intent, payload.entities)) {
        return res.status(400).json({ error: "Filtro insuficiente para búsqueda", code: "SEARCH_FILTER_REQUIRED" });
      }

      if (payload.intent === "customer.purchases" && resolveCustomerPurchasesIntent(String(payload.transcript || "")) === "provider_purchases") {
        return res.status(400).json({ error: "Para compras a proveedor usá el módulo de compras", code: "PROVIDER_PURCHASES_NOT_SUPPORTED" });
      }

      let result: any = null;
      let response: any = { type: "error" };

      if (payload.intent === "customer.create") {
        const name = sanitizeShortText(String(payload.entities.name || ""), 200).trim();
        const doc = String(payload.entities.dni || payload.entities.doc || "").replace(/\D/g, "");
        if (!name || (doc && !/^\d{6,15}$/.test(doc))) return res.status(400).json({ error: "Datos inválidos" });
        const [created] = await db.insert(customers).values({ tenantId, name, doc: doc || null, isActive: true }).returning();
        result = created;
        response = { type: "navigation", navigation: { route: "/app/customers", params: { id: created.id } }, data: created };
      } else if (payload.intent === "customer.search" || payload.intent === "customer.purchases") {
        const dni = String(payload.entities.dni || "").replace(/\D/g, "");
        const name = sanitizeShortText(String(payload.entities.name || ""), 200);
        const where = and(
          eq(customers.tenantId, tenantId),
          eq(customers.isActive, true),
          dni ? eq(customers.doc, dni) : or(ilike(customers.name, `%${name}%`), ilike(customers.email, `%${name}%`))!,
        );
        const list = await db.select().from(customers).where(where).limit(20);
        if (payload.intent === "customer.search") {
          response = { type: "data", data: { customers: list } };
        } else {
          const customerId = list[0]?.id;
          if (!customerId) return res.status(404).json({ error: "Cliente no encontrado" });
          const sales = await storage.listSales(tenantId, { customerId, limit: 20, offset: 0, sort: "date_desc", ...(branchId ? { branchId } : {}) });
          response = { type: "data", data: { customer: list[0], purchases: sales.data, meta: sales.meta } };
        }
      } else if (payload.intent === "product.create") {
        const name = sanitizeShortText(String(payload.entities.name || ""), 200).trim();
        const price = n(payload.entities.price);
        if (!name || price === null || price < 0) return res.status(400).json({ error: "Datos inválidos" });
        const created = await storage.createProduct({ tenantId, name, price: String(price), description: null, categoryId: null, sku: null });
        result = created;
        response = { type: "navigation", navigation: { route: "/app/products", params: { id: created.id } }, data: created };
      } else if (payload.intent === "product.search") {
        const q = sanitizeShortText(String(payload.entities.name || payload.entities.query || ""), 200);
        const list = await db.select().from(products).where(and(eq(products.tenantId, tenantId), ilike(products.name, `%${q}%`))).limit(20);
        response = { type: "data", data: { products: list } };
      } else if (payload.intent === "sale.search") {
        const customerQuery = sanitizeShortText(String(payload.entities.customerName || payload.entities.name || ""), 200);
        const sales = await storage.listSales(tenantId, { customerQuery, limit: 20, offset: 0, sort: "date_desc", ...(branchId ? { branchId } : {}) });
        response = { type: "data", data: { sales: sales.data, meta: sales.meta } };
      } else if (payload.intent === "sale.create") {
        const productName = sanitizeShortText(String(payload.entities.productName || payload.entities.product || ""), 200);
        const quantity = n(payload.entities.quantity) || 1;
        const customerName = sanitizeShortText(String(payload.entities.customerName || ""), 200);

        const [product] = await db.select().from(products).where(and(eq(products.tenantId, tenantId), ilike(products.name, `%${productName}%`))).orderBy(desc(products.createdAt)).limit(1);
        if (!product) return res.status(404).json({ error: "Producto no encontrado" });

        let customerId: number | null = null;
        if (customerName) {
          const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), ilike(customers.name, `%${customerName}%`))).limit(1);
          customerId = customer?.id || null;
        }

        const created = await storage.createSaleAtomic({
          tenantId,
          branchId,
          cashierUserId: req.auth!.cashierId || userId,
          currency: "ARS",
          paymentMethod: "efectivo",
          notes: "Venta generada por voz",
          customerId,
          discountType: "NONE",
          discountValue: 0,
          surchargeType: "NONE",
          surchargeValue: 0,
          items: [{ productId: product.id, quantity: Math.max(1, Math.trunc(quantity)), unitPrice: Number(product.price) }],
        });

        result = created.sale;
        response = { type: "navigation", navigation: { route: "/app/sales", params: { id: created.sale.id } }, data: created.sale };
      }

      await storage.createSttInteraction({
        tenantId,
        userId,
        transcript: sanitizeShortText(payload.transcript || payload.intent, 500),
        intentConfirmed: payload.intent,
        entitiesConfirmed: payload.entities,
      });

      if (result?.id) {
        const lastLog = await storage.getLastUnconfirmedLog(tenantId, userId, "voice_global");
        if (lastLog) await storage.updateSttLogConfirmed(lastLog.id, tenantId, { resultEntityType: payload.intent, resultEntityId: result.id });
      }

      return res.json(response);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Payload inválido", details: err.issues });
      return res.status(500).json({ error: "No se pudo ejecutar la acción", code: "STT_EXECUTE_ERROR" });
    }
  });
}
