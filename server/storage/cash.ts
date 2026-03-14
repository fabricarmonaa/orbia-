import { db, pool } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  cashSessions,
  cashMovements,
  tenantMonthlySummaries,
  type InsertCashSession,
  type InsertCashMovement,
  type InsertTenantMonthlySummary,
} from "@shared/schema";


async function getCashMovementColumnsSet() {
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cash_movements'
    `,
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function supportsCashMovementColumnName(columnName: string) {
  const columns = await getCashMovementColumnsSet();
  return columns.has(columnName);
}

async function sanitizeCashMovementInsertPayload(data: InsertCashMovement) {
  const columns = await getCashMovementColumnsSet();
  const payload: Record<string, unknown> = { ...data };
  if (!columns.has("impacts_cash")) delete payload.impactsCash;
  if (!columns.has("associated_cost")) delete payload.associatedCost;
  if (!columns.has("expense_definition_id")) delete payload.expenseDefinitionId;
  if (!columns.has("expense_definition_name")) delete payload.expenseDefinitionName;
  if (!columns.has("entity_type")) delete payload.entityType;
  if (!columns.has("entity_id")) delete payload.entityId;
  if (!columns.has("created_by_id")) delete payload.createdById;
  if (!columns.has("sale_id")) delete payload.saleId;
  if (!columns.has("order_id")) delete payload.orderId;
  return payload as InsertCashMovement;
}

type SqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: any[] } | any[]>;
};

function toDbColumnName(key: string) {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

async function insertCashMovementWithExecutor(executor: SqlExecutor, data: InsertCashMovement) {
  const payload = await sanitizeCashMovementInsertPayload(data);
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw new Error("CASH_MOVEMENT_EMPTY_PAYLOAD");
  }

  const columnList = sql.join(entries.map(([key]) => sql.raw(toDbColumnName(key))), sql`, `);
  const valuesList = sql.join(entries.map(([, value]) => sql`${value}`), sql`, `);
  const result = await executor.execute(sql`INSERT INTO cash_movements (${columnList}) VALUES (${valuesList}) RETURNING *`);
  const rows = Array.isArray(result) ? result : (result?.rows || []);
  return (rows[0] || null) as any;
}

export const cashStorage = {
  async getCashMovementColumns() {
    return getCashMovementColumnsSet();
  },

  async supportsCashMovementColumn(columnName: string) {
    return supportsCashMovementColumnName(columnName);
  },

  async getCashSessions(tenantId: number) {
    return db
      .select()
      .from(cashSessions)
      .where(eq(cashSessions.tenantId, tenantId))
      .orderBy(desc(cashSessions.openedAt));
  },
  async getOpenSession(tenantId: number, branchId?: number | null) {
    const conditions = [
      eq(cashSessions.tenantId, tenantId),
      eq(cashSessions.status, "open"),
    ];
    if (branchId) {
      conditions.push(eq(cashSessions.branchId, branchId));
    }
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(and(...conditions));
    return session;
  },
  async createCashSession(data: InsertCashSession) {
    const [session] = await db.insert(cashSessions).values(data).returning();
    return session;
  },
  async closeCashSession(id: number, tenantId: number, branchId: number | null, closingAmount: string) {
    const conditions = [
      eq(cashSessions.id, id),
      eq(cashSessions.tenantId, tenantId),
      eq(cashSessions.status, "open"),
    ];

    // If branchId is provided, validate branch ownership
    if (branchId !== null) {
      conditions.push(eq(cashSessions.branchId, branchId));
    }

    const [session] = await db
      .select()
      .from(cashSessions)
      .where(and(...conditions));

    if (!session) {
      throw new Error("No hay caja abierta o no tenés acceso a esta caja");
    }

    const diff = parseFloat(closingAmount) - parseFloat(session.openingAmount);
    await db
      .update(cashSessions)
      .set({
        status: "closed",
        closingAmount,
        difference: String(diff),
        closedAt: new Date(),
      })
      .where(and(eq(cashSessions.id, id), eq(cashSessions.tenantId, tenantId)));
  },
  async getCashMovements(tenantId: number) {
    const columns = await getCashMovementColumnsSet();
    const pick = (columnName: string, alias: string, fallbackSql: string) =>
      columns.has(columnName) ? `${columnName} AS "${alias}"` : `${fallbackSql} AS "${alias}"`;

    const result = await pool.query(
      `
      SELECT
        id,
        tenant_id AS "tenantId",
        session_id AS "sessionId",
        branch_id AS "branchId",
        type,
        amount,
        method,
        category,
        description,
        ${pick("expense_definition_id", "expenseDefinitionId", "NULL")},
        ${pick("impacts_cash", "impactsCash", "true")},
        ${pick("expense_definition_name", "expenseDefinitionName", "NULL")},
        ${pick("order_id", "orderId", "NULL")},
        ${pick("sale_id", "saleId", "NULL")},
        ${pick("associated_cost", "associatedCost", "0")},
        ${pick("entity_type", "entityType", "NULL")},
        ${pick("entity_id", "entityId", "NULL")},
        ${pick("created_by_id", "createdById", "NULL")},
        created_at AS "createdAt"
      FROM cash_movements
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `,
      [tenantId],
    );
    return result.rows as any[];
  },
  async createCashMovement(data: InsertCashMovement) {
    return insertCashMovementWithExecutor(db as unknown as SqlExecutor, data);
  },

  async sanitizeCashMovementForInsert(data: InsertCashMovement) {
    return sanitizeCashMovementInsertPayload(data);
  },

  async insertCashMovementWithTx(executor: SqlExecutor, data: InsertCashMovement) {
    return insertCashMovementWithExecutor(executor, data);
  },
  async getCashMovementById(id: number, tenantId: number) {
    const [movement] = await db
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.id, id), eq(cashMovements.tenantId, tenantId)));
    return movement;
  },
  async updateCashMovement(id: number, tenantId: number, data: Partial<InsertCashMovement>) {
    const columns = await getCashMovementColumnsSet();
    const payload: Record<string, unknown> = { ...data };
    if (!columns.has("impacts_cash")) delete payload.impactsCash;
    if (!columns.has("associated_cost")) delete payload.associatedCost;
    const [updated] = await db
      .update(cashMovements)
      .set(payload as Partial<InsertCashMovement>)
      .where(and(eq(cashMovements.id, id), eq(cashMovements.tenantId, tenantId)))
      .returning();
    return updated;
  },
  async getMonthlyIncome(tenantId: number, branchId?: number | null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const conditions = [
      eq(cashMovements.tenantId, tenantId),
      eq(cashMovements.type, "ingreso"),
      sql`${cashMovements.createdAt} >= ${startOfMonth}`,
    ];
    if (branchId) conditions.push(eq(cashMovements.branchId, branchId));
    const supportsImpactsCash = await supportsCashMovementColumnName("impacts_cash");
    if (supportsImpactsCash) {
      conditions.push(sql`impacts_cash = true` as any);
    }
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` })
      .from(cashMovements)
      .where(and(...conditions));
    return parseFloat(result[0]?.total || "0");
  },
  async getMonthlyExpenses(tenantId: number, branchId?: number | null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const conditions = [
      eq(cashMovements.tenantId, tenantId),
      eq(cashMovements.type, "egreso"),
      sql`${cashMovements.createdAt} >= ${startOfMonth}`,
    ];
    if (branchId) conditions.push(eq(cashMovements.branchId, branchId));
    const supportsImpactsCash = await supportsCashMovementColumnName("impacts_cash");
    if (supportsImpactsCash) {
      conditions.push(sql`impacts_cash = true` as any);
    }
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` })
      .from(cashMovements)
      .where(and(...conditions));
    return parseFloat(result[0]?.total || "0");
  },
  async getMonthlyExpensesByType(tenantId: number, branchId?: number | null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // 1. Sum up budgeted (configured) expenses
    const budgets = await db.execute(sql`
      SELECT type, COALESCE(SUM(default_amount), 0) as total
      FROM expense_definitions
      WHERE tenant_id = ${tenantId} AND is_active = true
      GROUP BY type
    `);

    let fixed = 0;
    let variable = 0;
    for (const row of budgets.rows as any[]) {
      if (row.type === 'FIXED') fixed += parseFloat(row.total || "0");
      if (row.type === 'VARIABLE') variable += parseFloat(row.total || "0");
    }

    // 2. Sum up actual unlinked cash movements (to avoid double-counting recorded expenses)
    let branchCondition = sql``;
    if (branchId) {
      branchCondition = sql`AND branch_id = ${branchId}`;
    }

    const unlinkedActuals = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM cash_movements
      WHERE tenant_id = ${tenantId}
        AND type = 'egreso'
        AND created_at >= ${startOfMonth}
        AND expense_definition_id IS NULL
        ${branchCondition}
    `);

    const unlinked = parseFloat((unlinkedActuals.rows[0] as any)?.total || "0");
    variable += unlinked;

    return { fixed, variable };
  },
  async getTodayIncome(tenantId: number, branchId?: number | null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions = [
      eq(cashMovements.tenantId, tenantId),
      eq(cashMovements.type, "ingreso"),
      sql`${cashMovements.createdAt} >= ${today}`,
    ];
    if (branchId) conditions.push(eq(cashMovements.branchId, branchId));
    const supportsImpactsCash = await supportsCashMovementColumnName("impacts_cash");
    if (supportsImpactsCash) {
      conditions.push(sql`impacts_cash = true` as any);
    }
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` })
      .from(cashMovements)
      .where(and(...conditions));
    return parseFloat(result[0]?.total || "0");
  },
  async getTodayExpenses(tenantId: number, branchId?: number | null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions = [
      eq(cashMovements.tenantId, tenantId),
      eq(cashMovements.type, "egreso"),
      sql`${cashMovements.createdAt} >= ${today}`,
    ];
    if (branchId) conditions.push(eq(cashMovements.branchId, branchId));
    const supportsImpactsCash = await supportsCashMovementColumnName("impacts_cash");
    if (supportsImpactsCash) {
      conditions.push(sql`impacts_cash = true` as any);
    }
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` })
      .from(cashMovements)
      .where(and(...conditions));
    return parseFloat(result[0]?.total || "0");
  },
  async getCashSessionsByBranch(tenantId: number, branchId: number) {
    return db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, tenantId), eq(cashSessions.branchId, branchId)))
      .orderBy(desc(cashSessions.openedAt));
  },
  async getCashMovementsByBranch(tenantId: number, branchId: number) {
    const columns = await getCashMovementColumnsSet();
    const pick = (columnName: string, alias: string, fallbackSql: string) =>
      columns.has(columnName) ? `${columnName} AS "${alias}"` : `${fallbackSql} AS "${alias}"`;

    const result = await pool.query(
      `
      SELECT
        id,
        tenant_id AS "tenantId",
        session_id AS "sessionId",
        branch_id AS "branchId",
        type,
        amount,
        method,
        category,
        description,
        ${pick("expense_definition_id", "expenseDefinitionId", "NULL")},
        ${pick("impacts_cash", "impactsCash", "true")},
        ${pick("expense_definition_name", "expenseDefinitionName", "NULL")},
        ${pick("order_id", "orderId", "NULL")},
        ${pick("sale_id", "saleId", "NULL")},
        ${pick("associated_cost", "associatedCost", "0")},
        ${pick("entity_type", "entityType", "NULL")},
        ${pick("entity_id", "entityId", "NULL")},
        ${pick("created_by_id", "createdById", "NULL")},
        created_at AS "createdAt"
      FROM cash_movements
      WHERE tenant_id = $1
        AND branch_id = $2
      ORDER BY created_at DESC
    `,
      [tenantId, branchId],
    );
    return result.rows as any[];
  },

  async getTenantMonthlySummary(tenantId: number, year: number, month: number) {
    const [summary] = await db
      .select()
      .from(tenantMonthlySummaries)
      .where(
        and(
          eq(tenantMonthlySummaries.tenantId, tenantId),
          eq(tenantMonthlySummaries.year, year),
          eq(tenantMonthlySummaries.month, month)
        )
      );
    return summary;
  },

  async upsertTenantMonthlySummary(data: InsertTenantMonthlySummary) {
    const [existing] = await db
      .select()
      .from(tenantMonthlySummaries)
      .where(
        and(
          eq(tenantMonthlySummaries.tenantId, data.tenantId),
          eq(tenantMonthlySummaries.year, data.year),
          eq(tenantMonthlySummaries.month, data.month)
        )
      );
    if (existing) {
      const [updated] = await db
        .update(tenantMonthlySummaries)
        .set({ totalsJson: data.totalsJson, createdAt: new Date() })
        .where(eq(tenantMonthlySummaries.id, existing.id))
        .returning();
      return updated;
    }
    const insertData: typeof tenantMonthlySummaries.$inferInsert = {
      tenantId: data.tenantId,
      year: data.year,
      month: data.month,
      totalsJson: data.totalsJson,
    };
    const [created] = await db
      .insert(tenantMonthlySummaries)
      .values(insertData)
      .returning();
    return created;
  },

  async getExpensesBreakdown(tenantId: number, dateFrom: Date, dateTo: Date) {
    const movements = await db
      .select()
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.tenantId, tenantId),
          eq(cashMovements.type, "egreso"),
          sql`${cashMovements.createdAt} >= ${dateFrom}`,
          sql`${cashMovements.createdAt} <= ${dateTo}`
        )
      );

    // Group by category
    const breakdown: Record<string, number> = {};
    for (const m of movements) {
      const cat = m.category || "Sin categoría";
      breakdown[cat] = (breakdown[cat] || 0) + parseFloat(m.amount);
    }

    return breakdown;
  },
};
