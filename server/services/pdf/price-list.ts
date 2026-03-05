import path from "path";
import fs from "fs";
import { storage } from "../../storage";

type PriceListProduct = {
  id: number;
  name: string;
  description?: string | null;
  price: string | number;
  sku?: string | null;
  stock?: number | null;
  stockTotal?: number;
  branchStock?: Array<{ branchName: string; stock: number }>;
};

const ALLOWED_COLUMNS = ["name", "sku", "description", "price", "stock_total", "branch_stock"] as const;
type ColumnKey = (typeof ALLOWED_COLUMNS)[number];

function sanitize(value: string | null | undefined, max: number) {
  if (!value) return "";
  return value.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").slice(0, max);
}

function parseLocalFile(logoUrl?: string | null) {
  if (!logoUrl) return null;
  const clean = logoUrl.split("?")[0];
  if (!clean.startsWith("/uploads/")) return null;
  const filePath = path.join(process.cwd(), clean);
  return fs.existsSync(filePath) ? filePath : null;
}

function resolveColumns(settings: { columns: string[]; showSku: boolean; showDescription: boolean; showBranchStock: boolean }) {
  const unique = Array.from(new Set(settings.columns));
  const filtered = unique.filter((col) => ALLOWED_COLUMNS.includes(col as ColumnKey));
  return filtered.filter((col) => {
    if (col === "sku") return settings.showSku;
    if (col === "description") return settings.showDescription;
    if (col === "branch_stock") return settings.showBranchStock;
    return true;
  }) as ColumnKey[];
}

function formatBranchStock(entries: Array<{ branchName: string; stock: number }>) {
  if (!entries.length) return "—";
  return entries.slice(0, 3).map((e) => `${e.branchName}: ${e.stock}`).join(" | ");
}

// ── Draw document header (logo + business name + date + contact) ──
async function drawDocHeader(
  doc: any,
  branding: any,
  settings: any,
  pageWidth: number,
  title: string,
  subtitle?: string,
) {
  const logoPath = settings.showLogo ? parseLocalFile(branding.logoUrl) : null;
  const ml = doc.page.margins.left;
  const mt = doc.page.margins.top;
  let x = ml;
  let y = mt;

  // Logo
  if (logoPath) {
    try {
      doc.image(logoPath, x, y, { width: 56, height: 56 });
      x += 68;
    } catch {
      // ignore
    }
  }

  const businessName = sanitize(
    settings.headerText || branding.displayName || "Mi Negocio",
    80,
  );
  const subText = sanitize(settings.subheaderText || "", 120);
  const dateStr = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Business name + date right
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111")
    .text(businessName, x, y, { width: pageWidth - (x - ml) - 80 });

  if (subText) {
    doc.font("Helvetica").fontSize(9).fillColor("#555555")
      .text(subText, x, doc.y + 2, { width: pageWidth - (x - ml) - 80 });
  }

  // Contact info from branding links
  const links = branding.links as { whatsapp?: string; instagram?: string; web?: string } || {};
  const contactParts: string[] = [];
  if (links.whatsapp) contactParts.push(`WA: ${links.whatsapp}`);
  if (links.web) contactParts.push(links.web);
  if (contactParts.length) {
    doc.font("Helvetica").fontSize(8).fillColor("#777777")
      .text(contactParts.join("  |  "), x, doc.y + 1, { width: pageWidth - (x - ml) - 80 });
  }

  // Date at top right
  doc.font("Helvetica").fontSize(9).fillColor("#555555")
    .text(dateStr, ml + pageWidth - 90, mt, { width: 90, align: "right" });

  const headerBottom = Math.max(doc.y, mt + 60);

  // Document title box
  doc.rect(ml, headerBottom + 6, pageWidth, 24)
    .fill("#1e293b");
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff")
    .text(title, ml + 8, headerBottom + 11, { width: pageWidth - 16 });

  if (subtitle) {
    doc.rect(ml, headerBottom + 30, pageWidth, 16).fill("#f1f5f9");
    doc.font("Helvetica").fontSize(9).fillColor("#374151")
      .text(subtitle, ml + 8, headerBottom + 35, { width: pageWidth - 16 });
  }

  // Horizontal rule
  const nextY = headerBottom + 30 + (subtitle ? 16 : 0) + 6;
  doc.moveTo(ml, nextY).lineTo(ml + pageWidth, nextY).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

  return nextY + 8;
}

// ── Draw bordered table row ──
function drawTableRow(
  doc: any,
  headers: string[],
  values: string[],
  colWidths: number[],
  x: number,
  y: number,
  rowH: number,
  bg: string,
  isHeader: boolean,
  textColor = "#111111",
  fontSize = 9,
  pageWidth: number,
  ml: number,
) {
  // Row background
  doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowH).fill(bg);

  // Column borders and text
  let cx = x;
  const labels = isHeader ? headers : values;
  const font = isHeader ? "Helvetica-Bold" : "Helvetica";
  for (let i = 0; i < labels.length; i++) {
    const w = colWidths[i];
    // Cell border
    doc.rect(cx, y, w, rowH).stroke("#d1d5db");
    // Text
    doc.font(font).fontSize(fontSize).fillColor(isHeader ? "#ffffff" : textColor)
      .text(labels[i], cx + 4, y + (rowH - fontSize * 1.1) / 2, {
        width: w - 8,
        height: rowH,
        ellipsis: true,
        lineBreak: false,
      });
    cx += w;
  }
}

// ══════════════════════════════════════════════════════════════════
// PRICE LIST PDF
// ══════════════════════════════════════════════════════════════════
export async function generatePriceListPdf(
  tenantId: number,
  options?: {
    products?: PriceListProduct[];
    hasBranches?: boolean;
    watermarkOrbia?: boolean;
    quoteMode?: {
      customer?: { name?: string; company?: string; phone?: string; email?: string };
      discount?: number;
      notes?: string;
      validity?: number;
    };
  },
) {
  const settings = await storage.getTenantPdfSettings(tenantId);
  const branding = await storage.getTenantBranding(tenantId);

  const products: PriceListProduct[] = options?.products || (await storage.getProducts(tenantId) as any);
  const hasBranchMode = options?.hasBranches ?? settings.showBranchStock;
  const stockRows = hasBranchMode && !options?.products ? await storage.getStockSummaryByTenant(tenantId) : [];

  const stockByProduct = new Map<number, Array<{ branchName: string; stock: number }>>();
  const stockTotals = new Map<number, number>();

  for (const row of stockRows) {
    const list = stockByProduct.get(row.productId) || [];
    list.push({ branchName: row.branchName, stock: row.stock });
    stockByProduct.set(row.productId, list);
    stockTotals.set(row.productId, (stockTotals.get(row.productId) || 0) + row.stock);
  }
  if (options?.products) {
    for (const p of options.products) {
      if (p.stockTotal !== undefined) stockTotals.set(p.id, p.stockTotal);
      if (p.branchStock?.length) stockByProduct.set(p.id, p.branchStock);
    }
  }

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: settings.pageSize as any,
    margin: 40,
    layout: settings.orientation === "landscape" ? "landscape" : "portrait",
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));

  const ml = doc.page.margins.left;
  const pageWidth = doc.page.width - ml - doc.page.margins.right;
  const footerText = sanitize(settings.footerText || "", 160);
  const curSym = settings.currencySymbol || "$";

  const isQuote = !!options?.quoteMode;

  // ── TABLE COLUMNS ──────────────────────────────────────────────
  type Col = { key: ColumnKey; label: string; weight: number; align: "left" | "right" };
  let columns: Col[];

  if (isQuote) {
    // Presupuesto columns: Producto, Descripción (if enabled), Cant, Precio unit, Subtotal
    columns = [
      { key: "name", label: "Producto / Servicio", weight: 3, align: "left" },
      ...(settings.showDescription ? [{ key: "description" as ColumnKey, label: "Descripción", weight: 2, align: "left" as const }] : []),
      { key: "stock_total", label: "Cantidad", weight: 1, align: "right" },
      { key: "price", label: "Precio unit.", weight: 1.2, align: "right" },
      { key: "branch_stock", label: "Subtotal", weight: 1.3, align: "right" },
    ];
  } else {
    // Lista de precios: name, sku?, description?, price, stock_total?, branch_stock?
    const resolved = resolveColumns({ columns: settings.columns, showSku: settings.showSku, showDescription: settings.showDescription, showBranchStock: settings.showBranchStock });
    const weights: Record<ColumnKey, number> = { name: 3, sku: 1, description: 2.5, price: 1.2, stock_total: 1, branch_stock: 2 };
    const labels: Record<ColumnKey, string> = {
      name: "Producto / Servicio",
      sku: "SKU",
      description: "Descripción",
      price: settings.priceColumnLabel || "Precio",
      stock_total: "Stock",
      branch_stock: "Stock / sucursal",
    };
    columns = resolved.map((k) => ({ key: k, label: labels[k], weight: weights[k], align: (k === "price" || k === "stock_total") ? "right" : "left" as any }));
  }

  const totalWeight = columns.reduce((s, c) => s + c.weight, 0);
  const colWidths = columns.map((c) => (pageWidth * c.weight) / totalWeight);

  // ── DOCUMENT TITLE ──────────────────────────────────────────────
  let docTitle = isQuote ? "Presupuesto" : (sanitize(settings.headerText, 80) || "Lista de Precios");
  let subtitle: string | undefined;

  if (isQuote) {
    const q = options!.quoteMode!;
    const parts: string[] = [];
    if (q.customer?.name) parts.push(`Cliente: ${q.customer.name}`);
    if (q.customer?.company) parts.push(`Empresa: ${q.customer.company}`);
    if (q.customer?.phone) parts.push(`Tel: ${q.customer.phone}`);
    if (q.customer?.email) parts.push(`Email: ${q.customer.email}`);
    if (q.validity) parts.push(`Validez: ${q.validity} días`);
    subtitle = parts.join("  |  ") || undefined;
  }

  let curY = await drawDocHeader(doc, branding, settings, pageWidth, docTitle, subtitle);

  // ── TABLE HEADER ROW ────────────────────────────────────────────
  const rowH = 22;
  const headerH = 22;
  drawTableRow(doc, columns.map((c) => c.label), [], colWidths, ml, curY, headerH, "#1e293b", true, "#ffffff", 9, pageWidth, ml);
  curY += headerH;

  // ── TABLE BODY ──────────────────────────────────────────────────
  let rowIndex = 0;
  let quoteSubtotal = 0;

  for (const product of products) {
    if (curY + rowH > doc.page.height - doc.page.margins.bottom - 50) {
      doc.addPage();
      curY = doc.page.margins.top;
      drawTableRow(doc, columns.map((c) => c.label), [], colWidths, ml, curY, headerH, "#1e293b", true, "#ffffff", 9, pageWidth, ml);
      curY += headerH;
      rowIndex = 0;
    }

    const bg = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    const qty = product.stockTotal ?? 1;
    const unitPrice = Number(product.price) || 0;
    const rowSubtotal = unitPrice * qty;
    if (isQuote) quoteSubtotal += rowSubtotal;

    const rowVals: Record<ColumnKey, string> = {
      name: sanitize(product.name, 100),
      sku: sanitize(product.sku || "—", 40),
      description: sanitize(product.description || "—", 100),
      price: `${curSym} ${unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      stock_total: isQuote ? String(qty) : String(stockTotals.get(product.id) ?? product.stock ?? 0),
      branch_stock: isQuote
        ? `${curSym} ${rowSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
        : formatBranchStock(stockByProduct.get(product.id) || []),
    };

    const vals = columns.map((c) => rowVals[c.key]);
    drawTableRow(doc, [], vals, colWidths, ml, curY, rowH, bg, false, "#111111", 9, pageWidth, ml);
    curY += rowH;
    rowIndex++;
  }

  // ── QUOTE TOTALS ────────────────────────────────────────────────
  if (isQuote) {
    const q = options!.quoteMode!;
    const discPct = q.discount || 0;
    const discAmt = quoteSubtotal * discPct / 100;
    const total = quoteSubtotal - discAmt;
    const totalsX = ml + pageWidth - 200;
    const tW1 = 120, tW2 = 80;
    curY += 8;

    const totalLines = [
      { label: "Subtotal", val: `${curSym} ${quoteSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` },
      ...(discPct > 0 ? [{ label: `Descuento (${discPct}%)`, val: `- ${curSym} ${discAmt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` }] : []),
      { label: "TOTAL", val: `${curSym} ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, bold: true },
    ];
    for (const tl of totalLines) {
      const h = (tl as any).bold ? 26 : 20;
      const bg = (tl as any).bold ? "#1e293b" : "#f1f5f9";
      const fc = (tl as any).bold ? "#ffffff" : "#111111";
      doc.rect(totalsX, curY, tW1, h).fill(bg).rect(totalsX + tW1, curY, tW2, h).fill(bg);
      doc.rect(totalsX, curY, tW1 + tW2, h).stroke("#d1d5db");
      doc.font((tl as any).bold ? "Helvetica-Bold" : "Helvetica").fontSize((tl as any).bold ? 11 : 9).fillColor(fc)
        .text(tl.label, totalsX + 4, curY + (h - 9) / 2, { width: tW1 - 8 })
        .font("Helvetica-Bold").fontSize((tl as any).bold ? 11 : 9).fillColor(fc)
        .text(tl.val, totalsX + tW1, curY + (h - 9) / 2, { width: tW2 - 4, align: "right" });
      curY += h;
    }

    if (q.notes) {
      curY += 10;
      doc.rect(ml, curY, pageWidth, 1).fill("#e5e7eb");
      curY += 6;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151").text("Observaciones:", ml, curY);
      curY += 13;
      doc.font("Helvetica").fontSize(9).fillColor("#555555").text(sanitize(q.notes, 600), ml, curY, { width: pageWidth });
    }
  }

  // ── FOOTER ──────────────────────────────────────────────────────
  if (footerText) {
    const fy = doc.page.height - doc.page.margins.bottom - 18;
    doc.moveTo(ml, fy - 4).lineTo(ml + pageWidth, fy - 4).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor("#888888").text(footerText, ml, fy, { width: pageWidth, align: "center" });
  }

  // Economic watermark
  if (options?.watermarkOrbia) {
    const wy = doc.page.height - doc.page.margins.bottom - 36;
    doc.save().opacity(0.14).font("Helvetica-Bold").fontSize(10).fillColor("#6b7280").text("ORBIA", ml, wy).restore();
  }

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
