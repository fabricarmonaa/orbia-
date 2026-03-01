import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { TrackingView, type TrackingOrderData } from "@/components/tracking/TrackingView";
import { useBranding, defaultTenantBranding } from "@/context/BrandingContext";

export default function PublicTracking() {
  const params = useParams<{ id: string }>();
  const { appBranding } = useBranding();
  const [order, setOrder] = useState<TrackingOrderData | null>(null);
  const [branding, setBranding] = useState(defaultTenantBranding);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTracking();
  }, [params.id]);

  async function fetchTracking() {
    try {
      const res = await fetch(`/api/public/tracking/${params.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No encontrado");
      const payload = json.data;
      setOrder({
        orderNumber: payload.orderNumber,
        type: payload.type,
        status: payload.status,
        statusColor: payload.statusColor,
        customerName: payload.customerName,
        createdAt: payload.createdAt,
        scheduledAt: payload.scheduledAt,
        closedAt: payload.closedAt,
        history: payload.history || [],
        publicComments: payload.publicComments || [],
        customFields: payload.customFields || [],
        trackingLayout: payload.trackingLayout || "classic",
        trackingTosText: payload.trackingTosText,
      });
      const payloadBranding = payload.branding || {};
      const logoFallback = payloadBranding.logoUrl || appBranding.orbiaLogoUrl || null;
      setBranding({
        ...defaultTenantBranding,
        ...payloadBranding,
        logoUrl: logoFallback,
        colors: {
          ...defaultTenantBranding.colors,
          ...(payloadBranding.colors || {}),
        },
        texts: {
          ...defaultTenantBranding.texts,
          ...(payloadBranding.texts || {}),
        },
        links: {
          ...defaultTenantBranding.links,
          ...(payloadBranding.links || {}),
        },
        pdfConfig: {
          ...defaultTenantBranding.pdfConfig,
          ...(payloadBranding.pdfConfig || {}),
        },
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <TrackingView
      branding={branding}
      order={order || {
        orderNumber: 0,
        type: "",
        status: "",
        statusColor: "#6B7280",
        customerName: "",
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        closedAt: null,
        history: [],
        publicComments: [],
        customFields: [],
        trackingLayout: "classic",
        trackingTosText: "",
      }}
      appName={appBranding.orbiaName}
      loading={loading}
      error={error}
    />
  );
}
