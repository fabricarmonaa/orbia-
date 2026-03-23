import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackingView } from "./TrackingView";

test("aplica alineación visible en header, comentarios y footer", () => {
  const html = renderToStaticMarkup(
    <TrackingView
      branding={{
        displayName: "Orbia Test",
        logoUrl: null,
        colors: {
          background: "#fff",
          text: "#111827",
          surface: "#fff",
          border: "#e5e7eb",
          primary: "#111827",
          accent: "#6366f1",
          timeline: "#6366f1",
          trackingHeader: "#111827",
          trackingButton: "#6366f1",
          trackingBadge: "#6366f1",
        },
        texts: { trackingHeader: "Seguimiento", trackingThanks: "Gracias" },
        links: {},
        trackingConfig: { blockAlignments: { header: "center", comments: "right", footer: "right" }, dynamicFieldsAlign: "left" },
      } as any}
      order={{
        orderNumber: 99,
        type: "PEDIDO",
        status: "Pendiente",
        statusColor: "#6366f1",
        customerName: "Ana",
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        closedAt: null,
        history: [],
        publicComments: [{ content: "Comentario público", date: new Date().toISOString() }],
        customFields: [],
        trackingLayout: "classic",
        trackingVisibility: { showPublicComments: true, blockAlignments: { header: "center", comments: "right", footer: "right" } },
      } as any}
      mode="public"
    />
  );

  assert.match(html, /text-align:center/);
  assert.match(html, /Comentario público/);
  assert.match(html, /text-align:right/);
  assert.match(html, /Gracias/);
});

test("respeta los colores por estado en badge e historial", () => {
  const html = renderToStaticMarkup(
    <TrackingView
      branding={{
        displayName: "Orbia Test",
        logoUrl: null,
        colors: {
          background: "#fff",
          text: "#111827",
          surface: "#fff",
          border: "#e5e7eb",
          primary: "#111827",
          accent: "#6366f1",
          timeline: "#6366f1",
          trackingHeader: "#111827",
          trackingButton: "#6366f1",
          trackingBadge: "#6366f1",
        },
        texts: { trackingHeader: "Seguimiento", trackingThanks: "Gracias" },
        links: {},
        trackingConfig: {},
      } as any}
      order={{
        orderNumber: 100,
        type: "PEDIDO",
        status: "En camino",
        statusColor: "#f59e0b",
        customerName: "Ana",
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        closedAt: null,
        history: [
          { status: "Recibido", color: "#3b82f6", date: new Date().toISOString(), note: null },
          { status: "En camino", color: "#f59e0b", date: new Date().toISOString(), note: "Sale del local" },
        ],
        publicComments: [],
        customFields: [],
        trackingLayout: "classic",
        trackingVisibility: { showStatusHistory: true },
      } as any}
      mode="public"
    />
  );

  assert.match(html, /background-color:#f59e0b/);
  assert.match(html, /background-color:#3b82f6/);
  assert.match(html, /Sale del local/);
});
