import fs from "fs/promises";
import path from "path";
import { fileTypeFromFile } from "file-type";
import { randomUUID } from "crypto";
import { db } from "../db";
import { orderAttachments, orderFieldValues, orderFieldDefinitions } from "@shared/schema/order-presets";
import { eq, and } from "drizzle-orm";
import { HttpError } from "../lib/http-errors";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

export async function validateAndStoreAttachment(
    tenantId: number,
    orderId: number,
    fieldDefinitionId: number,
    tmpPath: string,
    originalName: string,
    mimeType: string,
    sizeBytes: number,
    tenantCode: string
) {
    // 1. Validar el tamaño (la middleware de multer ya lo hace, pero por las dudas)
    const MAX_SIZE = parseInt(process.env.MAX_ATTACHMENT_BYTES || "10485760", 10);
    if (sizeBytes > MAX_SIZE) {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(400, "ATTACHMENT_TOO_LARGE", `El archivo excede el límite de ${MAX_SIZE / 1024 / 1024}MB`);
    }

    // 2. Traer el field definition para saber las extensiones permitidas
    const [fieldDef] = await db
        .select()
        .from(orderFieldDefinitions)
        .where(and(eq(orderFieldDefinitions.id, fieldDefinitionId), eq(orderFieldDefinitions.tenantId, tenantId)));

    if (!fieldDef) {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(404, "FIELD_NOT_FOUND", "No se encontró el campo");
    }

    if (fieldDef.fieldType !== "FILE") {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(400, "INVALID_FIELD_TYPE", "El campo no es de tipo archivo");
    }

    const allowedExtensions = (fieldDef.config as any)?.allowedExtensions || ["pdf", "jpg", "png", "jpeg"];
    const originalExt = originalName.split(".").pop()?.toLowerCase();

    // 3. Validar extensión "lógica" (nombre del archivo)
    if (!originalExt || !allowedExtensions.includes(originalExt)) {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(
            400,
            "INVALID_EXTENSION",
            `Extensión no permitida. Formatos válidos: ${allowedExtensions.join(", ")}`
        );
    }

    // 4. Validar Magic Bytes usando file-type
    const fileTypeResult = await fileTypeFromFile(tmpPath);
    if (!fileTypeResult) {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(400, "INVALID_FILE", "El archivo no tiene un formato reconocido");
    }

    // Comparamos extensiones, si file-type detecta "exe" pero el nombre dice "pdf", rechazamos.
    if (!allowedExtensions.includes(fileTypeResult.ext)) {
        await fs.unlink(tmpPath).catch(console.error);
        throw new HttpError(
            400,
            "FILE_SPOOFING",
            `El contenido real del archivo (${fileTypeResult.ext}) no está permitido`
        );
    }

    // 5. Configurar directorios destino
    // Ej: /storage/tenants/DEMO/orders/123/
    const relativeDir = path.join("tenants", tenantCode, "orders", String(orderId));
    const absoluteDir = path.join(STORAGE_ROOT, relativeDir);
    await fs.mkdir(absoluteDir, { recursive: true });

    const storedName = `${tenantId}_${orderId}_${fieldDef.fieldKey}_${randomUUID()}.${fileTypeResult.ext}`;
    const relativeFilePath = path.join(relativeDir, storedName);
    const absoluteDestPath = path.join(STORAGE_ROOT, relativeFilePath);

    let attachmentId: number | null = null;
    let oldAttachmentPath: string | null = null;

    // 6. Mover archivo e insertar en la base de datos atómicamente
    try {
        await db.transaction(async (tx) => {
            // Registrar el adjunto
            const [attachment] = await tx
                .insert(orderAttachments)
                .values({
                    tenantId,
                    orderId,
                    fieldDefinitionId,
                    originalName,
                    storedName,
                    mimeType: fileTypeResult.mime,
                    sizeBytes,
                    storagePath: relativeFilePath.replace(/\\/g, "/"), // Normalizar separators
                })
                .returning();
            attachmentId = attachment.id;

            // Actualizar el valor del custom field en el pedido si existe, o crearlo
            const [existingFieldValue] = await tx
                .select()
                .from(orderFieldValues)
                .where(
                    and(
                        eq(orderFieldValues.tenantId, tenantId),
                        eq(orderFieldValues.orderId, orderId),
                        eq(orderFieldValues.fieldDefinitionId, fieldDefinitionId)
                    )
                );

            const storageKey = `att:${attachment.id}`;

            if (existingFieldValue) {
                const previousStorageKey = String(existingFieldValue.fileStorageKey || "");
                const match = previousStorageKey.match(/^att:(\d+)$/);
                if (match) {
                    const previousAttachmentId = Number(match[1]);
                    const [previousAttachment] = await tx
                        .select()
                        .from(orderAttachments)
                        .where(and(eq(orderAttachments.id, previousAttachmentId), eq(orderAttachments.orderId, orderId), eq(orderAttachments.tenantId, tenantId)));
                    if (previousAttachment?.storagePath) {
                        oldAttachmentPath = previousAttachment.storagePath;
                    }
                    await tx.delete(orderAttachments).where(eq(orderAttachments.id, previousAttachmentId));
                }

                await tx
                    .update(orderFieldValues)
                    .set({ fileStorageKey: storageKey })
                    .where(eq(orderFieldValues.id, existingFieldValue.id));
            } else {
                await tx.insert(orderFieldValues).values({
                    tenantId,
                    orderId,
                    fieldDefinitionId,
                    fileStorageKey: storageKey,
                });
            }
        });

        await fs.rename(tmpPath, absoluteDestPath);

        if (oldAttachmentPath) {
            const oldAbsPath = path.join(STORAGE_ROOT, path.normalize(oldAttachmentPath).replace(/^(\.\.(\/|\\|$))+/, ""));
            await fs.unlink(oldAbsPath).catch(() => { });
        }
    } catch (error) {
        // Si falla la transacción o el rename, nos aseguramos de borrar el tmp
        await fs.unlink(tmpPath).catch(() => { });
        throw error;
    }

    return attachmentId;
}

export async function getAttachmentPath(tenantId: number, orderId: number, attachmentId: number) {
    const [attachment] = await db
        .select()
        .from(orderAttachments)
        .where(
            and(
                eq(orderAttachments.id, attachmentId),
                eq(orderAttachments.tenantId, tenantId),
                eq(orderAttachments.orderId, orderId)
            )
        );

    if (!attachment) {
        throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Archivo no encontrado");
    }

    // Prevenir Path Traversal por las dudas de que modificaran storagePath
    const safeStoragePath = path.normalize(attachment.storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const absolutePath = path.join(STORAGE_ROOT, safeStoragePath);

    return { attachment, absolutePath };
}

export async function deleteAttachment(tenantId: number, orderId: number, attachmentId: number) {
    const { absolutePath, attachment } = await getAttachmentPath(tenantId, orderId, attachmentId);

    await db.transaction(async (tx) => {
        // Buscar si está asignado al order_field_values y limpiarlo
        await tx
            .update(orderFieldValues)
            .set({ fileStorageKey: null })
            .where(
                and(
                    eq(orderFieldValues.tenantId, tenantId),
                    eq(orderFieldValues.orderId, orderId),
                    eq(orderFieldValues.fileStorageKey, `att:${attachmentId}`)
                )
            );

        await tx
            .delete(orderAttachments)
            .where(eq(orderAttachments.id, attachmentId));
    });

    // Borrar físicamente el archivo
    await fs.unlink(absolutePath).catch((err) => {
        console.error(`No se pudo eliminar archivo físico: ${absolutePath}`, err);
    });
}
