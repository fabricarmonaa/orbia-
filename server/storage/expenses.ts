import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
    expenseCategories,
    fixedExpenses,
    expenseDefinitions,
    type InsertExpenseCategory,
    type InsertFixedExpense,
    type InsertExpenseDefinition,
} from "@shared/schema";

export const expenseStorage = {
    // Expense Definitions
    async listExpenseDefinitions(tenantId: number, type?: string) {
        const conditions = [eq(expenseDefinitions.tenantId, tenantId)];
        if (type) conditions.push(eq(expenseDefinitions.type, type));
        return db
            .select()
            .from(expenseDefinitions)
            .where(and(...conditions));
    },

    async getExpenseDefinitionById(id: number, tenantId: number) {
        const [definition] = await db
            .select()
            .from(expenseDefinitions)
            .where(and(
                eq(expenseDefinitions.id, id),
                eq(expenseDefinitions.tenantId, tenantId)
            ));
        return definition;
    },

    async createExpenseDefinition(data: InsertExpenseDefinition) {
        const [definition] = await db
            .insert(expenseDefinitions)
            .values(data)
            .returning();
        return definition;
    },

    async updateExpenseDefinition(
        id: number,
        tenantId: number,
        data: Partial<InsertExpenseDefinition>
    ) {
        const [definition] = await db
            .update(expenseDefinitions)
            .set({ ...data, updatedAt: new Date() })
            .where(and(
                eq(expenseDefinitions.id, id),
                eq(expenseDefinitions.tenantId, tenantId)
            ))
            .returning();
        return definition;
    },

    async deleteExpenseDefinition(id: number, tenantId: number) {
        await db
            .delete(expenseDefinitions)
            .where(and(
                eq(expenseDefinitions.id, id),
                eq(expenseDefinitions.tenantId, tenantId)
            ));
    },

    // Expense Categories
    async getExpenseCategories(tenantId: number) {
        return db
            .select()
            .from(expenseCategories)
            .where(eq(expenseCategories.tenantId, tenantId));
    },

    async getExpenseCategoryById(id: number, tenantId: number) {
        const [category] = await db
            .select()
            .from(expenseCategories)
            .where(and(
                eq(expenseCategories.id, id),
                eq(expenseCategories.tenantId, tenantId)
            ));
        return category;
    },

    async createExpenseCategory(data: InsertExpenseCategory) {
        const [category] = await db
            .insert(expenseCategories)
            .values(data)
            .returning();
        return category;
    },

    async updateExpenseCategory(
        id: number,
        tenantId: number,
        data: Partial<InsertExpenseCategory>
    ) {
        const [category] = await db
            .update(expenseCategories)
            .set(data)
            .where(and(
                eq(expenseCategories.id, id),
                eq(expenseCategories.tenantId, tenantId)
            ))
            .returning();
        return category;
    },

    async deleteExpenseCategory(id: number, tenantId: number) {
        await db
            .delete(expenseCategories)
            .where(and(
                eq(expenseCategories.id, id),
                eq(expenseCategories.tenantId, tenantId)
            ));
    },

    // Fixed Expenses
    async getFixedExpenses(tenantId: number) {
        return db
            .select()
            .from(fixedExpenses)
            .where(eq(fixedExpenses.tenantId, tenantId));
    },

    async getFixedExpenseById(id: number, tenantId: number) {
        const [expense] = await db
            .select()
            .from(fixedExpenses)
            .where(and(
                eq(fixedExpenses.id, id),
                eq(fixedExpenses.tenantId, tenantId)
            ));
        return expense;
    },

    async createFixedExpense(data: InsertFixedExpense) {
        const [expense] = await db
            .insert(fixedExpenses)
            .values(data)
            .returning();
        return expense;
    },

    async updateFixedExpense(
        id: number,
        tenantId: number,
        data: Partial<InsertFixedExpense>
    ) {
        const [expense] = await db
            .update(fixedExpenses)
            .set(data)
            .where(and(
                eq(fixedExpenses.id, id),
                eq(fixedExpenses.tenantId, tenantId)
            ))
            .returning();
        return expense;
    },

    async toggleFixedExpenseActive(id: number, tenantId: number, isActive: boolean) {
        await db
            .update(fixedExpenses)
            .set({ isActive })
            .where(and(
                eq(fixedExpenses.id, id),
                eq(fixedExpenses.tenantId, tenantId)
            ));
    },
};
