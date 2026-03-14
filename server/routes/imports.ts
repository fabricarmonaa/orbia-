import fs from "fs";
import path from "path";
import multer from "multer";
import type { Express } from "express";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { enforceBranchScope, requireRoleAny, tenantAuth } from "../auth";
import { validateBody } from "../middleware/validate";
import { db } from "../db";
import { branches, customers, importJobs, productCustomFieldDefinitions, productCustomFieldValues, productStockByBranch, products, purchaseItems, purchases, stockLevels, stockMovements } from "@shared/schema";
import { buildPreview, normalizeRowsForCommit } from "../services/excel-import";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const uploadDir = path.join(process.cwd(), "uploads", "imports");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const excelUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_")}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx") return cb(null, false);
    cb(null, true);
  },
});

const commitPurchaseBody = z.object({
  mapping: z.record(z.string()),
  includeExtraColumns: z.coerce.boolean().optional().default(false),
  selectedExtraColumns: z.array(z.string()).optional().default([]),
  branch_id: z.coerce.number().int().positive().nullable().optional(),
  provider_id: z.coerce.number().int().positive().nullable().optional(),
  purchase_date: z.string().optional(),
  currency_default: z.string().min(3).max(10).optional().default("ARS"),
  provider_name: z.string().optional(),
  notes: z.string().optional(),
});

const commitCustomerBody = z.object({
  mapping: z.record(z.string()),
  includeExtraColumns: z.coerce.boolean().optional().default(false),
  selectedExtraColumns: z.array(z.string()).optional().default([]),
  onDuplicate: z.enum(["skip_row", "keep_existing", "update_existing"]).optional().default("skip_row"),
});

const commitProductBody = z.object({
  mapping: z.record(z.string()),
  includeExtraColumns: z.coerce.boolean().optional().default(false),
  selectedExtraColumns: z.array(z.string()).optional().default([]),
  onDuplicate: z.enum(["skip_row", "keep_existing", "update_existing"]).optional().default("update_existing"),
});

function parseJsonField(value: unknown, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanupUploadedFile(req: any) {
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => { });
}

function normalizeImportHeader(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function registerImportRoutes(app: Express) {
  app.post("/api/purchases/import/preview", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const data = buildPreview("purchases", req.file.path);
      return res.json({ status: data.warnings.length ? "NEEDS_MAPPING" : "OK", ...data });
    } catch (err: any) {
      console.error("[EXCEL PREVIEW ERROR]", err);
      if (err?.message?.startsWith("EXCEL_IMPORT_MISSING_COLUMNS|")) {
        return res.status(400).json({ error: err.message.split("|")[1], code: "EXCEL_IMPORT_ERROR" });
      }
      return res.status(400).json({ error: err?.message || "No se pudo leer el archivo", code: "IMPORT_PREVIEW_ERROR", stack: err?.stack });
    } finally {
      cleanupUploadedFile(req);
    }
  });

  app.post("/api/customers/import/preview", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const data = buildPreview("customers", req.file.path);
      return res.json({ status: data.warnings.length ? "NEEDS_MAPPING" : "OK", ...data });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "No se pudo leer el archivo", code: "IMPORT_PREVIEW_ERROR" });
    } finally {
      cleanupUploadedFile(req);
    }
  });

  app.post("/api/products/import/preview", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const tenantId = req.auth!.tenantId!;
      const data = buildPreview("products", req.file.path);

      const defs = await db
        .select({ id: productCustomFieldDefinitions.id, label: productCustomFieldDefinitions.label, fieldKey: productCustomFieldDefinitions.fieldKey })
        .from(productCustomFieldDefinitions)
        .where(and(eq(productCustomFieldDefinitions.tenantId, tenantId), eq(productCustomFieldDefinitions.isActive, true)));

      const headerSet = new Set((data.detectedHeaders || []).map(normalizeImportHeader));
      const usedHeaders = new Set(Object.values(data.suggestedMapping || {}).map(normalizeImportHeader));
      const customFieldCandidates = defs
        .map((d) => ({
          id: d.id,
          label: d.label,
          fieldKey: d.fieldKey,
          matchedHeader: [normalizeImportHeader(d.label), normalizeImportHeader(d.fieldKey)].find((k) => headerSet.has(k)) || null,
        }))
        .filter((d) => d.matchedHeader && !usedHeaders.has(d.matchedHeader));

      const warnings = [...(data.warnings || [])];
      if (data.extraColumns?.length) {
        warnings.push(`Estas columnas no están mapeadas y podrían omitirse: ${data.extraColumns.join(", ")}`);
      }
      if (customFieldCandidates.length) {
        warnings.push(`Se detectaron columnas que pueden mapearse a campos personalizados: ${customFieldCandidates.map((c) => c.label).join(", ")}`);
      }

      return res.json({
        status: warnings.length ? "NEEDS_MAPPING" : "OK",
        ...data,
        warnings,
        customFieldCandidates,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "No se pudo leer el archivo", code: "IMPORT_PREVIEW_ERROR" });
    } finally {
      cleanupUploadedFile(req);
    }
  });

  app.post("/api/purchases/import/commit", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, res, next) => {
    req.body.mapping = parseJsonField(req.body.mapping, {});
    req.body.selectedExtraColumns = parseJsonField(req.body.selectedExtraColumns, []);
    return next();
  }, validateBody(commitPurchaseBody), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const payload = req.body as z.infer<typeof commitPurchaseBody>;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : (payload.branch_id ?? null);

      if (branchId) {
        const [branch] = await db.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId))).limit(1);
        if (!branch) return res.status(403).json({ error: "Sucursal inválida", code: "BRANCH_FORBIDDEN" });
      }

      const rows = normalizeRowsForCommit("purchases", req.file.path, payload.mapping);
      const summary = {
        imported_count: 0,
        created_products_count: 0,
        updated_stock_count: 0,
        skipped_count: 0,
        errors_count: 0,
      };
      const rowErrors: Array<{ rowNumber: number; errors: string[] }> = [];

      let excelProviderName: string | null = null;
      let excelNotes: string | null = null;
      for (const row of rows) {
        if (!row.errors.length) {
          if (!excelProviderName && row.normalized.supplier_name) excelProviderName = String(row.normalized.supplier_name);
          if (!excelNotes && row.normalized.notes) excelNotes = String(row.normalized.notes);
        }
      }

      const result = await db.transaction(async (tx) => {
        const [purchase] = await tx.insert(purchases).values({
          tenantId,
          branchId,
          providerId: payload.provider_id ?? null,
          providerName: payload.provider_name ? sanitizeShortText(payload.provider_name, 200) : excelProviderName,
          purchaseDate: payload.purchase_date ? new Date(payload.purchase_date) : new Date(),
          currency: sanitizeShortText(payload.currency_default, 10).toUpperCase(),
          notes: payload.notes ? sanitizeLongText(payload.notes, 2000) : excelNotes,
          importedByUserId: userId,
          totalAmount: "0",
        }).returning();

        let totalAmount = 0;

        for (const row of rows) {
          if (row.errors.length) {
            summary.skipped_count += 1;
            summary.errors_count += 1;
            rowErrors.push({ rowNumber: row.rowNumber, errors: row.errors });
            continue;
          }

          const normalized = row.normalized;
          const code = String(normalized.code || "");
          const name = String(normalized.name || "");
          const quantity = Number(normalized.quantity || 0);
          const unitPrice = Number(normalized.unit_price || 0);
          const currency = String(normalized.currency || payload.currency_default || "ARS").toUpperCase();

          let product = undefined as any;
          if (code) {
            [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.sku, code))).limit(1);
          }
          if (!product && name) {
            [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), ilike(products.name, name))).limit(1);
          }
          if (!product) {
            [product] = await tx.insert(products).values({
              tenantId,
              name: sanitizeShortText(name || code || "Producto importado", 200),
              price: String(unitPrice.toFixed(2)),
              cost: String(unitPrice.toFixed(2)),
              pricingMode: "MANUAL",
              costAmount: String(unitPrice.toFixed(2)),
              costCurrency: currency,
              marginPct: null,
              stock: 0,
              sku: code || null,
              description: null,
              categoryId: null,
              isActive: true,
            }).returning();
            summary.created_products_count += 1;
          }

          const lineTotal = Number((quantity * unitPrice).toFixed(2));
          await tx.insert(purchaseItems).values({
            purchaseId: purchase.id,
            tenantId,
            branchId,
            productId: product.id,
            productCodeSnapshot: product.sku || code || null,
            productNameSnapshot: product.name,
            quantity: String(quantity),
            unitPrice: String(unitPrice.toFixed(2)),
            lineTotal: String(lineTotal.toFixed(2)),
            currency,
          });

          if (branchId) {
            const [existingStock] = await tx.select().from(productStockByBranch).where(and(eq(productStockByBranch.tenantId, tenantId), eq(productStockByBranch.branchId, branchId), eq(productStockByBranch.productId, product.id))).limit(1);
            if (existingStock) {
              await tx.update(productStockByBranch).set({ stock: Number(existingStock.stock || 0) + quantity }).where(eq(productStockByBranch.id, existingStock.id));
            } else {
              await tx.insert(productStockByBranch).values({ tenantId, branchId, productId: product.id, stock: quantity });
            }
          }
          await tx.update(products).set({ stock: sql`${products.stock} + ${quantity}` }).where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)));

          const [level] = await tx.select().from(stockLevels).where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, product.id), branchId ? eq(stockLevels.branchId, branchId) : sql`${stockLevels.branchId} IS NULL`)).limit(1);
          const currentQty = Number(level?.quantity || 0);
          const currentAvg = Number(level?.averageCost || 0);
          const nextQty = currentQty + quantity;
          const nextAvg = nextQty > 0 ? (((currentQty * currentAvg) + (quantity * unitPrice)) / nextQty) : currentAvg;
          if (level) {
            await tx.update(stockLevels).set({ quantity: String(nextQty), averageCost: String(nextAvg), updatedAt: new Date() }).where(eq(stockLevels.id, level.id));
          } else {
            await tx.insert(stockLevels).values({ tenantId, productId: product.id, branchId: branchId || null, quantity: String(nextQty), averageCost: String(nextAvg) });
          }
          await tx.insert(stockMovements).values({
            tenantId,
            productId: product.id,
            branchId: branchId || null,
            movementType: "PURCHASE",
            referenceId: purchase.id,
            quantity: String(quantity),
            unitCost: String(unitPrice),
            totalCost: String(lineTotal),
            note: `Compra #${purchase.id}`,
            reason: `Compra #${purchase.id}`,
            createdByUserId: userId,
            userId,
          });

          summary.updated_stock_count += 1;
          summary.imported_count += 1;
          totalAmount += lineTotal;
        }

        if (summary.imported_count === 0) {
          throw new Error("IMPORT_NO_VALID_ROWS");
        }

        await tx.update(purchases).set({ totalAmount: String(totalAmount.toFixed(2)), updatedAt: new Date() }).where(eq(purchases.id, purchase.id));
        await tx.insert(importJobs).values({
          tenantId,
          entity: "purchases",
          fileName: req.file!.originalname,
          processedRows: rows.length,
          successRows: summary.imported_count,
          errorRows: summary.errors_count,
          createdByUserId: userId,
        });

        return purchase;
      });

      return res.json({ summary, purchase_id: result.id, errors: rowErrors });
    } catch (err: any) {
      if (err?.message?.startsWith("EXCEL_IMPORT_MISSING_COLUMNS|")) {
        return res.status(400).json({ error: err.message.split("|")[1], code: "EXCEL_IMPORT_ERROR" });
      }
      if (err?.message === "IMPORT_NO_VALID_ROWS") {
        return res.status(400).json({ error: "No hay filas válidas para importar", code: "IMPORT_NO_VALID_ROWS" });
      }
      console.error("[IMPORT PURCHASES COMMIT 500 ERROR]:", err);
      return res.status(500).json({ error: "No se pudo completar la importación", code: "IMPORT_COMMIT_ERROR" });
    } finally {
      cleanupUploadedFile(req);
    }
  });

  app.post("/api/products/import/commit", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, _res, next) => {
    req.body.mapping = parseJsonField(req.body.mapping, {});
    req.body.selectedExtraColumns = parseJsonField(req.body.selectedExtraColumns, []);
    return next();
  }, validateBody(commitProductBody), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const payload = req.body as z.infer<typeof commitProductBody>;
      const rows = normalizeRowsForCommit("products", req.file.path, payload.mapping);

      const summary = {
        imported_count: 0,
        created_count: 0,
        updated_count: 0,
        duplicated_count: 0,
        skipped_count: 0,
        errors_count: 0,
        custom_field_updates: 0,
      };
      const rowErrors: Array<{ rowNumber: number; errors: string[] }> = [];

      const activeCustomDefs = await db
        .select({ id: productCustomFieldDefinitions.id, fieldKey: productCustomFieldDefinitions.fieldKey, label: productCustomFieldDefinitions.label })
        .from(productCustomFieldDefinitions)
        .where(and(eq(productCustomFieldDefinitions.tenantId, tenantId), eq(productCustomFieldDefinitions.isActive, true)));
      const customDefsByHeader = new Map<string, { id: number; fieldKey: string; label: string }>();
      for (const def of activeCustomDefs) {
        customDefsByHeader.set(normalizeImportHeader(def.fieldKey), def);
        customDefsByHeader.set(normalizeImportHeader(def.label), def);
      }

      const extraHeadersToUse = payload.includeExtraColumns ? payload.selectedExtraColumns.map((h) => normalizeImportHeader(h)) : [];
      const selectedCustomDefs = extraHeadersToUse.map((h) => customDefsByHeader.get(h)).filter(Boolean) as Array<{ id: number; fieldKey: string; label: string }>;

      await db.transaction(async (tx) => {
        for (const row of rows) {
          if (row.errors.length) {
            summary.skipped_count += 1;
            summary.errors_count += 1;
            rowErrors.push({ rowNumber: row.rowNumber, errors: row.errors });
            continue;
          }

          const normalized = row.normalized;
          const sku = String(normalized.sku || "").trim();
          const name = sanitizeShortText(String(normalized.name || ""), 200);
          const description = normalizeNullable(normalized.description, 2000);
          const price = Number(normalized.price || 0);
          const stockValue = normalized.stock == null ? null : Number(normalized.stock);

          let existing: any;
          if (sku) {
            [existing] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.sku, sku))).limit(1);
          }
          if (!existing) {
            [existing] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), ilike(products.name, name))).limit(1);
          }

          let productId: number | null = null;
          if (existing) {
            summary.duplicated_count += 1;
            if (payload.onDuplicate === "skip_row") {
              summary.skipped_count += 1;
              summary.errors_count += 1;
              rowErrors.push({ rowNumber: row.rowNumber, errors: ["Se detectó un producto duplicado (SKU o nombre). Configurá si querés conservar o actualizar."] });
              continue;
            }
            if (payload.onDuplicate === "keep_existing") {
              productId = existing.id;
            } else {
              await tx.update(products).set({
                name,
                description,
                price: String(price.toFixed(2)),
                sku: sku || existing.sku,
                stock: stockValue === null ? existing.stock : Math.max(0, Math.round(stockValue)),
                isActive: true,
              }).where(eq(products.id, existing.id));
              summary.updated_count += 1;
              productId = existing.id;
            }
          } else {
            const inserted = await tx.insert(products).values({
              tenantId,
              name,
              description,
              price: String(price.toFixed(2)),
              cost: null,
              pricingMode: "MANUAL",
              costAmount: null,
              costCurrency: null,
              marginPct: null,
              stock: stockValue === null ? 0 : Math.max(0, Math.round(stockValue)),
              sku: sku || null,
              categoryId: null,
              isActive: true,
            }).returning({ id: products.id });
            productId = inserted[0]?.id || null;
            summary.created_count += 1;
          }

          if (productId && selectedCustomDefs.length) {
            for (const def of selectedCustomDefs) {
              const rawVal = String((row.raw as any)[normalizeImportHeader(def.label)] || (row.raw as any)[normalizeImportHeader(def.fieldKey)] || "").trim();
              if (!rawVal) continue;
              const existingValue = await tx.select({ id: productCustomFieldValues.id }).from(productCustomFieldValues).where(and(eq(productCustomFieldValues.tenantId, tenantId), eq(productCustomFieldValues.productId, productId), eq(productCustomFieldValues.fieldDefinitionId, def.id))).limit(1);
              if (existingValue[0]) {
                await tx.update(productCustomFieldValues).set({ valueText: rawVal }).where(eq(productCustomFieldValues.id, existingValue[0].id));
              } else {
                await tx.insert(productCustomFieldValues).values({ tenantId, productId, fieldDefinitionId: def.id, valueText: rawVal });
              }
              summary.custom_field_updates += 1;
            }
          }

          summary.imported_count += 1;
        }

        if (summary.imported_count === 0) {
          throw new Error("IMPORT_NO_VALID_ROWS");
        }

        await tx.insert(importJobs).values({
          tenantId,
          entity: "products",
          fileName: req.file!.originalname,
          processedRows: rows.length,
          successRows: summary.imported_count,
          errorRows: summary.errors_count,
          createdByUserId: userId,
        });
      });

      return res.json({ summary, errors: rowErrors, duplicatePolicy: payload.onDuplicate });
    } catch (err: any) {
      if (err?.message?.startsWith("EXCEL_IMPORT_MISSING_COLUMNS|")) {
        return res.status(400).json({ error: err.message.split("|")[1], code: "EXCEL_IMPORT_ERROR" });
      }
      if (err?.message === "IMPORT_NO_VALID_ROWS") {
        return res.status(400).json({ error: "No hay filas válidas para importar", code: "IMPORT_NO_VALID_ROWS" });
      }
      return res.status(500).json({ error: "No se pudo completar la importación", code: "IMPORT_COMMIT_ERROR" });
    } finally {
      cleanupUploadedFile(req);
    }
  });

  app.post("/api/customers/import/commit", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, excelUpload.single("file"), async (req, _res, next) => {
    req.body.mapping = parseJsonField(req.body.mapping, {});
    req.body.selectedExtraColumns = parseJsonField(req.body.selectedExtraColumns, []);
    return next();
  }, validateBody(commitCustomerBody), async (req, res) => {
    try {
      if (!req.file?.path) return res.status(400).json({ error: "Falta archivo .xlsx en field file", code: "MISSING_FILE_FIELD" });
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const payload = req.body as z.infer<typeof commitCustomerBody>;
      const rows = normalizeRowsForCommit("customers", req.file.path, payload.mapping);

      const summary = {
        imported_count: 0,
        duplicated_count: 0,
        updated_count: 0,
        skipped_count: 0,
        errors_count: 0,
      };
      const rowErrors: Array<{ rowNumber: number; errors: string[] }> = [];

      await db.transaction(async (tx) => {
        for (const row of rows) {
          if (row.errors.length) {
            summary.skipped_count += 1;
            summary.errors_count += 1;
            rowErrors.push({ rowNumber: row.rowNumber, errors: row.errors });
            continue;
          }

          const normalized = row.normalized;
          const doc = String(normalized.doc || "").trim();
          const email = String(normalized.email || "").trim().toLowerCase();
          const phone = String(normalized.phone || "").trim();

          const duplicateBy = [];
          if (doc) duplicateBy.push(eq(customers.doc, doc));
          if (email) duplicateBy.push(eq(customers.email, email));
          if (phone) duplicateBy.push(eq(customers.phone, phone));

          let duplicate = undefined as any;
          if (duplicateBy.length) {
            [duplicate] = await tx.select().from(customers).where(and(eq(customers.tenantId, tenantId), or(...duplicateBy)!)).limit(1);
          }

          if (duplicate) {
            summary.duplicated_count += 1;
            if (payload.onDuplicate === "skip_row") {
              summary.skipped_count += 1;
              summary.errors_count += 1;
              rowErrors.push({ rowNumber: row.rowNumber, errors: ["Se detectó un cliente duplicado (doc/email/teléfono)."] });
              continue;
            }
            if (payload.onDuplicate === "update_existing") {
              await tx.update(customers).set({
                name: sanitizeShortText(String(normalized.name || duplicate.name || ""), 200),
                phone: phone || duplicate.phone || null,
                email: email || duplicate.email || null,
                doc: doc || duplicate.doc || null,
                address: normalizeNullable(normalized.address || duplicate.address, 250),
                notes: normalizeNullable(normalized.notes || duplicate.notes, 500),
                updatedAt: new Date(),
              }).where(eq(customers.id, duplicate.id));
              summary.updated_count += 1;
            }
            summary.imported_count += 1;
            continue;
          }

          await tx.insert(customers).values({
            tenantId,
            name: sanitizeShortText(String(normalized.name || ""), 200),
            phone: phone || null,
            email: email || null,
            doc: doc || null,
            address: normalizeNullable(normalized.address, 250),
            notes: normalizeNullable(normalized.notes, 500),
          });
          summary.imported_count += 1;
        }

        if (summary.imported_count === 0) {
          throw new Error("IMPORT_NO_VALID_ROWS");
        }

        await tx.insert(importJobs).values({
          tenantId,
          entity: "customers",
          fileName: req.file!.originalname,
          processedRows: rows.length,
          successRows: summary.imported_count,
          errorRows: summary.errors_count,
          createdByUserId: userId,
        });
      });

      return res.json({ summary, errors: rowErrors, duplicatePolicy: payload.onDuplicate });
    } catch (err: any) {
      if (err?.message?.startsWith("EXCEL_IMPORT_MISSING_COLUMNS|")) {
        return res.status(400).json({ error: err.message.split("|")[1], code: "EXCEL_IMPORT_ERROR" });
      }
      if (err?.message === "IMPORT_NO_VALID_ROWS") {
        return res.status(400).json({ error: "No hay filas válidas para importar", code: "IMPORT_NO_VALID_ROWS" });
      }
      return res.status(500).json({ error: "No se pudo completar la importación", code: "IMPORT_COMMIT_ERROR" });
    } finally {
      cleanupUploadedFile(req);
    }
  });
}

function normalizeNullable(value: unknown, max: number) {
  const sanitized = sanitizeLongText(String(value || ""), max).trim();
  return sanitized ? sanitized : null;
}
