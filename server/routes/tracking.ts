import type { Express } from "express";
import { storage } from "../storage";

import { getOrderCustomFields } from "../services/order-custom-fields";

async function buildTrackingPayload(trackingId: string, reqBaseUrl: string) {
  const order = await storage.getOrderByTrackingId(trackingId);
  if (!order) return { status: 404, body: { error: "Seguimiento no encontrado" } };
  if (order.trackingRevoked) return { status: 410, body: { error: "Link de seguimiento revocado" } };
  if (order.trackingExpiresAt && new Date(order.trackingExpiresAt) < new Date()) return { status: 410, body: { error: "Link de seguimiento expirado" } };

  const tenantId = order.tenantId;
  const statuses = await storage.getOrderStatuses(tenantId);
  const currentStatus = statuses.find((s) => s.id === order.statusId);
  const history = await storage.getOrderHistory(order.id, tenantId);
  const publicComments = await storage.getPublicOrderComments(order.id);
  const config = await storage.getConfig(tenantId);
  const branding = await storage.getTenantBranding(tenantId);
  const appBranding = await storage.getAppBranding();
  const logoUrl = branding.logoUrl || appBranding.orbiaLogoUrl || null;

  const historyFormatted = history.map((h) => {
    const s = statuses.find((st) => st.id === h.statusId);
    return {
      status: s?.name || "Desconocido",
      color: s?.color || "#6B7280",
      date: h.createdAt,
      note: h.note,
    };
  });

  // Fetch and filter custom fields based on visibility rules
  const allCustomFields = await getOrderCustomFields(order.id, tenantId);
  const publicCustomFields = allCustomFields
    .filter((f) => {
      // visible_override = true OR (visible_override IS NULL AND visible_in_tracking = true)
      if (f.visibleOverride === true) return true;
      if (f.visibleOverride === false) return false;
      return f.visibleInTracking;
    })
    .map((f) => {
      // For FILE fields, transform the raw file storage key
      // If visible, they should see "Archivo Adjunto", but without the API we don't expose 
      // direct auth-download. We just expose the attachment ID string for the frontend to show 
      let displayValue: string | null = null;
      if (f.fieldType === "FILE" && f.fileStorageKey) {
        // Just return the attachment ID reference (e.g. "att:123"). Since we don't have
        // public download endpoint right now as per plan, we'll just expose the flag.
        displayValue = "Archivo adjunto";
      } else if (f.fieldType === "NUMBER") {
        displayValue = f.valueNumber !== null ? String(f.valueNumber) : null;
      } else {
        displayValue = f.valueText;
      }

      return {
        label: f.label || "Campo",
        value: displayValue,
        fieldType: f.fieldType,
        updatedAt: f.createdAt || null,
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
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const result = await buildTrackingPayload(req.params.trackingId, baseUrl);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/tracking/:trackingId", async (req, res) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const result = await buildTrackingPayload(req.params.trackingId, baseUrl);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
