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



function drawEconomicWatermark(doc: any, appLogoPath: string | null) {
  const watermarkY = doc.page.height - doc.page.margins.bottom - 36;
  const watermarkX = doc.page.margins.left;

  doc.save();
  try {
    if (appLogoPath) {
      doc.opacity(0.16);
      doc.image(appLogoPath, watermarkX, watermarkY, { fit: [76, 22], align: "left", valign: "bottom" });
    } else {
      doc.opacity(0.18).fontSize(10).fillColor("#6b7280").text("ORBIA", watermarkX, watermarkY + 8);
    }
  } catch {
    doc.opacity(0.18).fontSize(10).fillColor("#6b7280").text("ORBIA", watermarkX, watermarkY + 8);
  }
  doc.restore();
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
  if (!entries.length) return "Sin stock";
  const maxVisible = 3;
  const visible = entries.slice(0, maxVisible).map((e) => `${e.branchName}: ${e.stock}`);
  if (entries.length > maxVisible) {
    visible.push(`+${entries.length - maxVisible} más`);
  }
  return visible.join(" | ");
}

export async function generatePriceListPdf(
  tenantId: number,
  options?: { products?: PriceListProduct[]; hasBranches?: boolean; watermarkOrbia?: boolean }
) {
  const settings = await storage.getTenantPdfSettings(tenantId);
  const branding = await storage.getTenantBranding(tenantId);
  const appBranding = await storage.getAppBranding();

  const appLogoPath = parseLocalFile(appBranding.orbiaLogoUrl);
  const logoPath = options?.watermarkOrbia
    ? null
    : (settings.showLogo ? parseLocalFile(branding.logoUrl || appBranding.orbiaLogoUrl) : null);
  const primaryColor = (branding.colors as any)?.primary || "#6366f1";

  const products = options?.products || await storage.getProducts(tenantId);
  const hasBranchMode = options?.hasBranches ?? settings.showBranchStock;
  const stockRows = hasBranchMode ? await storage.getStockSummaryByTenant(tenantId) : [];

  const stockByProduct = new Map<number, Array<{ branchName: string; stock: number }>>();
  const stockTotals = new Map<number, number>();

  if (!options?.products) {
    for (const row of stockRows) {
      const list = stockByProduct.get(row.productId) || [];
      list.push({ branchName: row.branchName, stock: row.stock });
      stockByProduct.set(row.productId, list);
      stockTotals.set(row.productId, (stockTotals.get(row.productId) || 0) + row.stock);
    }
  }

  if (options?.products) {
    for (const product of options.products) {
      if (product.stockTotal !== undefined) {
        stockTotals.set(product.id, product.stockTotal);
      }
      if (product.branchStock?.length) {
        stockByProduct.set(product.id, product.branchStock);
      }
    }
  }

  const columns = resolveColumns({
    columns: settings.columns,
    showSku: settings.showSku,
    showDescription: settings.showDescription,
    showBranchStock: settings.showBranchStock,
  });

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

  const headerText = sanitizeText(settings.headerText || branding.displayName || "Lista de precios", 80);
  const subheaderText = sanitizeText(settings.subheaderText || "", 120);
  const footerText = sanitizeText(settings.footerText || "", 160);

  if (settings.templateKey === "CLASSIC") {
    doc.rect(doc.page.margins.left, doc.page.margins.top - 10, pageWidth, 50).fill(primaryColor);
    doc.fillColor("#ffffff").fontSize(styles.headerSize).text(headerText, doc.page.margins.left + 12, doc.page.margins.top + 4);
    if (subheaderText) {
      doc.fontSize(styles.subheaderSize).text(subheaderText, doc.page.margins.left + 12, doc.page.margins.top + 24);
    }
    doc.fillColor("#000000");
  } else if (settings.templateKey === "MODERN") {
    doc.rect(doc.page.margins.left, doc.page.margins.top - 12, pageWidth, 6).fill(primaryColor);
    doc.fillColor(primaryColor).fontSize(styles.headerSize).text(headerText, doc.page.margins.left, doc.page.margins.top + 6);
    doc.fillColor("#000000");
    if (subheaderText) {
      doc.fontSize(styles.subheaderSize).text(subheaderText, doc.page.margins.left, doc.page.margins.top + 26);
    }
  } else {
    doc.fontSize(styles.headerSize).fillColor("#111111").text(headerText, doc.page.margins.left, doc.page.margins.top);
    if (subheaderText) {
      doc.fontSize(styles.subheaderSize).fillColor("#666666").text(subheaderText, doc.page.margins.left, doc.page.margins.top + 20);
    }
  }

  if (logoPath) {
    try {
      doc.image(logoPath, doc.page.width - doc.page.margins.right - 60, doc.page.margins.top - 6, { width: 50, height: 50 });
    } catch {
      // ignore invalid logo
    }
  }

  let cursorY = doc.page.margins.top + 60;
  if (settings.templateKey === "MINIMAL") {
    cursorY = doc.page.margins.top + 40;
  }

  const columnWeights: Record<ColumnKey, number> = {
    name: 3,
    sku: 1,
    description: 3,
    price: 1.2,
    stock_total: 1,
    branch_stock: 2,
  };

  const totalWeight = columns.reduce((sum, col) => sum + columnWeights[col], 0);
  const columnWidths = columns.map((col) => (pageWidth * columnWeights[col]) / totalWeight);

  doc.fontSize(styles.tableHeaderSize).fillColor("#111111");
  let x = doc.page.margins.left;
  columns.forEach((col, idx) => {
    const label = col === "price" ? settings.priceColumnLabel : col === "stock_total" ? "Stock" : col === "branch_stock" ? "Stock por sucursal" : col === "sku" ? "SKU" : col === "description" ? "Descripción" : "Producto";
    doc.text(label, x + 4, cursorY, { width: columnWidths[idx] - 8, align: "left" });
    x += columnWidths[idx];
  });
  cursorY += styles.rowHeight;
  doc.moveTo(doc.page.margins.left, cursorY - 4).lineTo(doc.page.width - doc.page.margins.right, cursorY - 4).strokeColor(primaryColor).lineWidth(1).stroke();

  doc.fontSize(styles.fontSize).fillColor("#111111");

  for (const product of products) {
    if (cursorY + styles.rowHeight > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      cursorY = doc.page.margins.top;
    }
    x = doc.page.margins.left;
    const totalStock = stockTotals.get(product.id) || product.stock || 0;
    const branchEntries = stockByProduct.get(product.id) || [];
    const branchStock = settings.showBranchStock ? formatBranchStock(branchEntries) : "";
    const rowValues: Record<ColumnKey, string> = {
      name: sanitizeText(product.name, 120),
      sku: sanitizeText(product.sku || "", 40),
      description: sanitizeText(product.description || "", 140),
      price: `${settings.currencySymbol}${product.price ?? ""}`,
      stock_total: totalStock.toString(),
      branch_stock: branchStock,
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

  if (options?.watermarkOrbia) {
    drawEconomicWatermark(doc, appLogoPath);
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
