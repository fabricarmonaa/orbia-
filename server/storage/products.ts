import { db } from "../db";
import { eq, and, desc, count, or, ilike } from "drizzle-orm";
import { products, productCategories, type InsertProduct, type InsertProductCategory } from "@shared/schema";

export function normalizeProductCode(raw: string | null | undefined) {
  return (raw || "").toUpperCase().replace(/\s+/g, "").trim();
}

export const productStorage = {
  async getProductCategories(tenantId: number) {
    return db
      .select()
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .orderBy(productCategories.sortOrder);
  },
  async createProductCategory(data: InsertProductCategory) {
    const [cat] = await db.insert(productCategories).values(data).returning();
    return cat;
  },
  async getProducts(tenantId: number) {
    return db
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(desc(products.createdAt));
  },
  async getProductById(id: number, tenantId: number) {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
    return product;
  },

  async getProductByCode(tenantId: number, code: string) {
    const term = normalizeProductCode(code);
    if (!term) return undefined;
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), or(eq(products.sku, term), ilike(products.sku, term))))
      .limit(1);
    return product;
  },
  async createProduct(data: InsertProduct) {
    const payload: InsertProduct = {
      ...data,
      sku: data.sku ? normalizeProductCode(data.sku) : null,
    };
    const [product] = await db.insert(products).values(payload).returning();
    return product;
  },
  async updateProduct(id: number, tenantId: number, data: Partial<InsertProduct>) {
    const nextData: Partial<InsertProduct> = {
      ...data,
      ...(data.sku !== undefined ? { sku: data.sku ? normalizeProductCode(data.sku) : null } : {}),
    };
    const [product] = await db
      .update(products)
      .set(nextData)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();
    return product;
  },
  async toggleProductActive(id: number, tenantId: number, isActive: boolean) {
    await db
      .update(products)
      .set({ isActive })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
  },
  async countProducts(tenantId: number) {
    const [result] = await db
      .select({ count: count() })
      .from(products)
      .where(eq(products.tenantId, tenantId));
    return result?.count || 0;
  },
};
