DO $$
BEGIN
  IF to_regclass('public.mv_sales_history') IS NULL THEN
    CREATE MATERIALIZED VIEW public.mv_sales_history AS
    SELECT
      s.id,
      s.tenant_id,
      s.branch_id,
      s.sale_number,
      s.sale_datetime,
      s.total_amount,
      s.currency,
      s.payment_method,
      s.cashier_user_id,
      u.full_name AS cashier_name,
      s.customer_id,
      c.name AS customer_name,
      b.name AS branch_name,
      s.public_token,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
    FROM sales s
    LEFT JOIN users u ON u.id = s.cashier_user_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN branches b ON b.id = s.branch_id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_sales_history_sale_id
  ON public.mv_sales_history(id);

CREATE INDEX IF NOT EXISTS idx_mv_sales_history_tenant_date
  ON public.mv_sales_history(tenant_id, sale_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_mv_sales_history_tenant_customer_date
  ON public.mv_sales_history(tenant_id, customer_id, sale_datetime DESC);
