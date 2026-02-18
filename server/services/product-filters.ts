import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { productStockByBranch, products } from "@shared/schema";

const emptyToUndefined = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
};

const statusSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") return value.toLowerCase();
    return value;
  },
  z.enum(["active", "inactive", "all"])
);

export const productFiltersSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  categoryId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  status: statusSchema.optional().default("all"),
  state: statusSchema.optional(),
  minPrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  maxPrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  stock: z.preprocess(
    (value) => (typeof value === "string" ? value.toLowerCase() : value),
    z.enum(["all", "in", "out", "low"]).optional().default("all")
  ),
  lowStockThreshold: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(9999).optional().default(5)),
  sort: z.preprocess(
    (value) => (typeof value === "string" ? value : "createdAt"),
    z.enum(["name", "price", "stock", "createdAt"]).optional().default("createdAt")
  ),
  dir: z.preprocess(
    (value) => (typeof value === "string" ? value.toLowerCase() : "desc"),
    z.enum(["asc", "desc"]).optional().default("desc")
  ),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional().default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).optional().default(20)),
});

export type ProductFilters = Omit<z.infer<typeof productFiltersSchema>, "state"> & { state?: "active" | "inactive" | "all" };

export async function queryProductsByFilters(
  tenantId: number,
  hasBranches: boolean,
  filters: ProductFilters,
  options?: { productIds?: number[]; noPagination?: boolean }
) {
  const status = filters.status ?? filters.state ?? "all";
  const stockAgg = db
    .select({
      productId: productStockByBranch.productId,
      stockTotal: sql<number>`COALESCE(SUM(${productStockByBranch.stock}), 0)`.as("stock_total"),
    })
    .from(productStockByBranch)
    .where(eq(productStockByBranch.tenantId, tenantId))
    .groupBy(productStockByBranch.productId)
    .as("stock_agg");

  const stockExpr = hasBranches
    ? sql<number>`COALESCE(${stockAgg.stockTotal}, 0)`
    : sql<number>`COALESCE(${products.stock}, 0)`;

  const conditions: any[] = [eq(products.tenantId, tenantId)];
  if (options?.productIds) {
    if (!options.productIds.length) {
      return { data: [], total: 0 };
    }
    conditions.push(inArray(products.id, options.productIds));
  }

  if (filters.q) {
    const q = `%${filters.q}%`;
    conditions.push(or(ilike(products.name, q), ilike(products.sku, q), ilike(products.description, q)));
  }
  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (status === "active") conditions.push(eq(products.isActive, true));
  if (status === "inactive") conditions.push(eq(products.isActive, false));
  if (filters.minPrice !== undefined) conditions.push(sql`${products.price} >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined) conditions.push(sql`${products.price} <= ${filters.maxPrice}`);

  if (filters.stock === "in") conditions.push(sql`${stockExpr} > 0`);
  if (filters.stock === "out") conditions.push(sql`${stockExpr} = 0`);
  if (filters.stock === "low") conditions.push(sql`${stockExpr} <= ${filters.lowStockThreshold ?? 5}`);

  const whereClause = and(...conditions);

  const orderExpr =
    filters.sort === "name"
      ? products.name
      : filters.sort === "price"
        ? products.price
        : filters.sort === "stock"
          ? stockExpr
          : products.createdAt;

  const orderBy = filters.dir === "asc" ? asc(orderExpr) : desc(orderExpr);

  const fromQuery = db
    .select({
      id: products.id,
      tenantId: products.tenantId,
      categoryId: products.categoryId,
      name: products.name,
      description: products.description,
      price: products.price,
      cost: products.cost,
      stock: products.stock,
      sku: products.sku,
      isActive: products.isActive,
      createdAt: products.createdAt,
      stockTotal: stockExpr.as("stock_total"),
    })
    .from(products)
    .leftJoin(stockAgg, eq(stockAgg.productId, products.id))
    .where(whereClause)
    .orderBy(orderBy);

  const totalQuery = db
    .select({ count: count() })
    .from(products)
    .leftJoin(stockAgg, eq(stockAgg.productId, products.id))
    .where(whereClause);

  const [{ count: total }] = await totalQuery;

  if (options?.noPagination) {
    const data = await fromQuery;
    return { data, total };
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const data = await fromQuery.limit(pageSize).offset(offset);
  return { data, total };
}
