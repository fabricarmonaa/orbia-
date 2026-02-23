import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { tenantAuth, blockBranchScope, requireFeature, requireTenantAdmin, requireNotPlanCodes } from "../auth";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody } from "../middleware/validate";

const sanitizeOptionalShort = (max: number) =>
    z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().transform((value) => sanitizeShortText(value, max)).optional());

const sanitizeOptionalLong = (max: number) =>
    z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().transform((value) => sanitizeLongText(value, max)).optional());

const baseExpenseDefinitionSchema = z.object({
    type: z.enum(["FIXED", "VARIABLE"]),
    name: z.string().transform((value) => sanitizeShortText(value, 80)).refine((value) => value.length >= 2, "Nombre inválido"),
    description: sanitizeOptionalLong(200).nullable(),
    category: sanitizeOptionalShort(100).nullable(),
    defaultAmount: z.coerce.number().positive().optional(),
    currency: sanitizeOptionalShort(10).nullable(),
    isActive: z.boolean().optional(),
});

const expenseDefinitionSchema = baseExpenseDefinitionSchema.superRefine((data, ctx) => {
    if (data.type === "FIXED" && (!data.defaultAmount || data.defaultAmount <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "defaultAmount requerido para gastos fijos", path: ["defaultAmount"] });
    }
});

const expenseDefinitionUpdateSchema = baseExpenseDefinitionSchema.partial();

export function registerExpenseRoutes(app: Express) {
    app.get("/api/expense-categories", tenantAuth, async (req, res) => {
        try {
            const data = await storage.getExpenseCategories(req.auth!.tenantId!);
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get("/api/expenses/definitions", tenantAuth, requireNotPlanCodes(["ECONOMICO"]), async (req, res) => {
        try {
            const type = req.query.type ? String(req.query.type).toUpperCase() : undefined;
            if (type && !["FIXED", "VARIABLE"].includes(type)) {
                return res.status(400).json({ error: "type inválido" });
            }
            const data = await storage.listExpenseDefinitions(req.auth!.tenantId!, type);
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/expenses/definitions", tenantAuth, requireNotPlanCodes(["ECONOMICO"]), requireTenantAdmin, blockBranchScope, validateBody(expenseDefinitionSchema), async (req, res) => {
        try {
            const payload = req.body as z.infer<typeof expenseDefinitionSchema>;
            const data = await storage.createExpenseDefinition({
                tenantId: req.auth!.tenantId!,
                type: payload.type,
                name: payload.name,
                description: payload.description || null,
                category: payload.category || null,
                defaultAmount: payload.defaultAmount ? String(payload.defaultAmount) : null,
                currency: payload.currency || null,
                isActive: payload.isActive ?? true,
            });
            res.status(201).json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.put("/api/expenses/definitions/:id", tenantAuth, requireNotPlanCodes(["ECONOMICO"]), requireTenantAdmin, blockBranchScope, validateBody(expenseDefinitionUpdateSchema), async (req, res) => {
        try {
            const payload = req.body as z.infer<typeof expenseDefinitionUpdateSchema>;
            if (!Object.keys(payload).length) {
                return res.status(400).json({ error: "Sin cambios para actualizar" });
            }
            const data = await storage.updateExpenseDefinition(parseInt(req.params.id as string), req.auth!.tenantId!, {
                type: payload.type,
                name: payload.name,
                description: payload.description ?? undefined,
                category: payload.category ?? undefined,
                defaultAmount: payload.defaultAmount !== undefined ? String(payload.defaultAmount) : undefined,
                currency: payload.currency ?? undefined,
                isActive: payload.isActive,
            });
            if (!data) return res.status(404).json({ error: "Definición no encontrada" });
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete("/api/expenses/definitions/:id", tenantAuth, requireNotPlanCodes(["ECONOMICO"]), requireTenantAdmin, blockBranchScope, async (req, res) => {
        try {
            await storage.deleteExpenseDefinition(parseInt(req.params.id as string), req.auth!.tenantId!);
            res.json({ ok: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/expense-categories", tenantAuth, blockBranchScope, validateBody(z.object({ name: z.string().transform((value) => sanitizeShortText(value, 100)).refine((value) => value.length >= 2, "Nombre inválido"), type: sanitizeOptionalShort(20) })), async (req, res) => {
        try {
            const data = await storage.createExpenseCategory({ tenantId: req.auth!.tenantId!, name: req.body.name, type: req.body.type || "variable" });
            res.status(201).json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.patch("/api/expense-categories/:id", tenantAuth, blockBranchScope, validateBody(z.object({ name: sanitizeOptionalShort(100), type: sanitizeOptionalShort(20) })), async (req, res) => {
        try {
            const data = await storage.updateExpenseCategory(parseInt(req.params.id as string), req.auth!.tenantId!, { name: req.body.name, type: req.body.type });
            if (!data) return res.status(404).json({ error: "Categoría no encontrada" });
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete("/api/expense-categories/:id", tenantAuth, blockBranchScope, async (req, res) => {
        try {
            await storage.deleteExpenseCategory(parseInt(req.params.id as string), req.auth!.tenantId!);
            res.json({ ok: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get("/api/fixed-expenses", tenantAuth, requireFeature("fixed_expenses"), async (req, res) => {
        try {
            const data = await storage.getFixedExpenses(req.auth!.tenantId!);
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/fixed-expenses", tenantAuth, blockBranchScope, requireFeature("fixed_expenses"), validateBody(z.object({
        categoryId: z.coerce.number().int().positive().optional().nullable(),
        name: z.string().transform((value) => sanitizeShortText(value, 120)).refine((value) => value.length >= 2, "Nombre inválido"),
        amount: z.coerce.number().positive(),
        periodicity: sanitizeOptionalShort(20),
        payDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
        isActive: z.boolean().optional(),
    })), async (req, res) => {
        try {
            const data = await storage.createFixedExpense({
                tenantId: req.auth!.tenantId!,
                categoryId: req.body.categoryId || null,
                name: req.body.name,
                amount: String(req.body.amount),
                periodicity: req.body.periodicity || "monthly",
                payDay: req.body.payDay || null,
                isActive: req.body.isActive !== undefined ? req.body.isActive : true,
            });
            res.status(201).json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.patch("/api/fixed-expenses/:id", tenantAuth, blockBranchScope, requireFeature("fixed_expenses"), async (req, res) => {
        try {
            const data = await storage.updateFixedExpense(parseInt(req.params.id as string), req.auth!.tenantId!, {
                categoryId: req.body.categoryId,
                name: req.body.name,
                amount: req.body.amount ? String(req.body.amount) : undefined,
                periodicity: req.body.periodicity,
                payDay: req.body.payDay,
                isActive: req.body.isActive,
            });
            if (!data) return res.status(404).json({ error: "Gasto fijo no encontrado" });
            res.json({ data });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.patch("/api/fixed-expenses/:id/toggle", tenantAuth, blockBranchScope, requireFeature("fixed_expenses"), async (req, res) => {
        try {
            await storage.toggleFixedExpenseActive(parseInt(req.params.id as string), req.auth!.tenantId!, req.body.isActive);
            res.json({ ok: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });
}
