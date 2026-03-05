import type { Express } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { providers } from "@shared/schema";
import { tenantAuth, requireTenantAdmin } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createProviderSchema = z.object({
    name: z
        .string()
        .min(1)
        .max(200)
        .transform((v) => sanitizeShortText(v, 200)),
    address: z
        .string()
        .max(500)
        .optional()
        .nullable()
        .transform((v) => (v ? sanitizeLongText(v, 500) : null)),
    phone: z
        .string()
        .max(60)
        .optional()
        .nullable()
        .transform((v) => (v ? sanitizeShortText(v, 60) : null)),
    email: z.string().email().max(255).optional().nullable(),
    contactName: z
        .string()
        .max(200)
        .optional()
        .nullable()
        .transform((v) => (v ? sanitizeShortText(v, 200) : null)),
    notes: z
        .string()
        .max(2000)
        .optional()
        .nullable()
        .transform((v) => (v ? sanitizeLongText(v, 2000) : null)),
});

const updateProviderSchema = createProviderSchema.partial();

export function registerProviderRoutes(app: Express) {
    /** GET /api/providers — Lista todos los proveedores activos del tenant */
    app.get("/api/providers", tenantAuth, requireTenantAdmin, async (req, res) => {
        try {
            const tenantId = req.auth!.tenantId!;
            const rows = await db
                .select()
                .from(providers)
                .where(and(eq(providers.tenantId, tenantId), eq(providers.active, true)))
                .orderBy(providers.name);
            return res.json({ data: rows });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || "No se pudieron listar los proveedores", code: "PROVIDERS_LIST_ERROR" });
        }
    });

    /** POST /api/providers — Crear proveedor */
    app.post("/api/providers", tenantAuth, requireTenantAdmin, validateBody(createProviderSchema), async (req, res) => {
        try {
            const tenantId = req.auth!.tenantId!;
            const payload = req.body as z.infer<typeof createProviderSchema>;
            const [created] = await db
                .insert(providers)
                .values({
                    tenantId,
                    name: payload.name,
                    address: payload.address ?? null,
                    phone: payload.phone ?? null,
                    email: payload.email ?? null,
                    contactName: payload.contactName ?? null,
                    notes: payload.notes ?? null,
                })
                .returning();
            return res.status(201).json({ data: created });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || "No se pudo crear el proveedor", code: "PROVIDER_CREATE_ERROR" });
        }
    });

    /** PATCH /api/providers/:id — Actualizar proveedor */
    app.patch(
        "/api/providers/:id",
        tenantAuth,
        requireTenantAdmin,
        validateParams(idParamSchema),
        validateBody(updateProviderSchema),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const id = Number(req.params.id);
                const payload = req.body as z.infer<typeof updateProviderSchema>;

                const [existing] = await db
                    .select({ id: providers.id })
                    .from(providers)
                    .where(and(eq(providers.id, id), eq(providers.tenantId, tenantId)));

                if (!existing) {
                    return res.status(404).json({ error: "Proveedor no encontrado", code: "PROVIDER_NOT_FOUND" });
                }

                const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
                if (payload.name !== undefined) updatePayload.name = payload.name;
                if (payload.address !== undefined) updatePayload.address = payload.address;
                if (payload.phone !== undefined) updatePayload.phone = payload.phone;
                if (payload.email !== undefined) updatePayload.email = payload.email;
                if (payload.contactName !== undefined) updatePayload.contactName = payload.contactName;
                if (payload.notes !== undefined) updatePayload.notes = payload.notes;

                const [updated] = await db
                    .update(providers)
                    .set(updatePayload as any)
                    .where(and(eq(providers.id, id), eq(providers.tenantId, tenantId)))
                    .returning();

                return res.json({ data: updated });
            } catch (err: any) {
                return res.status(500).json({ error: err.message || "No se pudo actualizar el proveedor", code: "PROVIDER_UPDATE_ERROR" });
            }
        }
    );

    /** DELETE /api/providers/:id — Soft delete (active = false) */
    app.delete("/api/providers/:id", tenantAuth, requireTenantAdmin, validateParams(idParamSchema), async (req, res) => {
        try {
            const tenantId = req.auth!.tenantId!;
            const id = Number(req.params.id);

            const [existing] = await db
                .select({ id: providers.id })
                .from(providers)
                .where(and(eq(providers.id, id), eq(providers.tenantId, tenantId)));

            if (!existing) {
                return res.status(404).json({ error: "Proveedor no encontrado", code: "PROVIDER_NOT_FOUND" });
            }

            await db
                .update(providers)
                .set({ active: false, updatedAt: new Date() } as any)
                .where(and(eq(providers.id, id), eq(providers.tenantId, tenantId)));

            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || "No se pudo eliminar el proveedor", code: "PROVIDER_DELETE_ERROR" });
        }
    });
}
