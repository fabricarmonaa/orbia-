import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageSearch, Clock, AlertCircle, CheckCircle2, ArrowRight, Globe } from "lucide-react";
import type { TenantBranding } from "@/context/BrandingContext";
import { DEFAULT_TRACKING_VISIBILITY, type TrackingVisibilityConfig } from "@shared/tracking-config";

export interface TrackingOrderData {
  orderNumber: number;
  type: string;
  status: string;
  statusCode?: string | null;
  statusLabel?: string | null;
  statusColor: string;
  customerName: string;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  scheduledAt: string | null;
  closedAt: string | null;
  history: Array<{ status: string; color: string; date: string; note: string | null }>;
  publicComments: Array<{ content: string; date: string }>;
  customFields?: Array<{ label: string; value: string | null; fieldType: string; updatedAt?: string | null; downloadUrl?: string | null }>;
  trackingLayout: string;
  trackingTosText?: string | null;
  tosUrl?: string | null;
  trackingVisibility?: Partial<TrackingVisibilityConfig>;
}

interface TrackingViewProps {
  branding: TenantBranding;
  order: TrackingOrderData;
  appName?: string;
  mode?: "public" | "preview";
  error?: string;
  loading?: boolean;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getContrastText(hex: string) {
  const parsed = hex?.startsWith("#") ? hex : "#ffffff";
  const r = parseInt(parsed.slice(1, 3), 16);
  const g = parseInt(parsed.slice(3, 5), 16);
  const b = parseInt(parsed.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a1a" : "#ffffff";
}

function prettifyStatusCode(code?: string | null) {
  const normalized = String(code || "").trim();
  if (!normalized) return "";
  return normalized.toLowerCase().split("_").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export function TrackingView({ branding, order, appName, mode = "public", error, loading }: TrackingViewProps) {
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-4"><div className="w-full max-w-md space-y-4"><div className="h-8 w-48 mx-auto bg-muted rounded-md" /><div className="h-48 w-full rounded-md bg-muted" /><div className="h-32 w-full rounded-md bg-muted" /></div></div>;
  }
  if (error) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-4"><div className="text-center"><AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" /><h1 className="text-xl font-bold mb-2">No disponible</h1><p className="text-muted-foreground">{error}</p></div></div>;
  }

  const v = { ...DEFAULT_TRACKING_VISIBILITY, ...(branding.trackingConfig || {}), ...(order.trackingVisibility || {}) };
  const layout = order.trackingLayout || "classic";
  const renderedStatus = order.statusLabel || order.status || prettifyStatusCode(order.statusCode) || "Sin estado";
  const colors = branding.colors;
  const bgColor = colors.background || "#ffffff";
  const textColor = colors.text || getContrastText(bgColor);
  const mutedText = getContrastText(bgColor) === "#ffffff" ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.56)";

  const infoItems = [
    { show: v.showOrderType, label: "Tipo", value: order.type || "-" },
    { show: v.showCustomerName, label: "Cliente", value: order.customerName || "-" },
    { show: v.showCustomerPhone, label: "Teléfono", value: order.customerPhone || "-" },
    { show: v.showDeliveryAddress, label: "Dirección", value: order.deliveryAddress || "-" },
    { show: v.showCreatedAt, label: "Creado", value: formatDate(order.createdAt) || "-" },
    { show: v.showUpdatedAt, label: "Actualizado", value: formatDate(order.updatedAt) || "-" },
    { show: v.showScheduledAt && !!order.scheduledAt, label: "Programado", value: formatDate(order.scheduledAt) || "-" },
    { show: v.showClosedAt && !!order.closedAt, label: "Cerrado", value: formatDate(order.closedAt) || "-" },
  ].filter((x) => x.show);

  const headerSection = (
    <div className="text-center py-5 rounded-xl" style={{ backgroundColor: colors.trackingHeader }}>
      {v.showLogo && (branding.logoUrl ? <img src={branding.logoUrl} alt={branding.displayName} className="w-14 h-14 rounded-md object-cover mx-auto mb-3" data-testid="img-tracking-logo" /> : <div className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3" style={{ backgroundColor: colors.trackingButton }}><PackageSearch className="w-6 h-6" style={{ color: getContrastText(colors.trackingButton) }} /></div>)}
      <h1 className="text-lg font-bold tracking-tight" style={{ color: getContrastText(colors.trackingHeader) }}>{branding.texts.trackingHeader || "Seguimiento"}</h1>
      {v.showBusinessName && branding.displayName ? <p className="text-sm mt-1" style={{ color: mutedText }}>{branding.displayName}</p> : null}
    </div>
  );

  const orderInfoSection = (
    <Card style={{ borderColor: `${colors.primary}20` }}>
      <CardContent className="pt-6 space-y-5">
        {(v.showOrderNumber || v.showCurrentStatus) && (
          <div className="flex items-center justify-between gap-4">
            {v.showOrderNumber ? <div><p className="text-sm text-muted-foreground">Pedido</p><p className="text-xl font-bold" data-testid="text-tracking-order-number">#{order.orderNumber}</p></div> : <span />}
            {v.showCurrentStatus ? <Badge style={{ backgroundColor: order.statusColor || colors.trackingBadge, color: "#fff" }} className="text-sm" data-testid="badge-tracking-status">{renderedStatus}</Badge> : null}
          </div>
        )}

        {infoItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            {infoItems.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <p className="text-muted-foreground">{item.label}</p>
                <p className="font-medium break-words">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {v.showDynamicFields && order.customFields && order.customFields.length > 0 ? (
          <div className="pt-2 space-y-3">
            <p className="text-sm font-semibold">Datos adicionales</p>
            {order.customFields.map((field, idx) => (
              <div key={`${field.label}-${idx}`} className="rounded-lg border bg-muted/20 p-3.5 space-y-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</p>
                <p className="font-medium break-words">{field.value || "-"}</p>
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  {field.downloadUrl ? <a className="text-xs underline" href={field.downloadUrl} target="_blank" rel="noreferrer">Ver/descargar archivo</a> : <span />}
                  {v.showDynamicFieldUpdatedAt ? <p className="text-xs text-muted-foreground/80">Actualizado: {formatDate(field.updatedAt) || "-"}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  const classicHistory = v.showStatusHistory && order.history.length > 0 && (
    <Card>
      <CardHeader className="pb-3"><h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Historial</h3></CardHeader>
      <CardContent><div className="space-y-4">{order.history.map((h, i) => <div key={i} className="flex gap-3"><div className="flex flex-col items-center"><div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: h.color }} />{i < order.history.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}</div><div className="pb-4"><p className="text-sm font-medium">{h.status}</p><p className="text-xs text-muted-foreground">{formatDate(h.date)}</p>{h.note && <p className="text-sm text-muted-foreground mt-1">{h.note}</p>}</div></div>)}</div></CardContent>
    </Card>
  );

  const cardsHistory = v.showStatusHistory && order.history.length > 0 && (
    <div><h3 className="font-semibold flex items-center gap-2 mb-3"><Clock className="w-4 h-4" />Historial</h3><div className="grid grid-cols-2 gap-3">{order.history.map((h, i) => <Card key={i} style={{ borderLeftColor: h.color, borderLeftWidth: "3px" }}><CardContent className="p-3"><p className="text-sm font-medium">{h.status}</p><p className="text-xs text-muted-foreground">{formatDate(h.date)}</p>{h.note && <p className="text-xs text-muted-foreground mt-1">{h.note}</p>}</CardContent></Card>)}</div></div>
  );

  const stepperHistory = v.showStatusHistory && order.history.length > 0 && (
    <Card><CardHeader className="pb-3"><h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Historial</h3></CardHeader><CardContent><div className="flex items-center gap-1 overflow-x-auto pb-2">{order.history.map((h, i) => <div key={i} className="flex items-center flex-shrink-0"><div className="flex flex-col items-center"><div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: h.color }}><CheckCircle2 className="w-4 h-4 text-white" /></div><p className="text-xs font-medium mt-1 text-center max-w-[80px] truncate">{h.status}</p><p className="text-xs text-muted-foreground">{formatDate(h.date).split(",")[0]}</p></div>{i < order.history.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground mx-1 flex-shrink-0" />}</div>)}</div></CardContent></Card>
  );

  const minimalHistory = v.showStatusHistory && order.history.length > 0 && (
    <div className="space-y-2">{order.history.map((h, i) => <div key={i} className="flex items-center gap-3 py-1.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} /><span className="text-sm font-medium flex-1">{h.status}</span><span className="text-xs text-muted-foreground">{formatDate(h.date)}</span></div>)}</div>
  );

  const historySection = layout === "cards" ? cardsHistory : layout === "stepper" ? stepperHistory : layout === "minimal" ? minimalHistory : classicHistory;

  const commentsSection = v.showPublicComments && order.publicComments.length > 0 && (
    <Card><CardHeader className="pb-3"><h3 className="font-semibold">Notas</h3></CardHeader><CardContent><div className="space-y-3">{order.publicComments.map((c, i) => <div key={i} className="p-3 rounded-md bg-muted/50"><p className="text-sm">{c.content}</p><p className="text-xs text-muted-foreground mt-1">{formatDate(c.date)}</p></div>)}</div></CardContent></Card>
  );

  const hasLinks = v.showSocialLinks && (branding.links?.instagram || branding.links?.whatsapp || branding.links?.web);
  const socialLinksSection = hasLinks && (
    <div className="flex justify-center items-center gap-4 py-2">
      {branding.links.instagram && <a href={branding.links.instagram} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm8.37 1.5H7.88A4.38 4.38 0 0 0 3.5 7.88v8.24A4.38 4.38 0 0 0 7.88 20.5h8.24A4.38 4.38 0 0 0 20.5 16.12V7.88A4.38 4.38 0 0 0 16.12 3.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm5.25-1.9a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z" /></svg></a>}
      {branding.links.whatsapp && <a href={branding.links.whatsapp} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2zM12 20.35a8.38 8.38 0 0 1-4.27-1.16L3.4 20l1.1-4.14A8.34 8.34 0 0 1 3.65 12a8.35 8.35 0 1 1 8.35 8.35z" /></svg></a>}
      {branding.links.web && <a href={branding.links.web} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80 flex items-center justify-center gap-1.5" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="Sitio Web"><Globe className="w-5 h-5" /></a>}
    </div>
  );

  const tosSection = v.showTos ? (() => {
    if (order.tosUrl) return <div className="flex justify-center pt-1"><a href={order.tosUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-opacity hover:opacity-80" style={{ borderColor: `${colors.primary}40`, color: mutedText }} data-testid="link-tracking-tos"><span>Términos y condiciones</span></a></div>;
    if (order.trackingTosText) return <div className="text-xs p-3 rounded-md" style={{ backgroundColor: `${colors.primary}10`, color: mutedText }}>{order.trackingTosText}</div>;
    return null;
  })() : null;

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="max-w-xl mx-auto space-y-5">
        {headerSection}
        {orderInfoSection}
        {historySection}
        {commentsSection}
        {socialLinksSection}
        {tosSection}
        {mode === "public" && v.showPoweredBy && <p className="text-center text-xs py-4" style={{ color: mutedText }}>Powered by {appName || "ORBIA"}</p>}
      </div>
    </div>
  );
}
