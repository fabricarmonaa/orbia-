import type { Express } from "express";
import { enforceBranchScope, tenantAuth } from "../auth";
import { upload } from "../middleware/upload";
import {
    validateAndStoreAttachment,
    getAttachmentPath,
    deleteAttachment,
} from "../services/attachment-storage";
import {
    deleteDraftAttachment,
    getDraftAttachmentPath,
    storeDraftAttachment,
} from "../services/order-draft-attachments";
import { HttpError } from "../lib/http-errors";
import { z } from "zod";
import { validateParams, validateQuery } from "../middleware/validate";
import { db } from "../db";
import {
    orders,
    tenants,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { validateOrderScope } from "../services/orders-service";

const orderIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const attachmentParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    attachmentId: z.coerce.number().int().positive(),
});
const draftAttachmentParamSchema = z.object({
    attachmentId: z.coerce.number().int().positive(),
});
const draftAttachmentQuerySchema = z.object({
    draftKey: z.string().trim().min(1).max(255).optional(),
});

export function registerAttachmentRoutes(app: Express) {
    app.post(
        "/api/orders/draft-attachments",
        tenantAuth,
        enforceBranchScope,
        upload.single("file"),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const userId = req.auth!.userId;
                const fieldDefinitionId = parseInt(String(req.body.fieldDefinitionId || ""), 10);
                const draftKey = String(req.body.draftKey || "").trim();

                if (!req.file) {
                    throw new HttpError(400, "NO_FILE", "Ningún archivo fue enviado");
                }
                if (!Number.isInteger(fieldDefinitionId) || fieldDefinitionId <= 0) {
                    throw new HttpError(400, "MISSING_FIELD_DEF", "fieldDefinitionId es obligatorio y debe ser numérico");
                }
                if (!draftKey) {
                    throw new HttpError(400, "INVALID_DRAFT_KEY", "draftKey es obligatorio");
                }

                const [tenant] = await db.select({ code: tenants.code }).from(tenants).where(eq(tenants.id, tenantId));
                if (!tenant?.code) {
                    throw new HttpError(404, "TENANT_NOT_FOUND", "Tenant no encontrado");
                }

                const { draftAttachment, storageKey } = await storeDraftAttachment({
                    tenantId,
                    userId,
                    fieldDefinitionId,
                    draftKey,
                    tmpPath: req.file.path,
                    originalName: req.file.originalname,
                    sizeBytes: req.file.size,
                    tenantCode: tenant.code,
                });

                return res.status(201).json({
                    data: {
                        attachmentId: draftAttachment.id,
                        storageKey,
                        originalName: draftAttachment.originalName,
                        mimeType: draftAttachment.mimeType,
                        sizeBytes: draftAttachment.sizeBytes,
                    },
                });
            } catch (err: any) {
                if (req.file) {
                    import("fs/promises").then((fs) => fs.unlink(req.file!.path).catch(() => { }));
                }
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Draft attachment upload error:", err);
                return res.status(500).json({ error: { code: "DRAFT_ATTACHMENT_ERROR", message: "Error al procesar el archivo temporal" } });
            }
        }
    );

    app.delete(
        "/api/orders/draft-attachments/:attachmentId",
        tenantAuth,
        enforceBranchScope,
        validateParams(draftAttachmentParamSchema),
        validateQuery(draftAttachmentQuerySchema),
        async (req, res) => {
            try {
                await deleteDraftAttachment({
                    tenantId: req.auth!.tenantId!,
                    userId: req.auth!.userId,
                    draftAttachmentId: Number(req.params.attachmentId),
                    draftKey: typeof req.query.draftKey === "string" ? req.query.draftKey : undefined,
                });
                return res.json({ success: true });
            } catch (err: any) {
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Draft attachment delete error:", err);
                return res.status(500).json({ error: { code: "DRAFT_ATTACHMENT_DELETE_ERROR", message: "Error al borrar el archivo temporal" } });
            }
        }
    );

    app.get(
        "/api/orders/draft-attachments/:attachmentId",
        tenantAuth,
        enforceBranchScope,
        validateParams(draftAttachmentParamSchema),
        validateQuery(draftAttachmentQuerySchema),
        async (req, res) => {
            try {
                const { attachment, absolutePath } = await getDraftAttachmentPath({
                    tenantId: req.auth!.tenantId!,
                    userId: req.auth!.userId,
                    draftAttachmentId: Number(req.params.attachmentId),
                    draftKey: typeof req.query.draftKey === "string" ? req.query.draftKey : undefined,
                });
                return res.sendFile(absolutePath, {
                    headers: {
                        "Content-Type": attachment.mimeType,
                        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
                    },
                });
            } catch (err: any) {
                if (err instanceof HttpError) {
                    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
                console.error("Draft attachment read error:", err);
                return res.status(500).json({ error: { code: "DRAFT_ATTACHMENT_READ_ERROR", message: "Error al leer el archivo temporal" } });
            }
        }
    );

    // ─────────────────────────────────────────────
    // UPLOAD ATTACHMENT
    // ─────────────────────────────────────────────
    app.post(
        "/api/orders/:id/attachments",
        tenantAuth,
        enforceBranchScope,
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
                const scopeCheck = await validateOrderScope(tenantId, orderId, req.auth!.scope as any, req.auth!.branchId);
                if (!scopeCheck.ok) {
                    throw new HttpError(scopeCheck.status, "ORDER_SCOPE_FORBIDDEN", scopeCheck.message);
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
        enforceBranchScope,
        validateParams(attachmentParamSchema),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const orderId = Number(req.params.id);
                const attachmentId = Number(req.params.attachmentId);
                const scopeCheck = await validateOrderScope(tenantId, orderId, req.auth!.scope as any, req.auth!.branchId);
                if (!scopeCheck.ok) {
                    throw new HttpError(scopeCheck.status, "ORDER_SCOPE_FORBIDDEN", scopeCheck.message);
                }

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
        enforceBranchScope,
        validateParams(attachmentParamSchema),
        async (req, res) => {
            try {
                const tenantId = req.auth!.tenantId!;
                const orderId = Number(req.params.id);
                const attachmentId = Number(req.params.attachmentId);
                const scopeCheck = await validateOrderScope(tenantId, orderId, req.auth!.scope as any, req.auth!.branchId);
                if (!scopeCheck.ok) {
                    throw new HttpError(scopeCheck.status, "ORDER_SCOPE_FORBIDDEN", scopeCheck.message);
                }

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
