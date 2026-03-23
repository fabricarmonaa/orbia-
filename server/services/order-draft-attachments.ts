import fs from "fs/promises";
import path from "path";
import { fileTypeFromFile } from "file-type";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  orderAttachments,
  orderDraftAttachments,
  orderFieldDefinitions,
  type InsertOrderAttachment,
} from "@shared/schema/order-presets";
import { HttpError } from "../lib/http-errors";

const STORAGE_ROOT = path.join(process.cwd(), "storage");
const DEFAULT_ALLOWED = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"];

function getMaxUploadBytes() {
  return parseInt(process.env.MAX_ATTACHMENT_BYTES || "10485760", 10);
}

function buildDraftAttachmentKey(id: number) {
  return `draftatt:${id}`;
}

function parseDraftAttachmentKey(value: string | null | undefined) {
  const match = String(value || "").match(/^draftatt:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeDraftKey(value: string) {
  const key = String(value || "").trim();
  if (!key || key.length > 255) {
    throw new HttpError(400, "INVALID_DRAFT_KEY", "draftKey inválido");
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new HttpError(400, "INVALID_DRAFT_KEY", "draftKey inválido");
  }
  return key;
}

async function validateIncomingFile(params: {
  tenantId: number;
  fieldDefinitionId: number;
  tmpPath: string;
  originalName: string;
  sizeBytes: number;
}) {
  const { tenantId, fieldDefinitionId, tmpPath, originalName, sizeBytes } = params;
  if (sizeBytes > getMaxUploadBytes()) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(400, "ATTACHMENT_TOO_LARGE", "El archivo excede el tamaño máximo permitido");
  }

  const [fieldDef] = await db
    .select()
    .from(orderFieldDefinitions)
    .where(
      and(
        eq(orderFieldDefinitions.id, fieldDefinitionId),
        eq(orderFieldDefinitions.tenantId, tenantId),
      )
    );

  if (!fieldDef || fieldDef.deletedAt || fieldDef.isActive === false) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(404, "FIELD_NOT_FOUND", "No se encontró un campo activo para adjuntar el archivo");
  }

  if (fieldDef.fieldType !== "FILE") {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(400, "INVALID_FIELD_TYPE", "El campo no es de tipo archivo");
  }

  const allowedExtensions = ((fieldDef.config as any)?.allowedExtensions || DEFAULT_ALLOWED).map((value: unknown) => String(value || "").toLowerCase());
  const originalExt = originalName.split(".").pop()?.toLowerCase();
  if (!originalExt || !allowedExtensions.includes(originalExt)) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(400, "INVALID_EXTENSION", `Extensión no permitida. Formatos válidos: ${allowedExtensions.join(", ")}`);
  }

  const fileTypeResult = await fileTypeFromFile(tmpPath);
  if (!fileTypeResult) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(400, "INVALID_FILE", "El archivo no tiene un formato reconocido");
  }

  if (!allowedExtensions.includes(fileTypeResult.ext)) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new HttpError(400, "FILE_SPOOFING", `El contenido real del archivo (${fileTypeResult.ext}) no está permitido`);
  }

  return {
    fieldDef,
    detectedExt: fileTypeResult.ext,
    detectedMime: fileTypeResult.mime,
  };
}

async function unlinkSafe(storagePath: string | null | undefined) {
  if (!storagePath) return;
  const safeStoragePath = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
  await fs.unlink(path.join(STORAGE_ROOT, safeStoragePath)).catch(() => {});
}

export async function storeDraftAttachment(params: {
  tenantId: number;
  userId: number;
  fieldDefinitionId: number;
  draftKey: string;
  tmpPath: string;
  originalName: string;
  sizeBytes: number;
  tenantCode: string;
}) {
  const draftKey = normalizeDraftKey(params.draftKey);
  const { fieldDef, detectedExt, detectedMime } = await validateIncomingFile({
    tenantId: params.tenantId,
    fieldDefinitionId: params.fieldDefinitionId,
    tmpPath: params.tmpPath,
    originalName: params.originalName,
    sizeBytes: params.sizeBytes,
  });

  const relativeDir = path.join("tenants", params.tenantCode, "draft-orders", String(params.userId), draftKey);
  const absoluteDir = path.join(STORAGE_ROOT, relativeDir);
  await fs.mkdir(absoluteDir, { recursive: true });

  const storedName = `${params.tenantId}_${params.userId}_${fieldDef.fieldKey}_${randomUUID()}.${detectedExt}`;
  const relativeFilePath = path.join(relativeDir, storedName).replace(/\\/g, "/");
  const absoluteDestPath = path.join(STORAGE_ROOT, relativeFilePath);

  const previous = await db
    .select()
    .from(orderDraftAttachments)
    .where(
      and(
        eq(orderDraftAttachments.tenantId, params.tenantId),
        eq(orderDraftAttachments.userId, params.userId),
        eq(orderDraftAttachments.draftKey, draftKey),
        eq(orderDraftAttachments.fieldDefinitionId, params.fieldDefinitionId),
      )
    );

  for (const row of previous) {
    await db.delete(orderDraftAttachments).where(eq(orderDraftAttachments.id, row.id));
    await unlinkSafe(row.storagePath);
  }

  let draftAttachment;
  try {
    await fs.rename(params.tmpPath, absoluteDestPath);

    [draftAttachment] = await db
      .insert(orderDraftAttachments)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        fieldDefinitionId: params.fieldDefinitionId,
        draftKey,
        originalName: params.originalName,
        storedName,
        mimeType: detectedMime,
        sizeBytes: params.sizeBytes,
        storagePath: relativeFilePath,
      })
      .returning();
  } catch (error) {
    await fs.unlink(absoluteDestPath).catch(() => {});
    throw error;
  }

  return {
    draftAttachment,
    storageKey: buildDraftAttachmentKey(draftAttachment.id),
  };
}

export async function deleteDraftAttachment(params: {
  tenantId: number;
  userId: number;
  draftAttachmentId: number;
  draftKey?: string | null;
}) {
  const [row] = await db
    .select()
    .from(orderDraftAttachments)
    .where(
      and(
        eq(orderDraftAttachments.id, params.draftAttachmentId),
        eq(orderDraftAttachments.tenantId, params.tenantId),
        eq(orderDraftAttachments.userId, params.userId),
        params.draftKey ? eq(orderDraftAttachments.draftKey, normalizeDraftKey(params.draftKey)) : undefined,
      )
    );
  if (!row) throw new HttpError(404, "DRAFT_ATTACHMENT_NOT_FOUND", "Adjunto temporal no encontrado");

  await db.delete(orderDraftAttachments).where(eq(orderDraftAttachments.id, row.id));
  await unlinkSafe(row.storagePath);
}

export async function promoteDraftAttachmentsForOrder(params: {
  tx: any;
  tenantId: number;
  userId: number;
  orderId: number;
  draftKey: string;
  normalized: Array<{
    fieldDefinitionId: number;
    valueText: string | null;
    valueNumber: string | null;
    fileStorageKey: string | null;
    visibleOverride: boolean | null;
  }>;
}) {
  const nextValues = [];

  for (const row of params.normalized) {
    const draftAttachmentId = parseDraftAttachmentKey(row.fileStorageKey);
    if (!draftAttachmentId) {
      nextValues.push(row);
      continue;
    }
    const draftKey = normalizeDraftKey(params.draftKey);

    const [draftAttachment] = await params.tx
      .select()
      .from(orderDraftAttachments)
      .where(
        and(
          eq(orderDraftAttachments.id, draftAttachmentId),
          eq(orderDraftAttachments.tenantId, params.tenantId),
          eq(orderDraftAttachments.userId, params.userId),
          eq(orderDraftAttachments.draftKey, draftKey),
          eq(orderDraftAttachments.fieldDefinitionId, row.fieldDefinitionId),
        )
      );

    if (!draftAttachment) {
      throw new HttpError(400, "DRAFT_ATTACHMENT_NOT_FOUND", "No se encontró el adjunto temporal seleccionado");
    }

    const insertValues: InsertOrderAttachment = {
      tenantId: params.tenantId,
      orderId: params.orderId,
      fieldDefinitionId: row.fieldDefinitionId,
      originalName: draftAttachment.originalName,
      storedName: draftAttachment.storedName,
      mimeType: draftAttachment.mimeType,
      sizeBytes: draftAttachment.sizeBytes,
      storagePath: draftAttachment.storagePath,
    };
    const [attachment] = await params.tx.insert(orderAttachments).values(insertValues).returning();
    await params.tx.delete(orderDraftAttachments).where(eq(orderDraftAttachments.id, draftAttachment.id));

    nextValues.push({
      ...row,
      fileStorageKey: `att:${attachment.id}`,
    });
  }

  return nextValues;
}

export async function clearRemainingDraftAttachments(params: {
  tenantId: number;
  userId: number;
  draftKey: string;
}) {
  const draftKey = normalizeDraftKey(params.draftKey);
  const rows = await db
    .select()
    .from(orderDraftAttachments)
    .where(
      and(
        eq(orderDraftAttachments.tenantId, params.tenantId),
        eq(orderDraftAttachments.userId, params.userId),
        eq(orderDraftAttachments.draftKey, draftKey),
      )
    );

  if (rows.length === 0) return;
  await db
    .delete(orderDraftAttachments)
    .where(
      and(
        eq(orderDraftAttachments.tenantId, params.tenantId),
        eq(orderDraftAttachments.userId, params.userId),
        eq(orderDraftAttachments.draftKey, draftKey),
      )
    );

  await Promise.all(rows.map((row) => unlinkSafe(row.storagePath)));
}
