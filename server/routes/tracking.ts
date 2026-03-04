import type { Express } from "express";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { orderAttachments, entityVisibilitySettings } from "@shared/schema";

import { getOrderCustomFields } from "../services/order-custom-fields";
import { mergeTrackingSettings } from "@shared/tracking-settings";

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
  const statuses = await storage.getOrderStatuses(tenantId);
  const currentStatus = statuses.find((s) => s.id === order.statusId);
  const history = await storage.getOrderHistory(order.id, tenantId);
  const publicComments = await storage.getPublicOrderComments(order.id);
  const config = await storage.getConfig(tenantId);
  const branding = await storage.getTenantBranding(tenantId);
  const legacyTrackingSettings = mergeTrackingSettings((config as any)?.trackingSettings as Record<string, unknown> | undefined);
  const [visibility] = await db.select().from(entityVisibilitySettings).where(and(eq(entityVisibilitySettings.tenantId, tenantId), eq(entityVisibilitySettings.entityType, "ORDER")));
  // Canon ETAPA 11.4: tracking público lee canónicamente desde entity_visibility_settings.
  // Compatibilidad: si no existe fila en la tabla nueva, se cae a tracking_settings legado.
  const visibilitySettings = visibility?.settings
    ? (visibility.settings as Record<string, unknown>)
    : {
      showOrderNumber: legacyTrackingSettings.showOrderNumber,
      showType: legacyTrackingSettings.showOrderType,
      showFullHistory: legacyTrackingSettings.showHistory,
      showHistoryTimestamps: legacyTrackingSettings.showDates,
      showTosButton: true,
    };
  const effectiveTrackingSettings = {
    ...legacyTrackingSettings,
    showOrderNumber: visibilitySettings.showOrderNumber !== false,
    showOrderType: visibilitySettings.showType !== false,
    showOnlyCurrentStatus: visibilitySettings.showFullHistory === false,
    showHistory: visibilitySettings.showFullHistory !== false,
    showDates: visibilitySettings.showHistoryTimestamps !== false,
  };
  const showTosButton = visibilitySettings.showTosButton !== false;
  const logoUrl = branding.logoUrl || null;

  const historyFormatted = history.map((h) => {
    const s = statuses.find((st) => st.id === h.statusId);
    return {
      status: s?.name || "Desconocido",
      color: s?.color || "#6B7280",
      date: h.createdAt,
      note: h.note,
    };
  });

  const allCustomFields = await getOrderCustomFields(order.id, tenantId);
  const publicCustomFields = allCustomFields
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
      } else if (f.fieldType === "BOOLEAN") {
        displayValue = f.valueBool === null ? null : (f.valueBool ? "Sí" : "No");
      } else if (f.fieldType === "DATE") {
        displayValue = f.valueDate ? String(f.valueDate) : null;
      } else if (f.fieldType === "SELECT") {
        displayValue = (f.valueJson && typeof f.valueJson === "object") ? String((f.valueJson as any).label || (f.valueJson as any).value || "") : null;
      } else if (f.fieldType === "MONEY") {
        const amount = f.valueMoneyAmount != null ? Number(f.valueMoneyAmount) : null;
        if (amount !== null && !Number.isNaN(amount)) {
          const sign = Number(f.valueMoneyDirection || 1) >= 0 ? "+" : "-";
          const currency = (f.currency || "ARS").toUpperCase();
          displayValue = `${sign}$${Math.abs(amount).toLocaleString("es-AR")} ${currency}`;
        } else {
          displayValue = null;
        }
      } else {
        displayValue = f.valueText;
      }

      return {
        label: f.label || "Campo",
        value: displayValue,
        fieldType: f.fieldType,
        updatedAt: f.createdAt || null,
        downloadUrl,
      };
    });

  return {
    status: 200,
    body: {
      data: {
        orderNumber: order.orderNumber,
        type: order.type,
        status: currentStatus?.name || "Sin estado",
        statusColor: currentStatus?.color || "#6B7280",
        customerName: order.customerName || "",
        createdAt: order.createdAt,
        scheduledAt: order.scheduledAt,
        closedAt: order.closedAt,
        history: historyFormatted,
        publicComments: publicComments.map((c) => ({
          content: c.content,
          date: c.createdAt,
        })),
        customFields: publicCustomFields,
        trackingLayout: config?.trackingLayout || "classic",
        trackingTosText: (branding.texts as any)?.trackingFooter || null,
        trackingSettings: effectiveTrackingSettings,
        tosUrl: showTosButton ? `/tos/${trackingId}` : null,
        branding: {
          displayName: branding.displayName,
          logoUrl,
          colors: branding.colors,
          texts: branding.texts,
          links: branding.links,
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
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/tracking/:trackingId", async (req, res) => {
    try {
      const result = await buildTrackingPayload(req.params.trackingId);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/tos/:trackingId", async (req, res) => {
    try {
      const trackingId = String(req.params.trackingId || "");
      const resolved = await resolvePublicOrder(trackingId);
      if ("status" in resolved) return res.status(resolved.status).json(resolved.body);
      const tenant = await storage.getTenantById(resolved.order.tenantId);
      if (!tenant?.tosContent) {
        return res.status(404).json({ error: "No hay términos cargados para este negocio.", code: "TOS_NOT_FOUND" });
      }
      const branding = await storage.getTenantBranding(resolved.order.tenantId);
      return res.json({
        data: {
          companyName: branding.displayName || tenant.name,
          logoUrl: branding.logoUrl || null,
          tosContent: tenant.tosContent,
          updatedAt: tenant.tosUpdatedAt,
        },
      });
    } catch {
      return res.status(500).json({ error: "No se pudieron cargar los términos.", code: "PUBLIC_TOS_ERROR" });
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
      res.status(500).json({ error: "No se pudo descargar el archivo" });
    }
  });
}
