import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { tenantAuth, blockBranchScope, requireFeature, requireTenantAdmin, requireNotPlanCodes } from "../auth";

const baseExpenseDefinitionSchema = z.object({
    type: z.enum(["FIXED", "VARIABLE"]),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(200).optional().nullable(),
    category: z.string().trim().max(100).optional().nullable(),
    defaultAmount: z.coerce.number().positive().optional(),
    currency: z.string().trim().max(10).optional().nullable(),
    isActive: z.boolean().optional(),
});

const expenseDefinitionSchema = baseExpenseDefinitionSchema.superRefine((data, ctx) => {
    if (data.type === "FIXED" && (!data.defaultAmount || data.defaultAmount <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "defaultAmount requerido para gastos fijos", path: ["defaultAmount"] });
    }
});

const expenseDefinitionUpdateSchema = baseExpenseDefinitionSchema.partial();

export function registerExpenseRoutes(app: Express) {
    // ============================================
    // EXPENSE CATEGORIES
    // ============================================

    app.get("/api/expense-categories",
        tenantAuth,
        async (req, res) => {
            try {
                const data = await storage.getExpenseCategories(req.auth!.tenantId!);
                res.json({ data });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    // ============================================
    // EXPENSE DEFINITIONS (FIXED / VARIABLE)
    // ============================================

    app.get("/api/expenses/definitions",
        tenantAuth,
        requireNotPlanCodes(["ECONOMICO"]),
        async (req, res) => {
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
        }
    );

    app.post("/api/expenses/definitions",
        tenantAuth,
        requireNotPlanCodes(["ECONOMICO"]),
        requireTenantAdmin,
        blockBranchScope,
        async (req, res) => {
            try {
                const payload = expenseDefinitionSchema.parse(req.body);
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
                if (err instanceof z.ZodError) {
                    return res.status(400).json({ error: "Datos inválidos", details: err.errors });
                }
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.put("/api/expenses/definitions/:id",
        tenantAuth,
        requireNotPlanCodes(["ECONOMICO"]),
        requireTenantAdmin,
        blockBranchScope,
        async (req, res) => {
            try {
                const payload = expenseDefinitionUpdateSchema.parse(req.body);
                if (!Object.keys(payload).length) {
                    return res.status(400).json({ error: "Sin cambios para actualizar" });
                }
                const data = await storage.updateExpenseDefinition(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!,
                    {
                        type: payload.type,
                        name: payload.name,
                        description: payload.description ?? undefined,
                        category: payload.category ?? undefined,
                        defaultAmount: payload.defaultAmount !== undefined ? String(payload.defaultAmount) : undefined,
                        currency: payload.currency ?? undefined,
                        isActive: payload.isActive,
                    }
                );
                if (!data) return res.status(404).json({ error: "Definición no encontrada" });
                res.json({ data });
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(400).json({ error: "Datos inválidos", details: err.errors });
                }
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.delete("/api/expenses/definitions/:id",
        tenantAuth,
        requireNotPlanCodes(["ECONOMICO"]),
        requireTenantAdmin,
        blockBranchScope,
        async (req, res) => {
            try {
                await storage.deleteExpenseDefinition(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!
                );
                res.json({ ok: true });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.post("/api/expense-categories",
        tenantAuth,
        blockBranchScope,  // Solo TENANT puede crear categorías
        async (req, res) => {
            try {
                const data = await storage.createExpenseCategory({
                    tenantId: req.auth!.tenantId!,
                    name: req.body.name,
                    type: req.body.type || "variable",
                });
                res.status(201).json({ data });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.patch("/api/expense-categories/:id",
        tenantAuth,
        blockBranchScope,
        async (req, res) => {
            try {
                const data = await storage.updateExpenseCategory(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!,
                    { name: req.body.name, type: req.body.type }
                );
                if (!data) return res.status(404).json({ error: "Categoría no encontrada" });
                res.json({ data });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.delete("/api/expense-categories/:id",
        tenantAuth,
        blockBranchScope,
        async (req, res) => {
            try {
                await storage.deleteExpenseCategory(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!
                );
                res.json({ ok: true });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    // ============================================
    // FIXED EXPENSES
    // ============================================

    app.get("/api/fixed-expenses",
        tenantAuth,
        requireFeature("fixed_expenses"),
        async (req, res) => {
            try {
                const data = await storage.getFixedExpenses(req.auth!.tenantId!);
                res.json({ data });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.post("/api/fixed-expenses",
        tenantAuth,
        blockBranchScope,
        requireFeature("fixed_expenses"),
        async (req, res) => {
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
        }
    );

    app.patch("/api/fixed-expenses/:id",
        tenantAuth,
        blockBranchScope,
        requireFeature("fixed_expenses"),
        async (req, res) => {
            try {
                const data = await storage.updateFixedExpense(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!,
                    {
                        categoryId: req.body.categoryId,
                        name: req.body.name,
                        amount: req.body.amount ? String(req.body.amount) : undefined,
                        periodicity: req.body.periodicity,
                        payDay: req.body.payDay,
                        isActive: req.body.isActive,
                    }
                );
                if (!data) return res.status(404).json({ error: "Gasto fijo no encontrado" });
                res.json({ data });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.patch("/api/fixed-expenses/:id/toggle",
        tenantAuth,
        blockBranchScope,
        requireFeature("fixed_expenses"),
        async (req, res) => {
            try {
                await storage.toggleFixedExpenseActive(
                    parseInt(req.params.id as string),
                    req.auth!.tenantId!,
                    req.body.isActive
                );
                res.json({ ok: true });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        }
    );
}
