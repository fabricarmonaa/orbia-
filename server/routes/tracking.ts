import type { Express } from "express";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { orderAttachments } from "@shared/schema";
import { getDefaultStatus, getStatuses, normalizeStatusCode } from "../services/statuses";

import { getOrderCustomFields } from "../services/order-custom-fields";
import { normalizeTrackingVisibilityConfig } from "@shared/tracking-config";

type TrackingResolveResult = { order: Awaited<ReturnType<typeof storage.getOrderByTrackingId>> } | { status: number; body: { error: string } };

async function resolvePublicOrder(trackingId: string): Promise<TrackingResolveResult> {
  const order = await storage.getOrderByTrackingId(trackingId);
  if (!order) return { status: 404 as const, body: { error: "Seguimiento no encontrado" } };
  if (order.trackingRevoked) return { status: 410 as const, body: { error: "Link de seguimiento revocado" } };
  if (order.trackingExpiresAt && new Date(order.trackingExpiresAt) < new Date()) return { status: 410 as const, body: { error: "Link de seguimiento expirado" } };
  return { order };
}

async function buildTrackingPayload(trackingId: string): Promise<{ status: number; body: any }> {
  const resolved = await resolvePublicOrder(trackingId);
  if ("status" in resolved) return resolved;
  const { order } = resolved as { order: NonNullable<Awaited<ReturnType<typeof storage.getOrderByTrackingId>>> };

  const tenantId = order.tenantId;
  const [definitions, defaultStatus, history, publicComments, config, branding] = await Promise.all([
    getStatuses(tenantId, "ORDER", true),
    getDefaultStatus(tenantId, "ORDER"),
    storage.getOrderHistory(order.id, tenantId),
    storage.getPublicOrderComments(order.id),
    storage.getConfig(tenantId),
    storage.getTenantBranding(tenantId),
  ]);

  const definitionsByCode = new Map(definitions.map((s) => [s.code, s]));
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
    const maybeCode = normalizeStatusCode(String((h as any).statusCode || (h as any).status_code || ""));
    const s = maybeCode ? definitionsByCode.get(maybeCode) : null;
    return {
      status: s?.label || s?.code || "Desconocido",
      color: s?.color || "#6B7280",
      date: h.createdAt,
      note: h.note,
    };
  });

  const allCustomFields = await getOrderCustomFields(order.id, tenantId);
  const publicCustomFields = trackingVisibility.showDynamicFields ? allCustomFields
    .filter((f) => {
      if (f.visibleOverride === true) return true;
      if (f.visibleOverride === false) return false;
      return f.visibleInTracking;
    })
    .map((f) => {
      let displayValue: string | null = null;
      let downloadUrl: string | null = null;
      if (f.fieldType === "FILE" && f.fileStorageKey) {
        const match = String(f.fileStorageKey).match(/^att:(\d+)$/);
        if (match) {
          const attachmentId = Number(match[1]);
          downloadUrl = `/api/public/tracking/${trackingId}/attachments/${attachmentId}`;
          displayValue = "Archivo adjunto";
        }
      } else if (f.fieldType === "NUMBER") {
        displayValue = f.valueNumber !== null ? String(f.valueNumber) : null;
      } else {
        displayValue = f.valueText;
      }

      return {
        label: f.label || "Campo",
        value: displayValue,
        fieldType: f.fieldType,
        updatedAt: (f as any).updatedAt || f.createdAt || null,
        downloadUrl,
      };
    }) : [];

  const safeHistory = trackingVisibility.showStatusHistory ? historyFormatted : [];
  const safeComments = trackingVisibility.showPublicComments ? publicComments : [];

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
        customerName: order.customerName || "",
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
        trackingLayout: config?.trackingLayout || "classic",
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
        return visible && String(f.fileStorageKey || "") === `att:${attachment.id}`;
      });
      if (!isVisibleAttachment) return res.status(403).json({ error: "Archivo no disponible para tracking público" });

      const normalized = path.normalize(attachment.storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
      const absolutePath = path.join(process.cwd(), "storage", normalized);
      if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: "Archivo no encontrado" });

      res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
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
