-- STT hardening + explicit ON DELETE policies for core tenant relations.

ALTER TABLE IF EXISTS stt_interactions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE stt_interactions
SET idempotency_key = COALESCE(idempotency_key, 'legacy-' || id::text)
WHERE idempotency_key IS NULL;

ALTER TABLE stt_interactions
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stt_interactions_tenant_user_idempotency
  ON stt_interactions (tenant_id, user_id, idempotency_key);

CREATE OR REPLACE FUNCTION _replace_fk_on_delete(_table regclass, _column text, _action text)
RETURNS void AS $$
DECLARE _name text;
DECLARE _sql text;
BEGIN
  SELECT c.conname INTO _name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = _table
    AND c.contype = 'f'
    AND a.attname = _column
  LIMIT 1;

  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', _table, _name);
  END IF;

  _sql := format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s',
    _table,
    _name,
    _column,
    CASE
      WHEN _column = 'tenant_id' THEN 'tenants'
      WHEN _column IN ('user_id','created_by_id','changed_by_id') THEN 'users'
      WHEN _column IN ('branch_id','created_by_branch_id') THEN 'branches'
      WHEN _column = 'customer_id' THEN 'customers'
      WHEN _column = 'status_id' THEN 'order_statuses'
      WHEN _column = 'sale_id' THEN 'sales'
      WHEN _column = 'order_id' THEN 'orders'
      ELSE NULL
    END,
    _action
  );

  IF _name IS NOT NULL THEN
    EXECUTE _sql;
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT _replace_fk_on_delete('branches', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('users', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('customers', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('products', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('sales', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('sales', 'branch_id', 'SET NULL');
SELECT _replace_fk_on_delete('sales', 'customer_id', 'SET NULL');
SELECT _replace_fk_on_delete('orders', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('orders', 'branch_id', 'SET NULL');
SELECT _replace_fk_on_delete('orders', 'status_id', 'SET NULL');
SELECT _replace_fk_on_delete('orders', 'created_by_id', 'SET NULL');
SELECT _replace_fk_on_delete('orders', 'created_by_branch_id', 'SET NULL');
SELECT _replace_fk_on_delete('orders', 'sale_id', 'SET NULL');
SELECT _replace_fk_on_delete('order_statuses', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('order_status_history', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('order_status_history', 'order_id', 'CASCADE');
SELECT _replace_fk_on_delete('order_status_history', 'status_id', 'SET NULL');
SELECT _replace_fk_on_delete('order_status_history', 'changed_by_id', 'SET NULL');
SELECT _replace_fk_on_delete('stt_logs', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('stt_logs', 'user_id', 'SET NULL');
SELECT _replace_fk_on_delete('stt_interactions', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('stt_interactions', 'user_id', 'SET NULL');
SELECT _replace_fk_on_delete('idempotency_keys', 'tenant_id', 'CASCADE');
SELECT _replace_fk_on_delete('idempotency_keys', 'user_id', 'CASCADE');

DROP FUNCTION _replace_fk_on_delete(regclass, text, text);
