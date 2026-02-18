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

function resolveColumns(columns: string[]) {
  const unique = Array.from(new Set(columns));
  return unique.filter((col) => ALLOWED_COLUMNS.includes(col as InvoiceColumnKey)) as InvoiceColumnKey[];
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

  const columns = resolveColumns(settings.invoiceColumns);
  const styles = settings.styles as {
    fontSize: number;
    headerSize: number;
    subheaderSize: number;
    tableHeaderSize: number;
    rowHeight: number;
  };

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

  doc.rect(doc.page.margins.left, doc.page.margins.top - 10, pageWidth, 48).fill(primaryColor);
  doc.fillColor("#ffffff").fontSize(styles.headerSize).text(businessName, doc.page.margins.left + 12, doc.page.margins.top + 4);
  doc.fontSize(styles.subheaderSize).text(headerTitle, doc.page.margins.left + 12, doc.page.margins.top + 24);
  doc.fillColor("#000000");

  if (logoPath) {
    try {
      doc.image(logoPath, doc.page.width - doc.page.margins.right - 60, doc.page.margins.top - 6, { width: 50, height: 50 });
    } catch {
      // ignore invalid logo
    }
  }

  let cursorY = doc.page.margins.top + 60;

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
    cursorY += 14;
  });

  if (subheader) {
    cursorY += 6;
    doc.fontSize(9).fillColor("#444444").text(subheader, doc.page.margins.left, cursorY);
    cursorY += 18;
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
  cursorY += styles.rowHeight;
  doc.moveTo(doc.page.margins.left, cursorY - 4).lineTo(doc.page.width - doc.page.margins.right, cursorY - 4).strokeColor(primaryColor).lineWidth(1).stroke();

  doc.fontSize(styles.fontSize).fillColor("#111111");
  let totalAmount = 0;

  for (const item of items) {
    if (cursorY + styles.rowHeight > doc.page.height - doc.page.margins.bottom - 50) {
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
        height: styles.rowHeight,
        ellipsis: true,
      });
      x += columnWidths[idx];
    });
    cursorY += styles.rowHeight;
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
