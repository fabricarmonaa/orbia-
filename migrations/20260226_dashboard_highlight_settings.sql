CREATE TABLE IF NOT EXISTS tenant_dashboard_settings (
  tenant_id INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  highlight_status_codes JSONB NOT NULL DEFAULT '["PENDIENTE","EN_PROCESO"]'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_orders_by_status AS
SELECT
  o.tenant_id,
  sd.code AS status_code,
  sd.label AS status_label,
  sd.color AS status_color,
  o.id AS order_id,
  o.order_number,
  o.customer_name,
  o.created_at,
  o.total_amount,
  o.branch_id
FROM orders o
LEFT JOIN status_definitions sd
  ON sd.tenant_id = o.tenant_id
 AND sd.entity_type = 'ORDER'
 AND sd.id = o.status_id
;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_orders_by_status_order_id
  ON mv_orders_by_status(order_id);

CREATE INDEX IF NOT EXISTS idx_mv_orders_by_status_tenant_status_created
  ON mv_orders_by_status(tenant_id, status_code, created_at DESC);
