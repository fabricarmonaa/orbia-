import { storage } from "../storage";
import { sql } from "drizzle-orm";

/**
 * Imputa gastos fijos del mes actual que aún no fueron imputados
 */
export async function imputeMonthlyFixedExpenses(tenantId: number) {
    const expenses = await storage.getFixedExpenses(tenantId);
    const activeExpenses = expenses.filter(e => e.isActive && e.periodicity === "monthly");

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    for (const expense of activeExpenses) {
        // Check if already imputed this month
        const movements = await storage.getCashMovements(tenantId);
        const alreadyImputed = movements.some(m => {
            const movDate = new Date(m.createdAt);
            return (
                m.type === "egreso" &&
                m.description?.includes(`[GASTO FIJO] ${expense.name}`) &&
                movDate.getMonth() === currentMonth &&
                movDate.getFullYear() === currentYear
            );
        });

        if (!alreadyImputed) {
            // Get category name if exists
            let categoryName = null;
            if (expense.categoryId) {
                const category = await storage.getExpenseCategoryById(expense.categoryId, tenantId);
                categoryName = category?.name || null;
            }

            // Impute as cash movement
            await storage.createCashMovement({
                tenantId,
                type: "egreso",
                amount: expense.amount,
                method: "automatico",
                category: categoryName,
                description: `[GASTO FIJO] ${expense.name}`,
                sessionId: null,
                branchId: null,
                createdById: null,
            });
        }
    }

    return activeExpenses.length;
}

/**
 * Helper para ejecutar imputación al inicio del mes para todos los tenants activos
 */
export async function imputeFixedExpensesForAllTenants() {
    const tenants = await storage.getTenants();
    let totalImputed = 0;

    for (const tenant of tenants) {
        if (tenant.isActive) {
            const count = await imputeMonthlyFixedExpenses(tenant.id);
            totalImputed += count;
        }
    }

    return totalImputed;
}
