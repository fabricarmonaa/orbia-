import { apiRequest, getToken } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";

export type PdfTemplateKey = "CLASSIC" | "MODERN" | "MINIMAL" | "B_STANDARD" | "B_COMPACT";
export type PdfPageSize = "A4" | "LETTER";
export type PdfOrientation = "portrait" | "landscape";
export type PdfDocumentType = "PRICE_LIST" | "INVOICE_B";
export type PdfColumnKey = "name" | "sku" | "description" | "price" | "stock_total" | "branch_stock";
export type InvoiceColumnKey = "code" | "quantity" | "product" | "price" | "discount" | "total";

export interface PdfStyles {
  fontSize?: number;
  headerSize?: number;
  subheaderSize?: number;
  tableHeaderSize?: number;
  rowHeight?: number;
}

export interface PdfSettings {
  documentType: PdfDocumentType;
  templateKey: PdfTemplateKey;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  showLogo: boolean;
  headerText?: string | null;
  subheaderText?: string | null;
  footerText?: string | null;
  showBranchStock: boolean;
  showSku: boolean;
  showDescription: boolean;
  priceColumnLabel: string;
  currencySymbol: string;
  columns: PdfColumnKey[];
  invoiceColumns: InvoiceColumnKey[];
  documentTitle?: string | null;
  fiscalName?: string | null;
  fiscalCuit?: string | null;
  fiscalIibb?: string | null;
  fiscalAddress?: string | null;
  fiscalCity?: string | null;
  showFooterTotals?: boolean;
  styles: PdfStyles;
  updatedAt?: string;
}

export type PriceListExportPayload = {
  mode: "filtered" | "selected";
  filters?: {
    q?: string;
    categoryId?: number;
    status?: "active" | "inactive" | "all";
    minPrice?: number;
    maxPrice?: number;
    stock?: "all" | "in" | "out" | "low";
    lowStockThreshold?: number;
    sort?: "name" | "price" | "stock" | "createdAt";
    dir?: "asc" | "desc";
  };
  selectedIds?: number[];
};

export async function getPdfSettings(): Promise<PdfSettings> {
  const res = await apiRequest("GET", "/api/pdfs/settings");
  const data = await res.json();
  return data.data;
}

export async function updatePdfSettings(payload: Partial<PdfSettings>) {
  const res = await apiRequest("PUT", "/api/pdfs/settings", payload);
  const data = await res.json();
  return data.data;
}

export async function resetPdfSettings() {
  const res = await apiRequest("POST", "/api/pdfs/settings/reset");
  const data = await res.json();
  return data.data;
}

async function fetchPdfBlob(url: string, method: "GET" | "POST", payload?: unknown): Promise<Blob> {
  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const info = await parseApiError(res);
    throw new Error(info.message);
  }
  return res.blob();
}

export async function fetchPdfPreview(documentType: PdfDocumentType): Promise<Blob> {
  return fetchPdfBlob("/api/pdfs/preview", "POST", { documentType });
}

export async function previewPriceListPdf(payload: PriceListExportPayload): Promise<Blob> {
  return fetchPdfBlob("/api/pdfs/price-list/preview", "POST", payload);
}

export async function downloadPriceListPdf(payload: PriceListExportPayload, filename = "lista-precios.pdf") {
  const blob = await fetchPdfBlob("/api/pdfs/price-list/download", "POST", payload);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export function getPdfDownloadUrl(documentType: PdfDocumentType) {
  return `/api/pdfs/download?documentType=${documentType}`;
}

export async function downloadPdfWithAuth(url: string, filename: string) {
  const blob = await fetchPdfBlob(url, "GET");
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
