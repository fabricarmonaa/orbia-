import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageSearch, Clock, AlertCircle, CheckCircle2, ArrowRight, Globe, FileText, Download } from "lucide-react";
import type { TenantBranding } from "@/context/BrandingContext";
import { DEFAULT_TRACKING_BLOCK_ORDER, DEFAULT_TRACKING_VISIBILITY, type TrackingDisplayConfig, type TrackingVisibilityConfig } from "@shared/tracking-config";

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
  customFields?: Array<{
    label: string;
    value: string | null;
    fieldType: string;
    updatedAt?: string | null;
    downloadUrl?: string | null;
    previewUrl?: string | null;
    mimeType?: string | null;
    align?: "left" | "center" | "right" | null;
    groupId?: string | null;
    groupLabel?: string | null;
    slotIndex?: number | null;
  }>;
  trackingLayout: string;
  trackingTosText?: string | null;
  tosUrl?: string | null;
  trackingVisibility?: Partial<TrackingDisplayConfig>;
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
  return lum > 0.5 ? "#111827" : "#ffffff";
}

function prettifyStatusCode(code?: string | null) {
  const normalized = String(code || "").trim();
  if (!normalized) return "";
  return normalized.toLowerCase().split("_").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function isImageAttachment(field: NonNullable<TrackingOrderData["customFields"]>[number]) {
  if (field.previewUrl) return true;
  return typeof field.mimeType === "string" && field.mimeType.startsWith("image/");
}

function normalizeAlignment(value?: string | null): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function justifyForAlignment(value: "left" | "center" | "right") {
  if (value === "center") return "center";
  if (value === "right") return "flex-end";
  return "flex-start";
}

export function TrackingView({ branding, order, appName, mode = "public", error, loading }: TrackingViewProps) {
  if (loading) return <div className="min-h-screen flex items-center justify-center p-4">Cargando...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center p-4"><div className="text-center"><AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" /><p>{error}</p></div></div>;

  const v = { ...DEFAULT_TRACKING_VISIBILITY, ...(branding.trackingConfig || {}), ...(order.trackingVisibility || {}) } as TrackingDisplayConfig;
  const layout = (order.trackingLayout || v.layout || "classic") as "classic" | "cards" | "stepper" | "minimal";
  const renderedStatus = order.statusLabel || order.status || prettifyStatusCode(order.statusCode) || "Sin estado";
  const colors = branding.colors;
  const bgColor = colors.background || "#ffffff";
  const textColor = colors.text || getContrastText(bgColor);
  const surfaceColor = colors.surface || "#ffffff";
  const borderColor = colors.border || "#e5e7eb";
  const mutedText = colors.textSecondary || (getContrastText(bgColor) === "#ffffff" ? "rgba(255,255,255,0.70)" : "#4b5563");
  const timelineColor = colors.timeline || colors.accent || colors.primary;
  const blockOrder = Array.isArray(v.blockOrder) && v.blockOrder.length ? v.blockOrder : [...DEFAULT_TRACKING_BLOCK_ORDER];
  const blockAlignments = (v.blockAlignments || {}) as Record<string, "left" | "center" | "right">;
  const headerAlignment = normalizeAlignment(blockAlignments.header);
  const summaryAlignment = normalizeAlignment(blockAlignments.summary);
  const historyAlignment = normalizeAlignment(blockAlignments.history);
  const commentsAlignment = normalizeAlignment(blockAlignments.comments);
  const tosAlignment = normalizeAlignment(blockAlignments.tos);
  const socialAlignment = normalizeAlignment(blockAlignments.social);
  const footerAlignment = normalizeAlignment(blockAlignments.footer);

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

  const cardBase = { backgroundColor: surfaceColor, borderColor };

  const headerSection = (
    <div className="py-6 px-4 rounded-xl" style={{ backgroundColor: colors.trackingHeader, textAlign: headerAlignment }}>
      {v.showLogo && (branding.logoUrl ? <img src={branding.logoUrl} alt={branding.displayName} className="w-14 h-14 rounded-md object-cover mb-3" style={{ marginLeft: headerAlignment === "right" ? "auto" : headerAlignment === "center" ? "auto" : undefined, marginRight: headerAlignment === "left" ? "auto" : headerAlignment === "center" ? "auto" : undefined }} data-testid="img-tracking-logo" /> : <div className="inline-flex items-center justify-center w-12 h-12 rounded-md mb-3" style={{ backgroundColor: colors.trackingButton, marginLeft: headerAlignment === "right" ? "auto" : headerAlignment === "center" ? "auto" : undefined, marginRight: headerAlignment === "left" ? "auto" : headerAlignment === "center" ? "auto" : undefined }}><PackageSearch className="w-6 h-6" style={{ color: getContrastText(colors.trackingButton) }} /></div>)}
      <h1 className="text-xl font-bold tracking-tight" style={{ color: getContrastText(colors.trackingHeader) }}>{branding.texts.trackingHeader || "Seguimiento"}</h1>
      {branding.texts.trackingSubtitle ? <p className="text-sm mt-1" style={{ color: getContrastText(colors.trackingHeader) === "#ffffff" ? "rgba(255,255,255,0.75)" : "rgba(17,24,39,0.7)" }}>{branding.texts.trackingSubtitle}</p> : null}
      {v.showBusinessName && branding.displayName ? <p className="text-sm mt-2" style={{ color: getContrastText(colors.trackingHeader) === "#ffffff" ? "rgba(255,255,255,0.75)" : "rgba(17,24,39,0.7)" }}>{branding.displayName}</p> : null}
    </div>
  );

  const summarySection = (
    <Card style={cardBase}>
      <CardContent className="pt-6 space-y-5">
        {(v.showOrderNumber || v.showCurrentStatus) && (
          <div className="flex items-center gap-4 flex-wrap" style={{ justifyContent: summaryAlignment === "center" ? "center" : "space-between", textAlign: summaryAlignment }}>
            {v.showOrderNumber ? <div><p className="text-sm" style={{ color: mutedText }}>Pedido</p><p className="text-2xl font-bold" data-testid="text-tracking-order-number">#{order.orderNumber}</p></div> : <span />}
            {v.showCurrentStatus ? <Badge style={{ backgroundColor: order.statusColor || colors.trackingBadge, color: "#fff" }} className="text-sm" data-testid="badge-tracking-status">{renderedStatus}</Badge> : null}
          </div>
        )}
        {infoItems.length > 0 && (
          <div className={layout === "cards" ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
            {infoItems.map((it) => (
              <div key={it.label} className="rounded-md p-3" style={{ backgroundColor: layout === "minimal" ? "transparent" : `${colors.primary}0F`, border: layout === "minimal" ? `1px solid ${borderColor}` : "none", textAlign: summaryAlignment }}>
                <p className="text-xs" style={{ color: mutedText }}>{it.label}</p>
                <p className="text-sm font-medium mt-1">{it.value}</p>
              </div>
            ))}
          </div>
        )}
        {v.showDynamicFields && order.customFields && order.customFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Datos adicionales</p>
            <div className="space-y-2">
              {(() => {
                const grouped = new Map<string, {
                  key: string;
                  label: string;
                  align: "left" | "center" | "right";
                  items: NonNullable<TrackingOrderData["customFields"]>;
                }>();
                (order.customFields || []).forEach((field, idx) => {
                  const align = normalizeAlignment(field.align || v.dynamicFieldsAlign);
                  const groupKey = field.fieldType === "FILE" ? (field.groupId || `file-${idx}`) : `value-${idx}`;
                  const label = field.groupLabel || field.label;
                  if (!grouped.has(groupKey)) grouped.set(groupKey, { key: groupKey, label, align, items: [] as NonNullable<TrackingOrderData["customFields"]> });
                  grouped.get(groupKey)!.items.push(field);
                });

                return Array.from(grouped.values()).map((group, idx) => {
                  const images = (group.items || [])
                    .filter((f) => f.fieldType === "FILE" && isImageAttachment(f))
                    .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
                  const documents = (group.items || [])
                    .filter((f) => f.fieldType === "FILE" && !isImageAttachment(f))
                    .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
                  const firstUpdatedAt = group.items?.find((f) => f.updatedAt)?.updatedAt;

                  return (
                    <div key={`${group.key}-${idx}`} className="rounded-md p-3 space-y-2" style={{ backgroundColor: `${colors.accent}14`, textAlign: group.align }}>
                      <p className="text-xs" style={{ color: mutedText }}>{group.label}</p>

                      {images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" style={{ justifyItems: justifyForAlignment(group.align) }}>
                          {images.map((img, imageIdx) => (
                            <a
                              key={`${group.key}-img-${imageIdx}`}
                              href={img.downloadUrl || img.previewUrl || "#"}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block rounded-md overflow-hidden border aspect-square bg-black/5"
                              style={{ borderColor }}
                              title={img.value || group.label}
                            >
                              <img src={img.previewUrl || img.downloadUrl || ""} alt={group.label} className="w-full h-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      ) : null}

                      {documents.length > 0 ? (
                        <div className="space-y-2">
                          {documents.map((doc, docIdx) => (
                            <a
                              key={`${group.key}-doc-${docIdx}`}
                              href={doc.downloadUrl || "#"}
                              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                              style={{ borderColor, justifyContent: group.align === "right" ? "flex-end" : group.align === "center" ? "center" : "space-between" }}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: mutedText }} />
                                <span className="truncate">{doc.value || "Archivo adjunto"}</span>
                              </span>
                              <Download className="w-4 h-4 flex-shrink-0" style={{ color: colors.primary }} />
                            </a>
                          ))}
                        </div>
                      ) : null}

                      {images.length === 0 && documents.length === 0 ? <p className="text-sm font-medium">{group.items?.[0]?.value || "-"}</p> : null}

                      {v.showDynamicFieldUpdatedAt && firstUpdatedAt ? <p className="text-xs mt-1" style={{ color: mutedText }}>Actualizado: {formatDate(firstUpdatedAt)}</p> : null}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const classicHistory = v.showStatusHistory && order.history.length > 0 && (
    <Card style={cardBase}><CardHeader className="pb-3"><h3 className="font-semibold flex items-center gap-2" style={{ justifyContent: justifyForAlignment(historyAlignment), textAlign: historyAlignment }}><Clock className="w-4 h-4" />Historial</h3></CardHeader><CardContent><div className="space-y-1">{order.history.map((h, i) => <div key={i} className="flex gap-3" style={{ textAlign: historyAlignment, justifyContent: justifyForAlignment(historyAlignment) }}><div className="flex flex-col items-center"><div className="w-3 h-3 rounded-full mt-1" style={{ backgroundColor: h.color || timelineColor }} />{i < order.history.length - 1 && <div className="w-px flex-1 mt-1" style={{ backgroundColor: timelineColor }} />}</div><div className="pb-4"><p className="text-sm font-medium">{h.status}</p><p className="text-xs" style={{ color: mutedText }}>{formatDate(h.date)}</p>{h.note && <p className="text-sm mt-1" style={{ color: mutedText }}>{h.note}</p>}</div></div>)}</div></CardContent></Card>
  );

  const cardsHistory = v.showStatusHistory && order.history.length > 0 && (
    <div><h3 className="font-semibold flex items-center gap-2 mb-3" style={{ justifyContent: justifyForAlignment(historyAlignment), textAlign: historyAlignment }}><Clock className="w-4 h-4" />Historial</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{order.history.map((h, i) => <Card key={i} style={{ ...cardBase, borderLeftColor: h.color || timelineColor, borderLeftWidth: "4px", textAlign: historyAlignment }}><CardContent className="p-3"><p className="text-sm font-medium">{h.status}</p><p className="text-xs" style={{ color: mutedText }}>{formatDate(h.date)}</p>{h.note && <p className="text-xs mt-1" style={{ color: mutedText }}>{h.note}</p>}</CardContent></Card>)}</div></div>
  );

  const stepperHistory = v.showStatusHistory && order.history.length > 0 && (
    <Card style={cardBase}><CardHeader className="pb-3"><h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Historial</h3></CardHeader><CardContent><div className="flex items-center gap-1 overflow-x-auto pb-2">{order.history.map((h, i) => <div key={i} className="flex items-center flex-shrink-0"><div className="flex flex-col items-center"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: h.color || timelineColor }}><CheckCircle2 className="w-4 h-4 text-white" /></div><p className="text-xs font-medium mt-1 text-center max-w-[90px] truncate">{h.status}</p><p className="text-xs" style={{ color: mutedText }}>{formatDate(h.date).split(",")[0]}</p></div>{i < order.history.length - 1 && <ArrowRight className="w-4 h-4 mx-1 flex-shrink-0" style={{ color: timelineColor }} />}</div>)}</div></CardContent></Card>
  );

  const minimalHistory = v.showStatusHistory && order.history.length > 0 && (
    <div className="space-y-2 rounded-xl p-4" style={{ backgroundColor: surfaceColor, border: `1px solid ${borderColor}` }}>{order.history.map((h, i) => <div key={i} className="flex items-center gap-3 py-1.5" style={{ borderBottom: i === order.history.length - 1 ? "none" : `1px solid ${borderColor}` }}><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color || timelineColor }} /><span className="text-sm font-medium flex-1">{h.status}</span><span className="text-xs" style={{ color: mutedText }}>{formatDate(h.date)}</span></div>)}</div>
  );

  const historySection = layout === "cards" ? cardsHistory : layout === "stepper" ? stepperHistory : layout === "minimal" ? minimalHistory : classicHistory;

  const commentsSection = v.showPublicComments && order.publicComments.length > 0 && (
    <Card style={cardBase}><CardHeader className="pb-3"><h3 className="font-semibold" style={{ textAlign: commentsAlignment }}>Observaciones</h3></CardHeader><CardContent><div className="space-y-3">{order.publicComments.map((c, i) => <div key={i} className="p-3 rounded-md" style={{ backgroundColor: `${colors.accent}12`, textAlign: commentsAlignment }}><p className="text-sm">{c.content}</p><p className="text-xs mt-1" style={{ color: mutedText }}>{formatDate(c.date)}</p></div>)}</div></CardContent></Card>
  );

  const hasLinks = v.showSocialLinks && (branding.links?.instagram || branding.links?.whatsapp || branding.links?.web);
  const socialLinksSection = hasLinks && (
    <div className="flex items-center gap-4 py-2" style={{ justifyContent: justifyForAlignment(socialAlignment) }}>
      {branding.links.instagram && <a href={branding.links.instagram} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm8.37 1.5H7.88A4.38 4.38 0 0 0 3.5 7.88v8.24A4.38 4.38 0 0 0 7.88 20.5h8.24A4.38 4.38 0 0 0 20.5 16.12V7.88A4.38 4.38 0 0 0 16.12 3.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm5.25-1.9a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z" /></svg></a>}
      {branding.links.whatsapp && <a href={branding.links.whatsapp} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2zM12 20.35a8.38 8.38 0 0 1-4.27-1.16L3.4 20l1.1-4.14A8.34 8.34 0 0 1 3.65 12a8.35 8.35 0 1 1 8.35 8.35z" /></svg></a>}
      {branding.links.web && <a href={branding.links.web} target="_blank" rel="noreferrer noopener" className="p-2 rounded-full transition-opacity hover:opacity-80 flex items-center justify-center gap-1.5" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }} title="Sitio Web"><Globe className="w-5 h-5" /></a>}
    </div>
  );

  const tosSection = v.showTos ? (() => {
    if (order.tosUrl) return <div className="flex pt-1" style={{ justifyContent: justifyForAlignment(tosAlignment) }}><a href={order.tosUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-opacity hover:opacity-80" style={{ borderColor: `${colors.primary}40`, color: mutedText }} data-testid="link-tracking-tos"><span>Términos y condiciones</span></a></div>;
    if (order.trackingTosText) return <div className="text-xs p-3 rounded-md" style={{ backgroundColor: `${colors.primary}10`, color: mutedText, textAlign: tosAlignment }}>{order.trackingTosText}</div>;
    return null;
  })() : null;

  const footerSection = mode === "public" && v.showPoweredBy ? <p className="text-xs py-4" style={{ color: mutedText, textAlign: footerAlignment }}>{branding.texts.trackingThanks || "Gracias por tu compra"} · Powered by {appName || "ORBIA"}</p> : null;

  const blocks: Record<string, React.ReactNode> = {
    header: headerSection,
    summary: summarySection,
    history: historySection,
    comments: commentsSection,
    tos: tosSection,
    social: socialLinksSection,
    footer: footerSection,
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 flex justify-center" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className={layout === "stepper" ? "w-full max-w-4xl space-y-5" : "w-full max-w-3xl space-y-5"}>
        {blockOrder.map((id) => {
          const alignment = normalizeAlignment(blockAlignments[id]);
          return <div key={id} className="w-full" style={{ textAlign: alignment }}>{blocks[id]}</div>;
        })}
      </div>
    </div>
  );
}
