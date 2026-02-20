import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { cashiers, type InsertCashier } from "@shared/schema";

export const cashierStorage = {
  async getCashierById(id: number, tenantId: number) {
    const [row] = await db.select().from(cashiers).where(and(eq(cashiers.id, id), eq(cashiers.tenantId, tenantId)));
    return row;
  },

  async getCashiers(tenantId: number) {
    return db.select().from(cashiers).where(eq(cashiers.tenantId, tenantId));
  },

  async getActiveCashiers(tenantId: number) {
    return db.select().from(cashiers).where(and(eq(cashiers.tenantId, tenantId), eq(cashiers.active, true)));
  },

  async createCashier(data: InsertCashier) {
    const [row] = await db.insert(cashiers).values(data).returning();
    return row;
  },

  async updateCashier(id: number, tenantId: number, data: Partial<InsertCashier>) {
    const [row] = await db
      .update(cashiers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cashiers.id, id), eq(cashiers.tenantId, tenantId)))
      .returning();
    return row;
  },

  async deactivateCashier(id: number, tenantId: number) {
    const [row] = await db
      .update(cashiers)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(cashiers.id, id), eq(cashiers.tenantId, tenantId)))
      .returning();
    return row;
  },
};
