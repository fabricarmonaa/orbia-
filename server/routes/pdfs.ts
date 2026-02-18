import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin, getTenantPlan } from "../auth";
import { storage } from "../storage";
import { createRateLimiter } from "../middleware/rate-limit";
import { DEFAULT_PDF_SETTINGS } from "../storage/pdf-settings";
import { generatePriceListPdf } from "../services/pdf/price-list";
import { generateInvoiceBPdf } from "../services/pdf/invoice-b";
import { productFiltersSchema, queryProductsByFilters } from "../services/product-filters";

const allowedTemplates = ["CLASSIC", "MODERN", "MINIMAL", "INVOICE_B"] as const;
const allowedPageSizes = ["A4", "LETTER"] as const;
const allowedOrientations = ["portrait", "landscape"] as const;
const allowedDocumentTypes = ["PRICE_LIST", "INVOICE_B"] as const;
const allowedColumns = ["name", "sku", "description", "price", "stock_total", "branch_stock"] as const;
const allowedInvoiceColumns = ["code", "quantity", "product", "price", "discount", "total"] as const;

const stylesSchema = z.object({
  fontSize: z.number().min(8).max(16).optional(),
  headerSize: z.number().min(12).max(24).optional(),
  subheaderSize: z.number().min(10).max(18).optional(),
  tableHeaderSize: z.number().min(8).max(16).optional(),
  rowHeight: z.number().min(12).max(28).optional(),
});

const pdfSettingsSchema = z.object({
  documentType: z.enum(allowedDocumentTypes).optional(),
  templateKey: z.enum(allowedTemplates).optional(),
  pageSize: z.enum(allowedPageSizes).optional(),
  orientation: z.enum(allowedOrientations).optional(),
  showLogo: z.boolean().optional(),
  headerText: z.string().trim().max(80).optional().nullable(),
  subheaderText: z.string().trim().max(120).optional().nullable(),
  footerText: z.string().trim().max(160).optional().nullable(),
  showBranchStock: z.boolean().optional(),
  showSku: z.boolean().optional(),
  showDescription: z.boolean().optional(),
  priceColumnLabel: z.string().trim().max(30).optional(),
  currencySymbol: z.string().trim().max(5).optional(),
  columns: z.array(z.enum(allowedColumns)).max(allowedColumns.length).optional(),
  invoiceColumns: z.array(z.enum(allowedInvoiceColumns)).max(allowedInvoiceColumns.length).optional(),
  documentTitle: z.string().trim().max(80).optional().nullable(),
  fiscalName: z.string().trim().max(120).optional().nullable(),
  fiscalCuit: z.string().trim().max(30).optional().nullable(),
  fiscalIibb: z.string().trim().max(30).optional().nullable(),
  fiscalAddress: z.string().trim().max(160).optional().nullable(),
  fiscalCity: z.string().trim().max(120).optional().nullable(),
  showFooterTotals: z.boolean().optional(),
  styles: stylesSchema.optional(),
});

const exportBodySchema = z.object({
  mode: z.enum(["filtered", "selected"]).default("filtered"),
  filters: productFiltersSchema.partial().optional().default({}),
  selectedIds: z.array(z.coerce.number().int().positive()).optional().default([]),
});

const PDF_TIMEOUT_MS = parseInt(process.env.PDF_TIMEOUT_MS || "25000", 10);

const previewLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.PDF_PREVIEW_LIMIT_PER_MIN || "5", 10),
  keyGenerator: (req) => `pdf-preview:${req.auth?.tenantId || req.ip}`,
  errorMessage: "Demasiadas solicitudes de PDF. Intentá en un minuto.",
  code: "PDF_RATE_LIMIT",
});



function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const err = new Error("La generación tardó demasiado. Intentá nuevamente.") as Error & { status?: number; code?: string };
      err.status = 504;
      err.code = "PDF_TIMEOUT";
      reject(err);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

function normalizeColumns(columns?: string[]) {
  if (!columns?.length) return DEFAULT_PDF_SETTINGS.columns;
  const unique = Array.from(new Set(columns));
  return unique.filter((col) => allowedColumns.includes(col as any));
}

function isEconomicPlan(planCode?: string | null) {
  return (planCode || "").toUpperCase() === "ECONOMICO";
}

function canUseInvoiceB(planCode?: string | null) {
  return (planCode || "").toUpperCase() === "ESCALA";
}

function normalizeInvoiceColumns(columns?: string[]) {
  if (!columns?.length) return DEFAULT_PDF_SETTINGS.invoiceColumns;
  const unique = Array.from(new Set(columns));
  return unique.filter((col) => allowedInvoiceColumns.includes(col as any));
}

async function generatePdfByType(tenantId: number, documentType: string, planCode?: string | null) {
  if (documentType === "INVOICE_B") {
    return generateInvoiceBPdf(tenantId);
  }
  return generatePriceListPdf(tenantId, { watermarkOrbia: isEconomicPlan(planCode) });
}

async function resolvePriceListProducts(tenantId: number, body: z.infer<typeof exportBodySchema>) {
  const branchCount = await storage.countBranchesByTenant(tenantId);
  const hasBranches = branchCount > 0;
  const maxExportRows = parseInt(process.env.MAX_EXPORT_ROWS || "2000", 10);
  const normalizedFilters = productFiltersSchema.parse({
    ...body.filters,
    page: 1,
    pageSize: Math.min(maxExportRows, 100),
  });

  const queryOptions = body.mode === "selected"
    ? { productIds: body.selectedIds, noPagination: true }
    : { noPagination: true as const };

  if (body.mode === "selected" && body.selectedIds.length === 0) {
    const err = new Error("Debés seleccionar al menos un producto para exportar.") as Error & { status: number; code: string };
    err.status = 400;
    err.code = "PDF_SELECTED_EMPTY";
    throw err;
  }

  const { data, total } = await queryProductsByFilters(tenantId, hasBranches, normalizedFilters, queryOptions);
  if (total > maxExportRows) {
    const err = new Error(`Tu filtro trae demasiados productos (${total}). Ajustalo e intentá de nuevo.`) as Error & { status: number; code: string };
    err.status = 413;
    err.code = "PDF_EXPORT_LIMIT";
    throw err;
  }

  return { hasBranches, data };
}

export function registerPdfRoutes(app: Express) {
  app.get("/api/pdfs/settings", tenantAuth, async (req, res) => {
    try {
      const data = await storage.getTenantPdfSettings(req.auth!.tenantId!);
      res.json({ data });
    } catch {
      res.status(500).json({ error: "No se pudieron cargar los PDFs", code: "PDF_SETTINGS_ERROR" });
    }
  });

  app.put("/api/pdfs/settings", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const payload = pdfSettingsSchema.parse(req.body);
      const plan = await getTenantPlan(req.auth!.tenantId!);
      const economic = isEconomicPlan(plan?.planCode);
      if (payload.documentType === "INVOICE_B" && !canUseInvoiceB(plan?.planCode)) {
        return res.status(403).json({ error: "Tu plan no incluye Factura B.", code: "PLAN_BLOCKED" });
      }
      await storage.upsertTenantPdfSettings(req.auth!.tenantId!, {
        documentType: economic ? "PRICE_LIST" : payload.documentType,
        templateKey: payload.templateKey,
        pageSize: payload.pageSize,
        orientation: payload.orientation,
        showLogo: economic ? false : payload.showLogo,
        headerText: payload.headerText ?? undefined,
        subheaderText: payload.subheaderText ?? undefined,
        footerText: payload.footerText ?? undefined,
        showBranchStock: payload.showBranchStock,
        showSku: payload.showSku,
        showDescription: payload.showDescription,
        priceColumnLabel: payload.priceColumnLabel,
        currencySymbol: payload.currencySymbol,
        columnsJson: payload.columns ? normalizeColumns(payload.columns) : undefined,
        invoiceColumnsJson: payload.invoiceColumns ? normalizeInvoiceColumns(payload.invoiceColumns) : undefined,
        documentTitle: payload.documentTitle ?? undefined,
        fiscalName: payload.fiscalName ?? undefined,
        fiscalCuit: payload.fiscalCuit ?? undefined,
        fiscalIibb: payload.fiscalIibb ?? undefined,
        fiscalAddress: payload.fiscalAddress ?? undefined,
        fiscalCity: payload.fiscalCity ?? undefined,
        showFooterTotals: payload.showFooterTotals,
        stylesJson: payload.styles ?? undefined,
      });
      const response = await storage.getTenantPdfSettings(req.auth!.tenantId!);
      res.json({ data: response });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PDF_SETTINGS_INVALID" });
      }
      res.status(500).json({ error: "No se pudieron guardar los PDFs", code: "PDF_SETTINGS_ERROR" });
    }
  });

  app.post("/api/pdfs/settings/reset", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const data = await storage.resetTenantPdfSettings(req.auth!.tenantId!);
      res.json({ data });
    } catch {
      res.status(500).json({ error: "No se pudo restaurar el PDF", code: "PDF_SETTINGS_ERROR" });
    }
  });

  app.post("/api/pdfs/preview", tenantAuth, previewLimiter, async (req, res) => {
    try {
      const documentType = req.body?.documentType || (await storage.getTenantPdfSettings(req.auth!.tenantId!)).documentType;
      const plan = await getTenantPlan(req.auth!.tenantId!);
      if (documentType === "INVOICE_B" && !canUseInvoiceB(plan?.planCode)) {
        return res.status(403).json({ error: "Tu plan no incluye Factura B.", code: "PLAN_BLOCKED" });
      }
      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      const pdfBuffer = await withTimeout(generatePdfByType(req.auth!.tenantId!, documentType, plan?.planCode), PDF_TIMEOUT_MS);
      if (clientClosed || res.headersSent) return;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=documento.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || "No se pudo generar el PDF", code: err?.code || "PDF_GENERATION_ERROR" });
    }
  });

  app.get("/api/pdfs/download", tenantAuth, previewLimiter, async (req, res) => {
    try {
      const documentType = req.query.documentType ? String(req.query.documentType) : (await storage.getTenantPdfSettings(req.auth!.tenantId!)).documentType;
      const plan = await getTenantPlan(req.auth!.tenantId!);
      if (documentType === "INVOICE_B" && !canUseInvoiceB(plan?.planCode)) {
        return res.status(403).json({ error: "Tu plan no incluye Factura B.", code: "PLAN_BLOCKED" });
      }
      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      const pdfBuffer = await withTimeout(generatePdfByType(req.auth!.tenantId!, documentType, plan?.planCode), PDF_TIMEOUT_MS);
      if (clientClosed || res.headersSent) return;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=documento.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || "No se pudo generar el PDF", code: err?.code || "PDF_GENERATION_ERROR" });
    }
  });

  app.post("/api/pdfs/price-list/preview", tenantAuth, previewLimiter, async (req, res) => {
    try {
      const payload = exportBodySchema.parse(req.body || {});
      const { data, hasBranches } = await resolvePriceListProducts(req.auth!.tenantId!, payload);
      const plan = await getTenantPlan(req.auth!.tenantId!);
      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      const pdfBuffer = await withTimeout(generatePriceListPdf(req.auth!.tenantId!, { products: data, hasBranches, watermarkOrbia: isEconomicPlan(plan?.planCode) }), PDF_TIMEOUT_MS);
      if (clientClosed || res.headersSent) return;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=lista-precios.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Parámetros inválidos", code: "PDF_EXPORT_INVALID" });
      }
      return res.status(err.status || 500).json({ error: err.message || "No se pudo generar el PDF", code: err.code || "PDF_GENERATION_ERROR" });
    }
  });

  app.post("/api/pdfs/price-list/download", tenantAuth, previewLimiter, async (req, res) => {
    try {
      const payload = exportBodySchema.parse(req.body || {});
      const { data, hasBranches } = await resolvePriceListProducts(req.auth!.tenantId!, payload);
      const plan = await getTenantPlan(req.auth!.tenantId!);
      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      const pdfBuffer = await withTimeout(generatePriceListPdf(req.auth!.tenantId!, { products: data, hasBranches, watermarkOrbia: isEconomicPlan(plan?.planCode) }), PDF_TIMEOUT_MS);
      if (clientClosed || res.headersSent) return;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=lista-precios.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Parámetros inválidos", code: "PDF_EXPORT_INVALID" });
      }
      return res.status(err.status || 500).json({ error: err.message || "No se pudo generar el PDF", code: err.code || "PDF_GENERATION_ERROR" });
    }
  });
}
