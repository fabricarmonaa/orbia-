import { db } from "../db";
import { eq } from "drizzle-orm";
import { tenantPdfSettings, type InsertTenantPdfSettings } from "@shared/schema";

export const DEFAULT_PDF_SETTINGS = {
  documentType: "PRICE_LIST",
  templateKey: "CLASSIC",
  pageSize: "A4",
  orientation: "portrait",
  showLogo: true,
  headerText: null as string | null,
  subheaderText: null as string | null,
  footerText: null as string | null,
  showBranchStock: true,
  showSku: false,
  showDescription: true,
  priceColumnLabel: "Precio",
  currencySymbol: "$",
  columns: ["name", "description", "price", "stock_total", "branch_stock"],
  styles: {
    fontSize: 10,
    headerSize: 16,
    subheaderSize: 12,
    tableHeaderSize: 10,
    rowHeight: 18,
  },
};

function mergeDefaults<T extends Record<string, unknown>>(defaults: T, value?: Record<string, unknown> | null) {
  return { ...defaults, ...(value || {}) } as T;
}

export const pdfSettingsStorage = {
  async getTenantPdfSettings(tenantId: number) {
    const [row] = await db
      .select()
      .from(tenantPdfSettings)
      .where(eq(tenantPdfSettings.tenantId, tenantId));

    if (!row) {
      return {
        id: null,
        tenantId,
        ...DEFAULT_PDF_SETTINGS,
        updatedAt: new Date(),
      };
    }

    // Coerce legacy INVOICE_B document type to PRICE_LIST
    const documentType = row.documentType === "INVOICE_B" ? "PRICE_LIST" : (row.documentType || DEFAULT_PDF_SETTINGS.documentType);

    return {
      id: row.id,
      tenantId,
      templateKey: row.templateKey,
      documentType,
      pageSize: row.pageSize,
      orientation: row.orientation,
      showLogo: row.showLogo,
      headerText: row.headerText,
      subheaderText: row.subheaderText,
      footerText: row.footerText,
      showBranchStock: row.showBranchStock,
      showSku: row.showSku,
      showDescription: row.showDescription,
      priceColumnLabel: row.priceColumnLabel,
      currencySymbol: row.currencySymbol,
      columns: Array.isArray(row.columnsJson) && row.columnsJson.length > 0
        ? row.columnsJson
        : DEFAULT_PDF_SETTINGS.columns,
      styles: mergeDefaults(DEFAULT_PDF_SETTINGS.styles, row.stylesJson as Record<string, unknown>),
      updatedAt: row.updatedAt,
    };
  },

  async upsertTenantPdfSettings(tenantId: number, payload: Partial<InsertTenantPdfSettings>) {
    const [existing] = await db
      .select()
      .from(tenantPdfSettings)
      .where(eq(tenantPdfSettings.tenantId, tenantId));

    if (existing) {
      const [updated] = await db
        .update(tenantPdfSettings)
        .set({
          templateKey: payload.templateKey ?? existing.templateKey,
          documentType: payload.documentType ?? existing.documentType,
          pageSize: payload.pageSize ?? existing.pageSize,
          orientation: payload.orientation ?? existing.orientation,
          showLogo: payload.showLogo ?? existing.showLogo,
          headerText: payload.headerText ?? existing.headerText,
          subheaderText: payload.subheaderText ?? existing.subheaderText,
          footerText: payload.footerText ?? existing.footerText,
          showBranchStock: payload.showBranchStock ?? existing.showBranchStock,
          showSku: payload.showSku ?? existing.showSku,
          showDescription: payload.showDescription ?? existing.showDescription,
          priceColumnLabel: payload.priceColumnLabel ?? existing.priceColumnLabel,
          currencySymbol: payload.currencySymbol ?? existing.currencySymbol,
          columnsJson: payload.columnsJson ?? existing.columnsJson,
          stylesJson: payload.stylesJson ?? existing.stylesJson,
          updatedAt: new Date(),
        })
        .where(eq(tenantPdfSettings.tenantId, tenantId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(tenantPdfSettings)
      .values({
        tenantId,
        documentType: payload.documentType || DEFAULT_PDF_SETTINGS.documentType,
        templateKey: payload.templateKey || DEFAULT_PDF_SETTINGS.templateKey,
        pageSize: payload.pageSize || DEFAULT_PDF_SETTINGS.pageSize,
        orientation: payload.orientation || DEFAULT_PDF_SETTINGS.orientation,
        showLogo: payload.showLogo ?? DEFAULT_PDF_SETTINGS.showLogo,
        headerText: payload.headerText ?? DEFAULT_PDF_SETTINGS.headerText,
        subheaderText: payload.subheaderText ?? DEFAULT_PDF_SETTINGS.subheaderText,
        footerText: payload.footerText ?? DEFAULT_PDF_SETTINGS.footerText,
        showBranchStock: payload.showBranchStock ?? DEFAULT_PDF_SETTINGS.showBranchStock,
        showSku: payload.showSku ?? DEFAULT_PDF_SETTINGS.showSku,
        showDescription: payload.showDescription ?? DEFAULT_PDF_SETTINGS.showDescription,
        priceColumnLabel: payload.priceColumnLabel || DEFAULT_PDF_SETTINGS.priceColumnLabel,
        currencySymbol: payload.currencySymbol || DEFAULT_PDF_SETTINGS.currencySymbol,
        columnsJson: payload.columnsJson ?? DEFAULT_PDF_SETTINGS.columns,
        stylesJson: mergeDefaults(DEFAULT_PDF_SETTINGS.styles, payload.stylesJson as Record<string, unknown>),
      })
      .returning();
    return created;
  },

  async resetTenantPdfSettings(tenantId: number) {
    await db.delete(tenantPdfSettings).where(eq(tenantPdfSettings.tenantId, tenantId));
    return this.getTenantPdfSettings(tenantId);
  },
};
