import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin, getTenantPlan } from "../auth";
import { storage } from "../storage";
import { createRateLimiter } from "../middleware/rate-limit";
import { DEFAULT_PDF_SETTINGS } from "../storage/pdf-settings";
import { generatePriceListPdf } from "../services/pdf/price-list";
import { productFiltersSchema, queryProductsByFilters } from "../services/product-filters";

const allowedTemplates = ["CLASSIC", "MODERN", "MINIMAL"] as const;
const allowedPageSizes = ["A4", "LETTER"] as const;
const allowedOrientations = ["portrait", "landscape"] as const;
const allowedDocumentTypes = ["PRICE_LIST", "PRESUPUESTO"] as const;
const allowedColumns = ["name", "sku", "description", "price", "stock_total", "branch_stock"] as const;


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

function normalizeTemplate(templateKey?: string) {
  if (templateKey && ["CLASSIC", "MODERN", "MINIMAL"].includes(templateKey)) return templateKey;
  return "CLASSIC";
}

async function generatePdfByType(tenantId: number, _documentType: string, planCode?: string | null) {
  // INVOICE_B removed — always generate price list
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
      // Always use PRICE_LIST (INVOICE_B removed)
      const documentType = "PRICE_LIST";
      await storage.upsertTenantPdfSettings(req.auth!.tenantId!, {
        documentType,
        templateKey: normalizeTemplate(payload.templateKey),
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
      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      const pdfBuffer = await withTimeout(generatePdfByType(req.auth!.tenantId!, documentType, null), PDF_TIMEOUT_MS);
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
  app.post("/api/pdfs/quote", tenantAuth, previewLimiter, async (req, res) => {
    try {
      const quoteSchema = z.object({
        customer: z.object({
          name: z.string().max(120).optional().default(""),
          company: z.string().max(120).optional().default(""),
          phone: z.string().max(40).optional().default(""),
          email: z.string().max(120).optional().default(""),
        }).optional().default({}),
        items: z.array(z.object({
          id: z.number().int().positive(),
          name: z.string().max(200),
          description: z.string().max(400).optional().nullable(),
          price: z.number().min(0),
          quantity: z.number().min(1).default(1),
          sku: z.string().max(60).optional().nullable(),
        })).min(1).max(200),
        discount: z.number().min(0).max(100).optional().default(0),
        notes: z.string().max(800).optional().default(""),
        validity: z.number().int().min(1).max(365).optional().default(7),
      });
      const payload = quoteSchema.parse(req.body);
      const plan = await getTenantPlan(req.auth!.tenantId!);
      // Build fake product rows for the price-list generator
      const productsForPdf = payload.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || null,
        price: String(item.price),
        sku: item.sku || null,
        stockTotal: item.quantity,
        isActive: true,
        categoryId: null,
        cost: null,
      }));
      const pdfBuffer = await withTimeout(
        generatePriceListPdf(req.auth!.tenantId!, {
          products: productsForPdf as any,
          hasBranches: false,
          watermarkOrbia: isEconomicPlan(plan?.planCode),
          quoteMode: {
            customer: payload.customer,
            discount: payload.discount,
            notes: payload.notes,
            validity: payload.validity,
          },
        }),
        PDF_TIMEOUT_MS,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=presupuesto.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "QUOTE_INVALID", details: err.errors });
      }
      res.status(err?.status || 500).json({ error: err?.message || "No se pudo generar el presupuesto", code: err?.code || "QUOTE_ERROR" });
    }
  });
}
