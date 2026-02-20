CREATE TABLE IF NOT EXISTS cashiers (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  branch_id integer REFERENCES branches(id),
  name varchar(120) NOT NULL,
  pin_hash varchar(255) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_cashiers_tenant_branch_name UNIQUE (tenant_id, branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cashiers_tenant ON cashiers (tenant_id);

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'sales'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'cashier_user_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;
