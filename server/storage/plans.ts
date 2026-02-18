import { db } from "../db";
import { eq } from "drizzle-orm";
import { plans, type InsertPlan } from "@shared/schema";

export const planStorage = {
  async getPlans() {
    return db.select().from(plans).where(eq(plans.isActive, true));
  },
  async getPlanById(id: number) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  },
  async createPlan(data: InsertPlan) {
    const [plan] = await db.insert(plans).values(data).returning();
    return plan;
  },
};
