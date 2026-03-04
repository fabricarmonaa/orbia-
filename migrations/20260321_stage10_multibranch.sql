-- ETAPA 10: multi-sucursal real (scope + transferencias + backfill)

CREATE TABLE IF NOT EXISTS user_branches (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role_in_branch varchar(30),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_branches_tenant_user_branch ON user_branches(tenant_id, user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branches_tenant_branch ON user_branches(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branches_tenant_user ON user_branches(tenant_id, user_id);

ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS tenant_id integer;
UPDATE stock_transfer_items sti
SET tenant_id = st.tenant_id
FROM stock_transfers st
WHERE st.id = sti.transfer_id AND sti.tenant_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfer_items_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE stock_transfer_items
      ADD CONSTRAINT stock_transfer_items_tenant_id_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Backfill sucursal principal para entidades operativas con branch NULL
DO $$
DECLARE
  t RECORD;
  v_branch_id integer;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    SELECT id INTO v_branch_id FROM branches WHERE tenant_id = t.id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;
    IF v_branch_id IS NULL THEN
      INSERT INTO branches (tenant_id, name, is_active, created_at)
      VALUES (t.id, 'Principal', true, now())
      RETURNING id INTO v_branch_id;
    END IF;

    UPDATE users SET branch_id = v_branch_id WHERE tenant_id = t.id AND branch_id IS NULL AND scope = 'BRANCH';
    UPDATE cash_sessions SET branch_id = v_branch_id WHERE tenant_id = t.id AND branch_id IS NULL;
    UPDATE cash_movements SET branch_id = v_branch_id WHERE tenant_id = t.id AND branch_id IS NULL;
    UPDATE sales SET branch_id = v_branch_id WHERE tenant_id = t.id AND branch_id IS NULL;
    UPDATE purchases SET branch_id = v_branch_id WHERE tenant_id = t.id AND branch_id IS NULL;

    INSERT INTO user_branches (tenant_id, user_id, branch_id, role_in_branch)
    SELECT u.tenant_id, u.id, u.branch_id, CASE WHEN u.role = 'admin' THEN 'ADMIN' WHEN u.role = 'CASHIER' THEN 'CASHIER' ELSE 'STAFF' END
    FROM users u
    WHERE u.tenant_id = t.id AND u.branch_id IS NOT NULL
    ON CONFLICT (tenant_id, user_id, branch_id) DO NOTHING;
  END LOOP;
END $$;

ALTER TABLE cash_sessions ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE purchases ALTER COLUMN branch_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_transfer_items_tenant_transfer_product ON stock_transfer_items(tenant_id, transfer_id, product_id);


ALTER TABLE stock_transfers ALTER COLUMN status SET DEFAULT 'DRAFT';
UPDATE stock_transfers SET status = 'DRAFT' WHERE status = 'PENDING';
UPDATE stock_transfers SET status = 'RECEIVED' WHERE status = 'COMPLETED';
