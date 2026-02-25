import type { Express } from "express";
import { tenantAuth } from "../auth";
import { upload } from "../middleware/upload";
import {
    validateAndStoreAttachment,
    getAttachmentPath,
    deleteAttachment,
} from "../services/attachment-storage";
import { HttpError } from "../lib/http-errors";
import { z } from "zod";
import { validateParams } from "../middleware/validate";
import { db } from "../db";
import {
    orders,
    tenants,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const orderIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const attachmentParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    attachmentId: z.coerce.number().int().positive(),
});

export function registerAttachmentRoutes(app: Express) {
    // ─────────────────────────────────────────────
    // UPLOAD ATTACHMENT
    // ─────────────────────────────────────────────
    app.post(
        "/api/orders/:id/attachments",
        tenantAuth,
        validateParams(orderIdParamSchema),
        upload.single("file"),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const orderId = Number(req.params.id);
                const fieldDefinitionId = parseInt(req.body.fieldDefinitionId, 10);

                if (!req.file) {
                    throw new HttpError(400, "NO_FILE", "Ningún archivo fue enviado");
                }

                if (isNaN(fieldDefinitionId)) {
                    throw new HttpError(400, "MISSING_FIELD_DEF", "fieldDefinitionId es obligatorio y debe ser numérico");
                }

                // Validate Ownership
                const [order] = await db
                    .select({ id: orders.id })
                    .from(orders)
                    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

                if (!order) {
                    throw new HttpError(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
                }

                // Get tenant code for storage path
                const [tenant] = await db.select({ code: tenants.code }).from(tenants).where(eq(tenants.id, tenantId));

                const attachmentId = await validateAndStoreAttachment(
                    tenantId,
                    orderId,
                    fieldDefinitionId,
                    req.file.path,
                    req.file.originalname,
                    req.file.mimetype,
                    req.file.size,
                    tenant.code
                );

                res.status(201).json({ data: { attachmentId } });
            } catch (err: any) {
                if (req.file) {
                    import("fs/promises").then((fs) => fs.unlink(req.file!.path).catch(() => { }));
                }
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Upload error:", err);
                return res.status(500).json({ error: { code: "UPLOAD_ERROR", message: "Error al procesar el archivo" } });
            }
        }
    );

    // ─────────────────────────────────────────────
    // DOWNLOAD ATTACHMENT
    // ─────────────────────────────────────────────
    app.get(
        "/api/orders/:id/attachments/:attachmentId",
        tenantAuth,
        validateParams(attachmentParamSchema),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const orderId = Number(req.params.id);
                const attachmentId = Number(req.params.attachmentId);

                const { absolutePath, attachment } = await getAttachmentPath(tenantId, orderId, attachmentId);

                res.download(absolutePath, attachment.originalName);
            } catch (err: any) {
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Download error:", err);
                return res.status(500).json({ error: { code: "DOWNLOAD_ERROR", message: "Error al descargar el archivo" } });
            }
        }
    );

    // ─────────────────────────────────────────────
    // DELETE ATTACHMENT
    // ─────────────────────────────────────────────
    app.delete(
        "/api/orders/:id/attachments/:attachmentId",
        tenantAuth,
        validateParams(attachmentParamSchema),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const orderId = Number(req.params.id);
                const attachmentId = Number(req.params.attachmentId);

                await deleteAttachment(tenantId, orderId, attachmentId);

                res.json({ success: true });
            } catch (err: any) {
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Delete attachment error:", err);
                return res.status(500).json({ error: { code: "DELETE_ERROR", message: "Error al borrar el archivo" } });
            }
        }
    );
}
