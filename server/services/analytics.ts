import { pool } from "../db";

export type RangeKey = "7d" | "30d" | "90d";

function parseRange(range?: string): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function branchClause(branchId?: number | null) {
  return branchId ? { sql: " AND branch_id = $2", params: [branchId] } : { sql: "", params: [] as any[] };
}

export async function getDashboardSummary(tenantId: number, branchId?: number | null) {
  const [todaySales, monthSales, monthProfit, orderStatus, branches] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(total_revenue),0) AS revenue FROM mv_sales_summary WHERE tenant_id = $1 ${branchId ? "AND branch_id = $2" : ""} AND date = CURRENT_DATE`, branchId ? [tenantId, branchId] : [tenantId]),
    pool.query(`SELECT COALESCE(SUM(total_revenue),0) AS revenue FROM mv_sales_summary WHERE tenant_id = $1 ${branchId ? "AND branch_id = $2" : ""} AND date >= date_trunc('month', CURRENT_DATE)::date`, branchId ? [tenantId, branchId] : [tenantId]),
    pool.query(`
      SELECT
        COALESCE(SUM(total_income),0) AS total_income,
        COALESCE(SUM(total_expenses),0) AS total_expenses,
        COALESCE(SUM(gross_profit),0) AS gross_profit
      FROM mv_profit_summary
      WHERE tenant_id = $1
        AND date >= date_trunc('month', CURRENT_DATE)::date
    `, [tenantId]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE os.is_final = true) AS completed,
        COUNT(*) FILTER (WHERE os.is_final = false OR os.is_final IS NULL) AS pending
      FROM orders o
      LEFT JOIN order_statuses os ON os.id = o.status_id
      WHERE o.tenant_id = $1
    `, [tenantId]),
    pool.query(`
      SELECT b.id AS branch_id, b.name AS branch_name, COALESCE(SUM(s.total_revenue),0) AS revenue
      FROM branches b
      LEFT JOIN mv_sales_summary s ON s.tenant_id = b.tenant_id AND s.branch_id = b.id
      WHERE b.tenant_id = $1 ${branchId ? "AND b.id = $2" : ""}
      GROUP BY b.id, b.name
      ORDER BY revenue DESC, b.name ASC
    `, branchId ? [tenantId, branchId] : [tenantId]),
  ]);

  return {
    salesToday: Number(todaySales.rows[0]?.revenue || 0),
    salesMonth: Number(monthSales.rows[0]?.revenue || 0),
    expensesMonth: Number(monthProfit.rows[0]?.total_expenses || 0),
    marginMonth: Number(monthProfit.rows[0]?.gross_profit || 0),
    incomeMonth: Number(monthProfit.rows[0]?.total_income || 0),
    orders: {
      completed: Number(orderStatus.rows[0]?.completed || 0),
      pending: Number(orderStatus.rows[0]?.pending || 0),
    },
    branches: branches.rows.map((row) => ({
      branchId: Number(row.branch_id),
      branchName: String(row.branch_name || "Sucursal"),
      revenue: Number(row.revenue || 0),
    })),
  };
}

export async function getTopProducts(tenantId: number, limit = 10, branchId?: number | null) {
  const { rows } = await pool.query(
    `SELECT product_id, product_name, total_sold, total_revenue
     FROM mv_top_products
     WHERE tenant_id = $1
     ORDER BY total_revenue DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map((row) => ({
    productId: Number(row.product_id),
    productName: String(row.product_name || "Producto"),
    totalSold: Number(row.total_sold || 0),
    totalRevenue: Number(row.total_revenue || 0),
  }));
}

export async function getTopCustomers(tenantId: number, limit = 10, branchId?: number | null) {
  const { rows } = await pool.query(
    `SELECT customer_id, customer_name, total_orders, total_spent
     FROM mv_top_customers
     WHERE tenant_id = $1
     ORDER BY total_spent DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map((row) => ({
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name || "Cliente"),
    totalOrders: Number(row.total_orders || 0),
    totalSpent: Number(row.total_spent || 0),
  }));
}

export async function getTopTechnicians(tenantId: number, limit = 10, branchId?: number | null) {
  const { rows } = await pool.query(
    `SELECT technician_name, completed_orders, total_revenue
     FROM mv_top_technicians
     WHERE tenant_id = $1
     ORDER BY total_revenue DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map((row) => ({
    technicianName: String(row.technician_name || "Sin técnico"),
    completedOrders: Number(row.completed_orders || 0),
    totalRevenue: Number(row.total_revenue || 0),
  }));
}

export async function getSalesOverTime(tenantId: number, range: RangeKey | string = "30d", branchId?: number | null) {
  const days = parseRange(range);
  const { rows } = await pool.query(
    `SELECT date, COALESCE(SUM(total_revenue),0) AS total_revenue
     FROM mv_sales_summary
     WHERE tenant_id = $1
       ${branchId ? "AND branch_id = $3" : ""}
       AND date >= (CURRENT_DATE - ($2::int - 1))
     GROUP BY date
     ORDER BY date ASC`,
    branchId ? [tenantId, days, branchId] : [tenantId, days]
  );
  return rows.map((row) => ({ date: row.date, totalRevenue: Number(row.total_revenue || 0) }));
}

let refreshTimer: NodeJS.Timeout | null = null;
let refreshQueued = false;

async function refreshViewsNow() {
  const views = [
    "mv_sales_summary",
    "mv_profit_summary",
    "mv_top_products",
    "mv_top_customers",
    "mv_top_technicians",
  ];

  for (const view of views) {
    try {
      await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
    } catch {
      await pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
    }
  }
}

export function refreshAnalyticsViews() {
  if (refreshQueued) return;
  refreshQueued = true;

  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshQueued = false;
    await refreshViewsNow().catch(() => undefined);
  }, 5 * 60 * 1000);
}
