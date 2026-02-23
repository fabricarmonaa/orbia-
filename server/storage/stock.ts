import { db } from "../db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { productStockByBranch, stockMovements, branches, type InsertProductStockByBranch, type InsertStockMovement } from "@shared/schema";

export const stockStorage = {
  async getProductStockByBranch(productId: number, tenantId: number) {
    return db
      .select()
      .from(productStockByBranch)
      .where(and(eq(productStockByBranch.productId, productId), eq(productStockByBranch.tenantId, tenantId)));
  },
  async getStockSummaryByTenant(tenantId: number) {
    return db
      .select({
        productId: productStockByBranch.productId,
        branchId: productStockByBranch.branchId,
        stock: productStockByBranch.stock,
        branchName: branches.name,
      })
      .from(productStockByBranch)
      .innerJoin(branches, eq(productStockByBranch.branchId, branches.id))
      .where(and(eq(productStockByBranch.tenantId, tenantId), isNull(branches.deletedAt)));
  },
  async getBranchStockCount(tenantId: number, branchId: number) {
    const rows = await db
      .select({ stock: productStockByBranch.stock })
      .from(productStockByBranch)
      .where(
        and(
          eq(productStockByBranch.tenantId, tenantId),
          eq(productStockByBranch.branchId, branchId)
        )
      );
    return rows.filter((row) => row.stock > 0).length;
  },
  async upsertProductStockByBranch(data: InsertProductStockByBranch) {
    const [existing] = await db
      .select()
      .from(productStockByBranch)
      .where(
        and(
          eq(productStockByBranch.productId, data.productId),
          eq(productStockByBranch.branchId, data.branchId),
          eq(productStockByBranch.tenantId, data.tenantId)
        )
      );
    if (existing) {
      const [updated] = await db
        .update(productStockByBranch)
        .set({ stock: data.stock })
        .where(eq(productStockByBranch.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(productStockByBranch).values(data).returning();
    return created;
  },
  async getStockMovements(productId: number, tenantId: number) {
    return db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, productId), eq(stockMovements.tenantId, tenantId)))
      .orderBy(desc(stockMovements.createdAt));
  },
  async createStockMovement(data: InsertStockMovement) {
    const [movement] = await db.insert(stockMovements).values(data).returning();
    return movement;
  },
};
