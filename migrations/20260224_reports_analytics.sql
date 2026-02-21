ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, sale_datetime);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_product ON sale_items(sale_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_created_branch ON cash_movements(tenant_id, created_at, branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_created ON customers(tenant_id, created_at);
