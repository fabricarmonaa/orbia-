import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, requireFeature, enforceBranchScope } from "../auth";
import { z } from "zod";
import { refreshMetricsForDate } from "../services/metrics-refresh";
import { getIdempotencyKey, hashPayload, getIdempotentResponse, saveIdempotentResponse } from "../services/idempotency";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody } from "../middleware/validate";

const sanitizeOptionalShort = (max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().transform((value) => sanitizeShortText(value, max)).optional());

const sanitizeOptionalLong = (max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().transform((value) => sanitizeLongText(value, max)).optional());

const cashMovementSchema = z.object({
  type: z.enum(["ingreso", "egreso"]),
  amount: z.coerce.number().positive(),
  method: sanitizeOptionalShort(40),
  category: sanitizeOptionalShort(80).nullable(),
  description: sanitizeOptionalLong(200).nullable(),
  expenseDefinitionId: z.coerce.number().int().positive().optional().nullable(),
  sessionId: z.coerce.number().int().positive().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

export function registerCashRoutes(app: Express) {
  app.get("/api/cash/sessions", tenantAuth, requireFeature("cash_sessions"), enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = req.auth!.scope === "BRANCH" && req.auth!.branchId
        ? await storage.getCashSessionsByBranch(tenantId, req.auth!.branchId)
        : await storage.getCashSessions(tenantId);
      res.json({ data });
    } catch {
      res.status(500).json({ error: "No se pudo obtener sesiones de caja", code: "CASH_SESSIONS_ERROR" });
    }
  });

  app.post("/api/cash/sessions", tenantAuth, requireFeature("cash_sessions"), enforceBranchScope, validateBody(z.object({ openingAmount: z.coerce.number().min(0), branchId: z.coerce.number().int().positive().optional().nullable() })), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (req.body.branchId || null);
      const existing = await storage.getOpenSession(tenantId, branchId);
      if (existing) {
        return res.status(400).json({ error: "Ya hay una caja abierta para esta sucursal", code: "CASH_SESSION_ALREADY_OPEN" });
      }
      const data = await storage.createCashSession({
        tenantId,
        branchId,
        userId: req.auth!.userId,
        openingAmount: String(req.body.openingAmount || 0),
        status: "open",
      });
      await refreshMetricsForDate(tenantId, new Date());
      res.status(201).json({ data });
    } catch {
      res.status(500).json({ error: "No se pudo abrir caja", code: "CASH_SESSION_OPEN_ERROR" });
    }
  });

  app.patch("/api/cash/sessions/:id/close", tenantAuth, requireFeature("cash_sessions"), enforceBranchScope, validateBody(z.object({ closingAmount: z.coerce.number().min(0) })), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const sessionId = parseInt(req.params.id as string);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const idemKey = getIdempotencyKey(req.headers["idempotency-key"] as string | undefined);
      const requestHash = hashPayload({ sessionId, closingAmount: req.body.closingAmount || 0, branchId });

      if (idemKey) {
        const cached = await getIdempotentResponse(tenantId, userId, idemKey, "PATCH:/api/cash/sessions/:id/close", requestHash).catch((e) => {
          if (e.message === "IDEMPOTENCY_HASH_MISMATCH") {
            return { status: 409, body: { error: "La misma Idempotency-Key fue usada con otro payload", code: "IDEMPOTENCY_HASH_MISMATCH" } };
          }
          throw e;
        });
        if (cached) return res.status(cached.status).json(cached.body as any);
      }

      await storage.closeCashSession(sessionId, tenantId, branchId, String(req.body.closingAmount || 0));

      await storage.createAuditLog({
        tenantId,
        userId,
        action: "close",
        entityType: "cash_session",
        entityId: sessionId,
        metadata: { closingAmount: req.body.closingAmount, scope: req.auth!.scope, branchId },
      });

      await refreshMetricsForDate(tenantId, new Date());
      const responseBody = { ok: true };
      if (idemKey) {
        await saveIdempotentResponse({
          tenantId,
          userId,
          key: idemKey,
          route: "PATCH:/api/cash/sessions/:id/close",
          requestHash,
          status: 200,
          body: responseBody,
        });
      }
      res.json(responseBody);
    } catch {
      res.status(500).json({ error: "No se pudo cerrar caja", code: "CASH_SESSION_CLOSE_ERROR" });
    }
  });

  app.get("/api/cash/session", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (req.query.branchId ? parseInt(req.query.branchId as string) : null);
      const session = await storage.getOpenSession(tenantId, branchId);
      res.json({ data: session || null });
    } catch {
      res.status(500).json({ error: "No se pudo obtener la sesión", code: "CASH_SESSION_READ_ERROR" });
    }
  });

  app.get("/api/cash/movements", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = req.auth!.scope === "BRANCH" && req.auth!.branchId
        ? await storage.getCashMovementsByBranch(tenantId, req.auth!.branchId)
        : await storage.getCashMovements(tenantId);
      res.json({ data });
    } catch {
      res.status(500).json({ error: "No se pudieron obtener movimientos", code: "CASH_MOVEMENTS_READ_ERROR" });
    }
  });

  app.post("/api/cash/movements", tenantAuth, enforceBranchScope, validateBody(cashMovementSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof cashMovementSchema>;
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (payload.branchId || null);
      const idemKey = getIdempotencyKey(req.headers["idempotency-key"] as string | undefined);
      const requestHash = hashPayload({ ...payload, branchId });

      if (idemKey) {
        const cached = await getIdempotentResponse(tenantId, userId, idemKey, "POST:/api/cash/movements", requestHash).catch((e) => {
          if (e.message === "IDEMPOTENCY_HASH_MISMATCH") {
            return { status: 409, body: { error: "La misma Idempotency-Key fue usada con otro payload", code: "IDEMPOTENCY_HASH_MISMATCH" } };
          }
          throw e;
        });
        if (cached) return res.status(cached.status).json(cached.body as any);
      }

      const expenseDefinitionId = payload.expenseDefinitionId || null;
      let expenseDefinitionName: string | null = null;

      if (expenseDefinitionId) {
        if (payload.type !== "egreso") {
          return res.status(400).json({ error: "expenseDefinitionId solo aplica a egresos", code: "CASH_EXPENSE_DEFINITION_INVALID" });
        }
        const definition = await storage.getExpenseDefinitionById(expenseDefinitionId, tenantId);
        if (!definition) {
          return res.status(400).json({ error: "Definición de gasto inválida", code: "CASH_EXPENSE_DEFINITION_NOT_FOUND" });
        }
        expenseDefinitionName = definition.name;
      }

      const data = await storage.createCashMovement({
        tenantId,
        type: payload.type,
        amount: String(payload.amount),
        method: payload.method || "efectivo",
        category: payload.category || null,
        description: payload.description || null,
        expenseDefinitionId,
        expenseDefinitionName,
        sessionId: payload.sessionId || null,
        branchId,
        createdById: userId,
      });

      await refreshMetricsForDate(tenantId, new Date());
      const responseBody = { data };
      if (idemKey) {
        await saveIdempotentResponse({
          tenantId,
          userId,
          key: idemKey,
          route: "POST:/api/cash/movements",
          requestHash,
          status: 201,
          body: responseBody,
        });
      }
      res.status(201).json(responseBody);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "CASH_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo crear movimiento", code: "CASH_MOVEMENT_CREATE_ERROR" });
    }
  });

  app.get("/api/cash/reports/expenses", tenantAuth, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const dateFrom = req.query.dateFrom
        ? new Date(req.query.dateFrom as string)
        : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : new Date();

      const breakdown = await storage.getExpensesBreakdown(tenantId, dateFrom, dateTo);
      const categories = await storage.getExpenseCategories(tenantId);

      res.json({ data: { breakdown, categories, dateFrom, dateTo } });
    } catch {
      res.status(500).json({ error: "No se pudo obtener reporte de gastos", code: "CASH_EXPENSES_REPORT_ERROR" });
    }
  });
}
