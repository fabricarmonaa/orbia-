import { apiRequest, getToken } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";

export type PdfTemplateKey = "CLASSIC" | "MODERN" | "MINIMAL";
export type PdfPageSize = "A4" | "LETTER";
export type PdfOrientation = "portrait" | "landscape";
export type PdfDocumentType = "PRICE_LIST" | "PRESUPUESTO";
export type PdfColumnKey = "name" | "sku" | "description" | "price" | "stock_total" | "branch_stock";

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

export async function downloadPriceListPdf(payload: PriceListExportPayload, filename = "lista-precios.pdf") {
  const blob = await fetchPdfBlob("/api/pdfs/price-list/download", "POST", payload);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadQuotePdf(
  payload: {
    customer?: { name?: string; company?: string; phone?: string; email?: string };
    items: Array<{ id: number; name: string; description?: string | null; price: number; quantity: number; sku?: string | null }>;
    discount?: number;
    notes?: string;
    validity?: number;
  },
  filename = "presupuesto.pdf",
) {
  const blob = await fetchPdfBlob("/api/pdfs/quote", "POST", payload);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
