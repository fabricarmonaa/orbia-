import type { Express } from "express";
import fs from "fs";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { orderAttachments } from "@shared/schema";
import { getDefaultStatus, getStatuses, normalizeStatusCode } from "../services/statuses";

import { getOrderCustomFields } from "../services/order-custom-fields";
import { normalizeTrackingVisibilityConfig } from "@shared/tracking-config";
import {
  formatMoneyValue,
  parseFileStorageTokens,
  resolveFileFieldBehavior,
  resolveNativeOrderFieldKind,
  shouldDisplayOrderFieldInTracking,
} from "@shared/order-fields";

type TrackingResolveResult = { order: Awaited<ReturnType<typeof storage.getOrderByTrackingId>> } | { status: number; body: { error: string } };

function isImageMimeType(mime: string | null | undefined) {
  return /^image\/(jpeg|jpg|png|webp|gif)$/i.test(String(mime || ""));
}

async function resolvePublicOrder(trackingId: string): Promise<TrackingResolveResult> {
  const order = await storage.getOrderByTrackingId(trackingId);
  if (!order) return { status: 404 as const, body: { error: "Seguimiento no encontrado" } };
  if (order.trackingRevoked) return { status: 410 as const, body: { error: "Link de seguimiento revocado" } };
  if (order.trackingExpiresAt && new Date(order.trackingExpiresAt).getTime() < Date.now()) {
    return { status: 410 as const, body: { error: "El enlace de seguimiento expiró" } };
  }
  return { order };
}

async function buildTrackingPayload(trackingId: string): Promise<{ status: number; body: any }> {
  const resolved = await resolvePublicOrder(trackingId);
  if ("status" in resolved) return resolved;
  const { order } = resolved as { order: NonNullable<Awaited<ReturnType<typeof storage.getOrderByTrackingId>>> };

  const tenantId = order.tenantId;
  const [definitions, defaultStatus, history, publicComments, config, branding, legacyStatuses] = await Promise.all([
    getStatuses(tenantId, "ORDER", true),
    getDefaultStatus(tenantId, "ORDER"),
    storage.getOrderHistory(order.id, tenantId),
    storage.getPublicOrderComments(order.id),
    storage.getConfig(tenantId),
    storage.getTenantBranding(tenantId),
    storage.getOrderStatuses(tenantId),
  ]);

  const definitionsByCode = new Map(definitions.map((s) => [s.code, s]));
  const legacyById = new Map<number, string>(legacyStatuses.map((s) => [s.id, String(s.name || "")]));
  const currentCode = normalizeStatusCode(String(order.statusCode || ""));
  const resolvedCurrent = definitionsByCode.get(currentCode)
    || (defaultStatus ? definitionsByCode.get(defaultStatus.code) : undefined)
    || defaultStatus
    || null;
  // Objective E: only show tenant logo — no Orbia fallback (TrackingView handles null with placeholder icon)
  const logoUrl = branding.logoUrl || null;
  // Objective C: build ToS URL using tenantSlug from JOIN (no extra query)
  const tenantSlug = (order as any).tenantSlug;
  const tosUrl = tenantSlug ? `/t/${tenantSlug}/tos` : null;

  const trackingVisibility = normalizeTrackingVisibilityConfig((branding as any).trackingConfig || {});

  const historyFormatted = history.map((h) => {
    const fallbackLegacyName = legacyById.get(Number((h as any).statusId || 0)) || "";
    const rawCode = String((h as any).statusCode || (h as any).status_code || fallbackLegacyName || "");
    const maybeCode = normalizeStatusCode(rawCode);
    const definition = maybeCode ? definitionsByCode.get(maybeCode) : null;
    const prettifiedCode = maybeCode
      ? maybeCode.toLowerCase().split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
      : "";
    return {
      status: definition?.label || fallbackLegacyName || prettifiedCode || "Sin estado",
      color: definition?.color || "#6B7280",
      date: h.createdAt,
      note: h.note,
    };
  });

  const allCustomFields = await getOrderCustomFields(order.id, tenantId);
  const attachmentIds = allCustomFields
    .flatMap((f) => parseFileStorageTokens(f.fileStorageKey).filter((token) => token.kind === "att").map((token) => token.id));
  const attachments = attachmentIds.length
    ? await db.select().from(orderAttachments).where(and(eq(orderAttachments.orderId, order.id), eq(orderAttachments.tenantId, tenantId), inArray(orderAttachments.id, attachmentIds)))
    : [];
  const attachmentById = new Map(attachments.map((a) => [a.id, a]));

  const publicCustomFields = trackingVisibility.showDynamicFields ? allCustomFields
    .filter((f) => shouldDisplayOrderFieldInTracking({
      id: f.fieldId,
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: String(f.fieldType || ""),
      visibleInTracking: f.visibleInTracking,
      config: (f.config || {}) as Record<string, unknown>,
      isActive: (f as any).isActive !== false,
      deletedAt: (f as any).deletedAt || null,
    }, {
      valueText: f.valueText,
      valueNumber: f.valueNumber,
      fileStorageKey: f.fileStorageKey,
      visibleOverride: f.visibleOverride,
    }))
    .flatMap((f) => {
      const baseField = {
        label: f.label || "Campo",
        fieldType: f.fieldType,
        align: ((f.config as any)?.align as string) || null,
        updatedAt: (f as any).updatedAt || f.createdAt || null,
      };

      if (f.fieldType === "FILE" && f.fileStorageKey) {
        const fileBehavior = resolveFileFieldBehavior(f.config);
        const tokens = parseFileStorageTokens(f.fileStorageKey).filter((token) => token.kind === "att");
        const groupId = `file-field-${f.fieldId}`;
        const groupLabel = f.label || "Adjuntos";

        return tokens.map((token, index) => {
          const attachment = attachmentById.get(token.id);
          const downloadUrl = `/api/public/tracking/${trackingId}/attachments/${token.id}`;
          const mimeType = attachment?.mimeType || null;
          const isImage = isImageMimeType(mimeType);
          return {
            ...baseField,
            value: attachment?.originalName || (isImage ? "Imagen adjunta" : "Archivo adjunto"),
            downloadUrl,
            previewUrl: isImage ? downloadUrl : null,
            mimeType,
            groupId,
            groupLabel,
            slotIndex: index,
            trackingRender: fileBehavior.trackingRender,
          };
        });
      }

      let displayValue: string | null = null;
      if (f.fieldType === "NUMBER") {
        displayValue = f.valueNumber !== null ? String(f.valueNumber) : null;
      } else if (f.fieldType === "MONEY") {
        displayValue = f.valueNumber !== null
          ? formatMoneyValue(f.valueNumber, String((f.config as any)?.currencyCode || "ARS"))
          : null;
      } else {
        displayValue = f.valueText;
      }

      return [{
        ...baseField,
        value: displayValue,
        downloadUrl: null,
        previewUrl: null,
        mimeType: null,
        groupId: null,
        groupLabel: null,
        slotIndex: null,
      }];
    }) : [];

  const safeHistory = trackingVisibility.showStatusHistory ? historyFormatted : [];
  const safeComments = trackingVisibility.showPublicComments ? publicComments : [];
  const fallbackCustomerName = allCustomFields.find((field) => resolveNativeOrderFieldKind({
    fieldKey: field.fieldKey,
    label: field.label,
  }) === "customer" && String(field.valueText || "").trim())?.valueText || "";

  return {
    status: 200,
    body: {
      data: {
        orderNumber: order.orderNumber,
        type: order.type,
        status: resolvedCurrent?.label || resolvedCurrent?.code || "Sin estado",
        statusCode: resolvedCurrent?.code || currentCode || null,
        statusLabel: resolvedCurrent?.label || null,
        statusColor: resolvedCurrent?.color || "#6B7280",
        customerName: order.customerName || fallbackCustomerName || "",
        customerPhone: order.customerPhone || null,
        deliveryAddress: [order.deliveryAddress, order.deliveryCity].filter(Boolean).join(", ") || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt || null,
        scheduledAt: order.scheduledAt,
        closedAt: order.closedAt,
        history: safeHistory,
        publicComments: safeComments.map((c) => ({
          content: c.content,
          date: c.createdAt,
        })),
        customFields: publicCustomFields,
        trackingLayout: ((trackingVisibility as any)?.layout as string) || config?.trackingLayout || "classic",
        trackingTosText: (branding.texts as any)?.trackingFooter || null,
        tosUrl,
        trackingVisibility,
        branding: {
          displayName: branding.displayName,
          logoUrl,
          colors: branding.colors,
          texts: branding.texts,
          links: branding.links,
          trackingConfig: trackingVisibility,
        },
        businessName: branding.displayName,
        logoUrl,
        trackingPrimaryColor: (branding.colors as any)?.primary || "#6366f1",
        trackingAccentColor: (branding.colors as any)?.accent || "#8b5cf6",
        trackingBgColor: (branding.colors as any)?.background || "#ffffff",
      },
    },
  };
}

export function registerTrackingRoutes(app: Express) {
  app.get("/api/public/track/:trackingId", async (req, res) => {
    try {
      const result = await buildTrackingPayload(req.params.trackingId);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[tracking:public]", { trackingId: req.params.trackingId, message: err?.message || String(err) });
      }
      res.status(500).json({ error: "No se pudo resolver el tracking", code: "TRACKING_ERROR" });
    }
  });

  app.get("/api/public/tracking/:trackingId", async (req, res) => {
    try {
      const result = await buildTrackingPayload(req.params.trackingId);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[tracking:public]", { trackingId: req.params.trackingId, message: err?.message || String(err) });
      }
      res.status(500).json({ error: "No se pudo resolver el tracking", code: "TRACKING_ERROR" });
    }
  });

  app.get("/api/public/tracking/:trackingId/attachments/:attachmentId", async (req, res) => {
    try {
      const trackingId = String(req.params.trackingId || "");
      const attachmentId = Number(req.params.attachmentId || 0);
      if (!trackingId || !attachmentId) return res.status(400).json({ error: "Solicitud inválida" });

      const resolved = await resolvePublicOrder(trackingId);
      if ("status" in resolved) return res.status(resolved.status).json(resolved.body);
      const order = resolved.order;

      const [attachment] = await db
        .select()
        .from(orderAttachments)
        .where(and(eq(orderAttachments.id, attachmentId), eq(orderAttachments.orderId, order.id), eq(orderAttachments.tenantId, order.tenantId)))
        .limit(1);
      if (!attachment) return res.status(404).json({ error: "Archivo no encontrado" });

      const fields = await getOrderCustomFields(order.id, order.tenantId);
      const isVisibleAttachment = fields.some((f) => {
        const visible = f.visibleOverride === true || (f.visibleOverride === null && f.visibleInTracking === true);
        return visible && parseFileStorageTokens(f.fileStorageKey).some((token) => token.kind === "att" && token.id === attachment.id);
      });
      if (!isVisibleAttachment) return res.status(403).json({ error: "Archivo no disponible para tracking público" });

      const normalized = path.normalize(attachment.storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
      const absolutePath = path.join(process.cwd(), "storage", normalized);
      if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: "Archivo no encontrado" });

      const mime = attachment.mimeType || "application/octet-stream";
      const inline = isImageMimeType(mime) && String(req.query.download || "") !== "1";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
      res.setHeader("Cache-Control", "public, max-age=300");
      fs.createReadStream(absolutePath).pipe(res);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[tracking:attachment]", { trackingId: req.params.trackingId, attachmentId: req.params.attachmentId, message: err?.message || String(err) });
      }
      res.status(500).json({ error: "No se pudo descargar el archivo", code: "TRACKING_ATTACHMENT_ERROR" });
    }
  });
}
