-- Backend DB finalization: indexes, summary tables and idempotency

-- Products
CREATE INDEX IF NOT EXISTS idx_products_tenant_category_active_created
  ON products (tenant_id, category_id, is_active, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_sku
  ON products (tenant_id, sku)
  WHERE sku IS NOT NULL;

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON orders (tenant_id, status_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_tracking
  ON orders (tenant_id, public_tracking_id);

-- Cash
CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant_created_session
  ON cash_sessions (tenant_id, opened_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_created_session
  ON cash_movements (tenant_id, created_at DESC, session_id);

-- Expense definitions
CREATE INDEX IF NOT EXISTS idx_expense_defs_tenant_type
  ON expense_definitions (tenant_id, type);

-- Soft-delete helper indexes
CREATE INDEX IF NOT EXISTS idx_branches_tenant_deleted_at
  ON branches (tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_tenant_deleted_at
  ON users (tenant_id, deleted_at);

-- Summary tables
CREATE TABLE IF NOT EXISTS tenant_daily_metrics (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  day date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  revenue_total numeric(14,2) NOT NULL DEFAULT 0,
  orders_cancelled_count integer NOT NULL DEFAULT 0,
  cash_in_total numeric(14,2) NOT NULL DEFAULT 0,
  cash_out_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_daily_metrics_day UNIQUE (tenant_id, day)
);
CREATE INDEX IF NOT EXISTS idx_tenant_daily_metrics_tenant_day
  ON tenant_daily_metrics (tenant_id, day);

CREATE TABLE IF NOT EXISTS tenant_monthly_metrics (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  month date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  revenue_total numeric(14,2) NOT NULL DEFAULT 0,
  orders_cancelled_count integer NOT NULL DEFAULT 0,
  cash_in_total numeric(14,2) NOT NULL DEFAULT 0,
  cash_out_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_monthly_metrics_month UNIQUE (tenant_id, month)
);
CREATE INDEX IF NOT EXISTS idx_tenant_monthly_metrics_tenant_month
  ON tenant_monthly_metrics (tenant_id, month);

-- Idempotency keys for critical operations
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  user_id integer NOT NULL REFERENCES users(id),
  idempotency_key varchar(120) NOT NULL,
  route varchar(120) NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_tenant_user_key_route UNIQUE (tenant_id, user_id, idempotency_key, route)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_created
  ON idempotency_keys (tenant_id, created_at DESC);
