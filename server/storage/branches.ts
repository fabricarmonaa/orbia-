import { db } from "../db";
import { eq, and, isNull, count } from "drizzle-orm";
import { branches, type InsertBranch } from "@shared/schema";

export const branchStorage = {
  async getBranches(tenantId: number) {
    return db
      .select()
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), isNull(branches.deletedAt)));
  },
  async createBranch(data: InsertBranch) {
    const [branch] = await db.insert(branches).values(data).returning();
    return branch;
  },
  async getBranchById(id: number, tenantId: number) {
    const [branch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId), isNull(branches.deletedAt)));
    return branch;
  },
  async softDeleteBranch(id: number, tenantId: number) {
    const [branch] = await db
      .update(branches)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId), isNull(branches.deletedAt)))
      .returning();
    return branch;
  },
  async countBranchesByTenant(tenantId: number) {
    const [result] = await db
      .select({ count: count() })
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), isNull(branches.deletedAt)));
    return result?.count || 0;
  },
};
