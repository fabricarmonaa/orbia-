import path from "path";
import fs from "fs";
import { storage } from "../../storage";

const ALLOWED_COLUMNS = ["code", "quantity", "product", "price", "discount", "total"] as const;
type InvoiceColumnKey = (typeof ALLOWED_COLUMNS)[number];

type InvoiceItem = {
  code: string;
  product: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
};

function sanitizeText(value: string | null | undefined, max: number) {
  if (!value) return "";
  return value.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").slice(0, max);
}

function parseLocalFile(logoUrl?: string | null) {
  if (!logoUrl) return null;
  const clean = logoUrl.split("?")[0];
  if (!clean.startsWith("/uploads/")) return null;
  const filePath = path.join(process.cwd(), clean);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

function resolveColumns(columns: string[]): InvoiceColumnKey[] {
  const unique = Array.from(new Set(columns));
  const filtered = unique.filter((col) => ALLOWED_COLUMNS.includes(col as InvoiceColumnKey)) as InvoiceColumnKey[];
  return filtered.length ? filtered : (["code", "quantity", "product", "price", "discount", "total"] as InvoiceColumnKey[]);
}

function resolveInvoiceTemplate(templateKey?: string | null) {
  return templateKey === "B_COMPACT" ? "B_COMPACT" : "B_STANDARD";
}

function loadInvoiceBTemplate() {
  const templatePath = path.join(process.cwd(), "templates", "facturaB.html");
  const exists = fs.existsSync(templatePath);
  if (process.env.PDF_DEBUG === "true") {
    console.log("[pdf][invoice-b] template_resolved", { templatePath, exists });
  }
  if (!exists) {
    return {
      templatePath,
      html: "<h1>FACTURA B</h1><p>CUIT: {{fiscalCuit}}</p><p>TOTAL: {{grandTotal}}</p>",
      source: "fallback-inline",
    };
  }
  return { templatePath, html: fs.readFileSync(templatePath, "utf-8"), source: "templates/facturaB.html" };
}

function renderTemplatePreview(html: string, params: Record<string, string>) {
  let out = html;
  for (const [key, value] of Object.entries(params)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function drawLabeledBox(doc: any, x: number, y: number, w: number, h: number, label: string, value: string) {
  doc.rect(x, y, w, h).strokeColor("#111").lineWidth(1).stroke();
  doc.fontSize(8).fillColor("#555").text(label, x + 4, y + 3, { width: w - 8 });
  doc.fontSize(10).fillColor("#111").text(value || "-", x + 4, y + 14, { width: w - 8 });
}

export async function generateInvoiceBPdf(tenantId: number) {
  const settings = await storage.getTenantPdfSettings(tenantId);
  const branding = await storage.getTenantBranding(tenantId);
  const appBranding = await storage.getAppBranding();
  const products = await storage.getProducts(tenantId);

  const logoPath = settings.showLogo
    ? parseLocalFile(branding.logoUrl || appBranding.orbiaLogoUrl)
    : null;
  const primaryColor = (branding.colors as any)?.primary || "#111111";

  const items: InvoiceItem[] = (products.length ? products.slice(0, 8) : [
    { id: 0, name: "Producto ejemplo", sku: "SKU-001", price: 1200 },
  ]).map((product, index) => {
    const qty = 1 + (index % 3);
    const price = Number(product.price || 0);
    const discount = 0;
    const total = qty * price - discount;
    return {
      code: sanitizeText(product.sku || `P-${product.id}`, 30),
      product: sanitizeText(product.name, 80),
      quantity: qty,
      price,
      discount,
      total,
    };
  });

  const template = loadInvoiceBTemplate();
  const columns = resolveColumns(settings.invoiceColumns);
  const invoiceTemplate = resolveInvoiceTemplate(settings.templateKey);
  const isCompact = invoiceTemplate === "B_COMPACT";

  const receiverName = sanitizeText(settings.headerText || "Consumidor final", 120);
  const receiverTaxId = "S/D";
  const receiverAddress = sanitizeText(settings.subheaderText || "", 140);
  const invoiceDate = new Date().toLocaleDateString("es-AR");
  const pointOfSale = "0001";
  const voucherNumber = "00000001";
  const fiscalIvaCondition = "IVA Responsable Inscripto";

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.price, 0);
  const taxes = 0;
  const grandTotal = items.reduce((acc, item) => acc + item.total, 0);

  const rows = items
    .map((item) => `<tr><td>${item.quantity}</td><td>${item.product}</td><td>${item.price.toFixed(2)}</td><td>${item.discount.toFixed(2)}</td><td>${item.total.toFixed(2)}</td></tr>`)
    .join("");

  const rendered = renderTemplatePreview(template.html, {
    fiscalName: sanitizeText(settings.fiscalName || branding.displayName || "Negocio", 120),
    fiscalCuit: sanitizeText(settings.fiscalCuit || "CUIT PENDIENTE", 30),
    fiscalAddress: sanitizeText(settings.fiscalAddress || "Domicilio pendiente", 160),
    fiscalIvaCondition,
    invoiceDate,
    pointOfSale,
    voucherNumber,
    receiverName,
    receiverTaxId,
    receiverAddress,
    rows,
    subtotal: `${settings.currencySymbol}${subtotal.toFixed(2)}`,
    taxes: `${settings.currencySymbol}${taxes.toFixed(2)}`,
    grandTotal: `${settings.currencySymbol}${grandTotal.toFixed(2)}`,
    observations: settings.footerText || "Comprobante no válido como factura fiscal.",
  });

  if (process.env.PDF_DEBUG === "true") {
    console.log("[pdf][invoice-b] template_render", {
      templateSource: template.source,
      templatePath: template.templatePath,
      injectedKeys: ["fiscalName", "fiscalCuit", "receiverName", "grandTotal"],
      renderedLength: rendered.length,
      rowCount: items.length,
    });
  }

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: settings.pageSize as any,
    margin: 28,
    layout: settings.orientation === "landscape" ? "landscape" : "portrait",
    compress: false,
  });

  doc.info.Title = "FACTURA B";
  doc.info.Subject = "CUIT TOTAL";
  doc.info.Keywords = "FACTURA B,CUIT,TOTAL";

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;

  // Encabezado fiscal
  doc.rect(left, 20, contentWidth, 78).strokeColor("#111").lineWidth(1.2).stroke();
  doc.fontSize(24).fillColor("#111").text("FACTURA B", left + 10, 28, { width: 220 });
  doc.fontSize(10).fillColor("#111").text(`P.V.: ${pointOfSale}  Comp.: ${voucherNumber}`, left + 10, 60, { width: 260 });
  doc.fontSize(9).fillColor("#111").text(`Fecha: ${invoiceDate}`, left + 10, 74, { width: 180 });

  if (logoPath) {
    try {
      doc.image(logoPath, left + contentWidth - 64, 28, { width: 42, height: 42 });
    } catch {
      // ignore invalid logo
    }
  }

  drawLabeledBox(doc, left + 230, 28, contentWidth - 240, 56, "Emisor", sanitizeText(settings.fiscalName || branding.displayName || "Negocio", 120));

  let y = 106;
  drawLabeledBox(doc, left, y, contentWidth / 2 - 6, 44, "CUIT", sanitizeText(settings.fiscalCuit || "CUIT PENDIENTE", 30));
  drawLabeledBox(doc, left + contentWidth / 2 + 6, y, contentWidth / 2 - 6, 44, "Condición IVA", fiscalIvaCondition);

  y += 52;
  drawLabeledBox(doc, left, y, contentWidth, 40, "Domicilio emisor", sanitizeText(settings.fiscalAddress || "Domicilio pendiente", 160));

  y += 48;
  drawLabeledBox(doc, left, y, contentWidth / 2 - 6, 40, "Receptor", receiverName);
  drawLabeledBox(doc, left + contentWidth / 2 + 6, y, contentWidth / 2 - 6, 40, "CUIT/DNI receptor", receiverTaxId);

  y += 48;
  drawLabeledBox(doc, left, y, contentWidth, 34, "Domicilio receptor", receiverAddress || "-");

  y += 44;

  const columnWeights: Record<InvoiceColumnKey, number> = {
    code: 0.8,
    quantity: 0.8,
    product: 2.8,
    price: 1.2,
    discount: 1,
    total: 1.2,
  };
  const totalWeight = columns.reduce((sum, col) => sum + columnWeights[col], 0);
  const widths = columns.map((col) => (contentWidth * columnWeights[col]) / totalWeight);
  const labels: Record<InvoiceColumnKey, string> = {
    code: "Código",
    quantity: "Cantidad",
    product: "Descripción",
    price: "Precio Unit.",
    discount: "Bonif.",
    total: "Importe",
  };

  doc.rect(left, y, contentWidth, 24).strokeColor("#111").lineWidth(1).stroke();
  let x = left;
  columns.forEach((col, i) => {
    doc.fontSize(10).fillColor("#111").text(labels[col], x + 4, y + 7, { width: widths[i] - 8 });
    if (i < columns.length - 1) doc.moveTo(x + widths[i], y).lineTo(x + widths[i], y + 24).strokeColor("#111").stroke();
    x += widths[i];
  });
  y += 24;

  const rowHeight = isCompact ? 16 : 19;
  let renderedTotal = 0;
  for (const item of items) {
    if (y + rowHeight > doc.page.height - 86) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.rect(left, y, contentWidth, rowHeight).strokeColor("#222").lineWidth(0.5).stroke();
    x = left;
    const rowValues: Record<InvoiceColumnKey, string> = {
      code: item.code,
      quantity: String(item.quantity),
      product: item.product,
      price: `${settings.currencySymbol}${item.price.toFixed(2)}`,
      discount: `${settings.currencySymbol}${item.discount.toFixed(2)}`,
      total: `${settings.currencySymbol}${item.total.toFixed(2)}`,
    };
    columns.forEach((col, i) => {
      doc.fontSize(9).fillColor("#111").text(rowValues[col], x + 4, y + 5, { width: widths[i] - 8, ellipsis: true });
      if (i < columns.length - 1) doc.moveTo(x + widths[i], y).lineTo(x + widths[i], y + rowHeight).strokeColor("#222").stroke();
      x += widths[i];
    });
    renderedTotal += item.total;
    y += rowHeight;
  }

  y += 8;
  doc.fontSize(10).fillColor("#111");
  doc.text(`Subtotal: ${settings.currencySymbol}${subtotal.toFixed(2)}`, left, y, { width: contentWidth, align: "right" });
  y += 14;
  doc.text(`Impuestos: ${settings.currencySymbol}${taxes.toFixed(2)}`, left, y, { width: contentWidth, align: "right" });
  y += 16;
  doc.fontSize(14).fillColor(primaryColor).text(`TOTAL: ${settings.currencySymbol}${renderedTotal.toFixed(2)}`, left, y, { width: contentWidth, align: "right" });

  y += 24;
  doc.fontSize(9).fillColor("#444").text(settings.footerText || "Comprobante no válido como factura fiscal.", left, y, { width: contentWidth, align: "left" });

  doc.end();

  return await new Promise<Buffer>((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
