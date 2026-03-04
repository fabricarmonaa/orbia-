-- ETAPA 9: analytics y reportes con materialized views

DROP MATERIALIZED VIEW IF EXISTS mv_top_technicians;
DROP MATERIALIZED VIEW IF EXISTS mv_top_customers;
DROP MATERIALIZED VIEW IF EXISTS mv_top_products;
DROP MATERIALIZED VIEW IF EXISTS mv_profit_summary;
DROP MATERIALIZED VIEW IF EXISTS mv_sales_summary;

CREATE MATERIALIZED VIEW mv_sales_summary AS
SELECT
  s.tenant_id,
  s.branch_id,
  DATE(s.sale_datetime) AS date,
  COUNT(DISTINCT s.id)::int AS total_sales,
  COUNT(DISTINCT o.id)::int AS total_orders,
  COALESCE(SUM(si.quantity), 0)::numeric(14,2) AS total_items,
  COALESCE(SUM(s.total_amount), 0)::numeric(14,2) AS total_revenue
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
LEFT JOIN orders o ON o.sale_id = s.id
GROUP BY s.tenant_id, s.branch_id, DATE(s.sale_datetime);

CREATE UNIQUE INDEX uq_mv_sales_summary_tenant_branch_date ON mv_sales_summary(tenant_id, branch_id, date);
CREATE INDEX idx_mv_sales_summary_tenant_date ON mv_sales_summary(tenant_id, date);

CREATE MATERIALIZED VIEW mv_profit_summary AS
WITH sales_income AS (
  SELECT tenant_id, DATE(sale_datetime) AS date, COALESCE(SUM(total_amount),0)::numeric(14,2) AS amount
  FROM sales
  GROUP BY tenant_id, DATE(sale_datetime)
),
order_money_income AS (
  SELECT tenant_id, DATE(created_at) AS date, COALESCE(SUM(amount),0)::numeric(14,2) AS amount
  FROM cash_movements
  WHERE order_id IS NOT NULL AND type = 'ingreso'
  GROUP BY tenant_id, DATE(created_at)
),
purchase_expense AS (
  SELECT tenant_id, DATE(purchase_date) AS date, COALESCE(SUM(total_amount),0)::numeric(14,2) AS amount
  FROM purchases
  GROUP BY tenant_id, DATE(purchase_date)
),
order_money_expense AS (
  SELECT tenant_id, DATE(created_at) AS date, COALESCE(SUM(amount),0)::numeric(14,2) AS amount
  FROM cash_movements
  WHERE order_id IS NOT NULL AND type = 'egreso'
  GROUP BY tenant_id, DATE(created_at)
),
cash_expense AS (
  SELECT tenant_id, DATE(created_at) AS date, COALESCE(SUM(amount),0)::numeric(14,2) AS amount
  FROM cash_movements
  WHERE type = 'egreso' AND category <> 'compras' AND category <> 'pedido_money_fields'
  GROUP BY tenant_id, DATE(created_at)
),
all_days AS (
  SELECT tenant_id, date FROM sales_income
  UNION SELECT tenant_id, date FROM order_money_income
  UNION SELECT tenant_id, date FROM purchase_expense
  UNION SELECT tenant_id, date FROM order_money_expense
  UNION SELECT tenant_id, date FROM cash_expense
)
SELECT
  d.tenant_id,
  d.date,
  (COALESCE(si.amount,0) + COALESCE(omi.amount,0))::numeric(14,2) AS total_income,
  (COALESCE(pe.amount,0) + COALESCE(ome.amount,0) + COALESCE(ce.amount,0))::numeric(14,2) AS total_expenses,
  ((COALESCE(si.amount,0) + COALESCE(omi.amount,0)) - (COALESCE(pe.amount,0) + COALESCE(ome.amount,0) + COALESCE(ce.amount,0)))::numeric(14,2) AS gross_profit
FROM all_days d
LEFT JOIN sales_income si ON si.tenant_id = d.tenant_id AND si.date = d.date
LEFT JOIN order_money_income omi ON omi.tenant_id = d.tenant_id AND omi.date = d.date
LEFT JOIN purchase_expense pe ON pe.tenant_id = d.tenant_id AND pe.date = d.date
LEFT JOIN order_money_expense ome ON ome.tenant_id = d.tenant_id AND ome.date = d.date
LEFT JOIN cash_expense ce ON ce.tenant_id = d.tenant_id AND ce.date = d.date;

CREATE UNIQUE INDEX uq_mv_profit_summary_tenant_date ON mv_profit_summary(tenant_id, date);
CREATE INDEX idx_mv_profit_summary_tenant_date ON mv_profit_summary(tenant_id, date DESC);

CREATE MATERIALIZED VIEW mv_top_products AS
SELECT
  s.tenant_id,
  si.product_id,
  COALESCE(MAX(si.product_name_snapshot), 'Producto')::text AS product_name,
  COALESCE(SUM(si.quantity), 0)::numeric(14,2) AS total_sold,
  COALESCE(SUM(si.line_total), 0)::numeric(14,2) AS total_revenue
FROM sale_items si
INNER JOIN sales s ON s.id = si.sale_id
GROUP BY s.tenant_id, si.product_id;

CREATE UNIQUE INDEX uq_mv_top_products_tenant_product ON mv_top_products(tenant_id, product_id);
CREATE INDEX idx_mv_top_products_tenant_revenue ON mv_top_products(tenant_id, total_revenue DESC);

CREATE MATERIALIZED VIEW mv_top_customers AS
SELECT
  s.tenant_id,
  s.customer_id,
  COALESCE(MAX(c.name), 'Consumidor final')::text AS customer_name,
  COUNT(s.id)::int AS total_orders,
  COALESCE(SUM(s.total_amount),0)::numeric(14,2) AS total_spent
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.customer_id IS NOT NULL
GROUP BY s.tenant_id, s.customer_id;

CREATE UNIQUE INDEX uq_mv_top_customers_tenant_customer ON mv_top_customers(tenant_id, customer_id);
CREATE INDEX idx_mv_top_customers_tenant_spent ON mv_top_customers(tenant_id, total_spent DESC);

CREATE MATERIALIZED VIEW mv_top_technicians AS
WITH tech_values AS (
  SELECT
    ofv.tenant_id,
    ofv.order_id,
    COALESCE(ofv.value_json->>'value', ofv.value_text, 'Sin técnico')::text AS technician_name
  FROM order_field_values ofv
  INNER JOIN order_field_definitions ofd ON ofd.id = ofv.field_definition_id
  WHERE ofd.field_key = 'tecnico_asignado'
),
final_orders AS (
  SELECT o.tenant_id, o.id AS order_id
  FROM orders o
  INNER JOIN order_statuses os ON os.id = o.status_id
  WHERE os.is_final = true
),
order_income AS (
  SELECT tenant_id, order_id, SUM(CASE WHEN type='ingreso' THEN amount ELSE 0 END)::numeric(14,2) AS revenue
  FROM cash_movements
  WHERE order_id IS NOT NULL
  GROUP BY tenant_id, order_id
)
SELECT
  fo.tenant_id,
  tv.technician_name,
  COUNT(fo.order_id)::int AS completed_orders,
  COALESCE(SUM(oi.revenue),0)::numeric(14,2) AS total_revenue
FROM final_orders fo
INNER JOIN tech_values tv ON tv.tenant_id = fo.tenant_id AND tv.order_id = fo.order_id
LEFT JOIN order_income oi ON oi.tenant_id = fo.tenant_id AND oi.order_id = fo.order_id
GROUP BY fo.tenant_id, tv.technician_name;

CREATE UNIQUE INDEX uq_mv_top_technicians_tenant_name ON mv_top_technicians(tenant_id, technician_name);
CREATE INDEX idx_mv_top_technicians_tenant_revenue ON mv_top_technicians(tenant_id, total_revenue DESC);
