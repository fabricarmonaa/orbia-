-- Commit C: DB integrity hardening (unique combos + FK on delete policies)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM customers
    WHERE doc IS NOT NULL AND btrim(doc) <> ''
    GROUP BY tenant_id, doc
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot apply uq_customers_tenant_doc: duplicate docs found per tenant';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM customers
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY tenant_id, email
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot apply uq_customers_tenant_email: duplicate emails found per tenant';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_doc
  ON customers (tenant_id, doc)
  WHERE doc IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_email
  ON customers (tenant_id, email)
  WHERE email IS NOT NULL;

DO $$
DECLARE con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'order_status_history'::regclass
    AND c.contype = 'f'
    AND a.attname = 'order_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE order_status_history DROP CONSTRAINT %I', con_name);
    ALTER TABLE order_status_history
      ADD CONSTRAINT order_status_history_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'order_comments'::regclass
    AND c.contype = 'f'
    AND a.attname = 'order_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE order_comments DROP CONSTRAINT %I', con_name);
    ALTER TABLE order_comments
      ADD CONSTRAINT order_comments_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;
