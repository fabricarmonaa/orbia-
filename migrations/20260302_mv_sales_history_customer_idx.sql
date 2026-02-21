CREATE INDEX IF NOT EXISTS idx_mv_sales_history_tenant_customer_date
ON mv_sales_history(tenant_id, customer_id, sale_datetime DESC);
