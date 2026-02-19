import path from "path";
import fs from "fs";
import { storage } from "../../storage";

const ALLOWED_COLUMNS = ["code", "quantity", "product", "price", "discount", "total"] as const;
type InvoiceColumnKey = (typeof ALLOWED_COLUMNS)[number];

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
    console.log("[pdf][invoice-b] template_path", { templatePath, exists });
  }
  if (!exists) return { templatePath, html: null as string | null };
  return { templatePath, html: fs.readFileSync(templatePath, "utf-8") };
}

function renderTemplatePreview(html: string, params: Record<string, string>) {
  let out = html;
  for (const [key, value] of Object.entries(params)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

export async function generateInvoiceBPdf(tenantId: number) {
  const settings = await storage.getTenantPdfSettings(tenantId);
  const branding = await storage.getTenantBranding(tenantId);
  const appBranding = await storage.getAppBranding();
  const products = await storage.getProducts(tenantId);

  const logoPath = settings.showLogo
    ? parseLocalFile(branding.logoUrl || appBranding.orbiaLogoUrl)
    : null;
  const primaryColor = (branding.colors as any)?.primary || "#2563eb";

  const items = (products.length ? products.slice(0, 8) : [
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

  const { templatePath, html: invoiceTemplateHtml } = loadInvoiceBTemplate();

  const columns = resolveColumns(settings.invoiceColumns);
  const styles = settings.styles as {
    fontSize: number;
    headerSize: number;
    subheaderSize: number;
    tableHeaderSize: number;
    rowHeight: number;
  };
  const invoiceTemplate = resolveInvoiceTemplate(settings.templateKey);
  const isCompact = invoiceTemplate === "B_COMPACT";

  if (invoiceTemplateHtml) {
    const rows = items
      .map((item) => `<tr><td>${item.code}</td><td>${item.quantity}</td><td>${item.product}</td><td>${item.price.toFixed(2)}</td><td>${item.discount.toFixed(2)}</td><td>${item.total.toFixed(2)}</td></tr>`)
      .join("");
    const rendered = renderTemplatePreview(invoiceTemplateHtml, {
      documentTitle: sanitizeText(settings.documentTitle || "Factura B", 80),
      businessName: sanitizeText(branding.displayName || "Negocio", 80),
      fiscalName: sanitizeText(settings.fiscalName || "", 120),
      fiscalCuit: sanitizeText(settings.fiscalCuit || "", 30),
      rows,
    });
    if (process.env.PDF_DEBUG === "true") {
      console.log("[pdf][invoice-b] template_rendered", { templatePath, renderedLength: rendered.length, rowCount: items.length });
    }
  }

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: settings.pageSize as any,
    margin: 40,
    layout: settings.orientation === "landscape" ? "landscape" : "portrait",
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headerTitle = sanitizeText(settings.documentTitle || "Factura B", 80);
  const businessName = sanitizeText(branding.displayName || "Negocio", 80);
  const subheader = sanitizeText(settings.subheaderText || "", 120);
  const footerText = sanitizeText(settings.footerText || "", 160);

  if (isCompact) {
    doc.rect(doc.page.margins.left, doc.page.margins.top - 12, pageWidth, 5).fill(primaryColor);
    doc.fillColor(primaryColor).fontSize(styles.headerSize).text(headerTitle, doc.page.margins.left, doc.page.margins.top + 6);
    doc.fillColor("#111111").fontSize(Math.max(10, styles.subheaderSize - 1)).text(businessName, doc.page.margins.left, doc.page.margins.top + 24);
  } else {
    doc.rect(doc.page.margins.left, doc.page.margins.top - 10, pageWidth, 48).fill(primaryColor);
    doc.fillColor("#ffffff").fontSize(styles.headerSize).text(businessName, doc.page.margins.left + 12, doc.page.margins.top + 4);
    doc.fontSize(styles.subheaderSize).text(headerTitle, doc.page.margins.left + 12, doc.page.margins.top + 24);
  }
  doc.fillColor("#000000");

  if (logoPath) {
    try {
      doc.image(logoPath, doc.page.width - doc.page.margins.right - 60, doc.page.margins.top - 6, { width: 50, height: 50 });
    } catch {
      // ignore invalid logo
    }
  }

  let cursorY = doc.page.margins.top + (isCompact ? 48 : 60);

  doc.fontSize(10).fillColor("#111111");
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, doc.page.margins.left, cursorY);
  cursorY += 18;

  const fiscalLines = [
    settings.fiscalName ? `Razón social: ${settings.fiscalName}` : null,
    settings.fiscalCuit ? `CUIT: ${settings.fiscalCuit}` : null,
    settings.fiscalIibb ? `IIBB: ${settings.fiscalIibb}` : null,
    settings.fiscalAddress ? `Domicilio: ${settings.fiscalAddress}` : null,
    settings.fiscalCity ? `Ciudad: ${settings.fiscalCity}` : null,
  ].filter(Boolean) as string[];

  fiscalLines.forEach((line) => {
    doc.text(line, doc.page.margins.left, cursorY);
    cursorY += isCompact ? 12 : 14;
  });

  if (subheader) {
    cursorY += 6;
    doc.fontSize(9).fillColor("#444444").text(subheader, doc.page.margins.left, cursorY);
    cursorY += isCompact ? 14 : 18;
  }

  const columnWeights: Record<InvoiceColumnKey, number> = {
    code: 1,
    quantity: 0.8,
    product: 3,
    price: 1.2,
    discount: 1,
    total: 1.2,
  };

  const totalWeight = columns.reduce((sum, col) => sum + columnWeights[col], 0);
  const columnWidths = columns.map((col) => (pageWidth * columnWeights[col]) / totalWeight);

  const rowHeight = isCompact ? Math.max(14, styles.rowHeight - 3) : styles.rowHeight;

  doc.fontSize(styles.tableHeaderSize).fillColor("#111111");
  let x = doc.page.margins.left;
  const columnLabels: Record<InvoiceColumnKey, string> = {
    code: "Código",
    quantity: "Cant",
    product: "Producto",
    price: "Precio",
    discount: "Bonif",
    total: "Importe",
  };
  columns.forEach((col, idx) => {
    doc.text(columnLabels[col], x + 4, cursorY, { width: columnWidths[idx] - 8, align: "left" });
    x += columnWidths[idx];
  });
  cursorY += rowHeight;
  doc.moveTo(doc.page.margins.left, cursorY - 4).lineTo(doc.page.width - doc.page.margins.right, cursorY - 4).strokeColor(primaryColor).lineWidth(1).stroke();

  doc.fontSize(styles.fontSize).fillColor("#111111");
  let totalAmount = 0;

  for (const item of items) {
    if (cursorY + rowHeight > doc.page.height - doc.page.margins.bottom - 50) {
      doc.addPage();
      cursorY = doc.page.margins.top;
    }
    x = doc.page.margins.left;
    totalAmount += item.total;
    const rowValues: Record<InvoiceColumnKey, string> = {
      code: item.code,
      quantity: item.quantity.toString(),
      product: item.product,
      price: `${settings.currencySymbol}${item.price.toFixed(2)}`,
      discount: `${settings.currencySymbol}${item.discount.toFixed(2)}`,
      total: `${settings.currencySymbol}${item.total.toFixed(2)}`,
    };
    columns.forEach((col, idx) => {
      doc.text(rowValues[col], x + 4, cursorY, {
        width: columnWidths[idx] - 8,
        height: rowHeight,
        ellipsis: true,
      });
      x += columnWidths[idx];
    });
    cursorY += rowHeight;
  }

  if (settings.showFooterTotals) {
    cursorY += 10;
    doc.fontSize(11).fillColor("#111111");
    doc.text(`TOTAL: ${settings.currencySymbol}${totalAmount.toFixed(2)}`, doc.page.margins.left, cursorY, {
      align: "right",
      width: pageWidth,
    });
  }

  if (footerText) {
    doc.fontSize(9).fillColor("#666666");
    doc.text(footerText, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 20, {
      width: pageWidth,
      align: "center",
    });
  }

  doc.end();

  return await new Promise<Buffer>((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
