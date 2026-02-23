import { db } from "../db";
import { eq, and, isNull, inArray, asc } from "drizzle-orm";
import { users, type InsertUser } from "@shared/schema";

export const userStorage = {
  async getUserById(id: number, tenantId: number) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId), isNull(users.deletedAt)));
    return user;
  },
  async getUserByEmail(email: string, tenantId?: number | null) {
    if (tenantId) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), eq(users.tenantId, tenantId), isNull(users.deletedAt)));
      return user;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    return user;
  },
  async getSuperAdminByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isSuperAdmin, true), isNull(users.deletedAt)));
    return user;
  },
  async createUser(data: InsertUser) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },
  async getBranchUsers(tenantId: number, branchId?: number) {
    const conditions = [
      eq(users.tenantId, tenantId),
      eq(users.scope, "BRANCH"),
      isNull(users.deletedAt),
    ];
    if (branchId) conditions.push(eq(users.branchId, branchId));
    return db.select().from(users).where(and(...conditions));
  },
  async updateUser(id: number, tenantId: number, data: Partial<InsertUser>) {
    const [user] = await db
      .update(users)
      .set(data)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
      .returning();
    return user;
  },
  async getTenantAdmins(tenantId: number) {
    return db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.role, "admin"),
          eq(users.isActive, true),
          isNull(users.deletedAt)
        )
      );
  },
  async getPrimaryTenantAdmin(tenantId: number) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.role, "admin"),
          isNull(users.deletedAt)
        )
      )
      .orderBy(asc(users.createdAt))
      .limit(1);
    return user;
  },
  async getUsersByIds(tenantId: number, userIds: number[]) {
    if (!userIds.length) return [];
    return db
      .select()
      .from(users)
      .where(
        and(eq(users.tenantId, tenantId), inArray(users.id, userIds), isNull(users.deletedAt))
      );
  },
  async softDeleteUser(id: number, tenantId: number) {
    const [user] = await db
      .update(users)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
      .returning();
    return user;
  },
};
