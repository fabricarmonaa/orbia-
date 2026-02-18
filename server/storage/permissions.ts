import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { permissions, userPermissions, type InsertPermission, type InsertUserPermission } from "@shared/schema";

export const permissionStorage = {
    async getPermissionByKey(key: string) {
        const [permission] = await db
            .select()
            .from(permissions)
            .where(eq(permissions.key, key));
        return permission;
    },

    async createPermission(data: InsertPermission) {
        const [permission] = await db.insert(permissions).values(data).returning();
        return permission;
    },

    async userHasPermission(userId: number, tenantId: number, permissionKey: string): Promise<boolean> {
        const permission = await this.getPermissionByKey(permissionKey);
        if (!permission) return false;

        const [userPerm] = await db
            .select()
            .from(userPermissions)
            .where(
                and(
                    eq(userPermissions.userId, userId),
                    eq(userPermissions.tenantId, tenantId),
                    eq(userPermissions.permissionId, permission.id)
                )
            );

        return !!userPerm;
    },

    async grantPermission(data: {
        userId: number;
        tenantId: number;
        permissionKey: string;
        grantedById: number;
    }) {
        const permission = await this.getPermissionByKey(data.permissionKey);
        if (!permission) {
            throw new Error(`Permission ${data.permissionKey} not found`);
        }

        const [userPerm] = await db
            .insert(userPermissions)
            .values({
                userId: data.userId,
                tenantId: data.tenantId,
                permissionId: permission.id,
                grantedById: data.grantedById,
            })
            .returning();

        return userPerm;
    },

    async revokePermission(userId: number, tenantId: number, permissionKey: string) {
        const permission = await this.getPermissionByKey(permissionKey);
        if (!permission) return;

        await db
            .delete(userPermissions)
            .where(
                and(
                    eq(userPermissions.userId, userId),
                    eq(userPermissions.tenantId, tenantId),
                    eq(userPermissions.permissionId, permission.id)
                )
            );
    },

    async getUserPermissions(userId: number, tenantId: number) {
        return db
            .select({
                id: userPermissions.id,
                permission: permissions,
                grantedAt: userPermissions.grantedAt,
                grantedById: userPermissions.grantedById,
            })
            .from(userPermissions)
            .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
            .where(
                and(
                    eq(userPermissions.userId, userId),
                    eq(userPermissions.tenantId, tenantId)
                )
            );
    },
};
