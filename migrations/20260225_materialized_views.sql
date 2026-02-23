CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sales_history AS
SELECT s.id, s.tenant_id, s.branch_id, s.sale_number, s.sale_datetime, s.total_amount, s.payment_method,
       s.cashier_user_id, u.full_name AS cashier_name, s.customer_id, c.name AS customer_name,
       b.name AS branch_name,
       (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
FROM sales s
LEFT JOIN users u ON u.id = s.cashier_user_id
LEFT JOIN customers c ON c.id = s.customer_id
LEFT JOIN branches b ON b.id = s.branch_id;

CREATE INDEX IF NOT EXISTS idx_mv_sales_history_tenant_date ON mv_sales_history(tenant_id, sale_datetime DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_cash_daily AS
SELECT tenant_id, date(created_at) AS date,
       SUM(CASE WHEN type='ingreso' THEN amount::numeric ELSE 0 END) AS inflow,
       SUM(CASE WHEN type='egreso' THEN amount::numeric ELSE 0 END) AS outflow
FROM cash_movements
GROUP BY tenant_id, date(created_at);

CREATE INDEX IF NOT EXISTS idx_mv_cash_daily_tenant_date ON mv_cash_daily(tenant_id, date DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reports_daily_sales AS
SELECT tenant_id, date(sale_datetime) AS date,
       SUM(total_amount::numeric) AS total_sales,
       COUNT(*) AS sales_count
FROM sales
GROUP BY tenant_id, date(sale_datetime);

CREATE INDEX IF NOT EXISTS idx_mv_reports_daily_sales_tenant_date ON mv_reports_daily_sales(tenant_id, date DESC);
