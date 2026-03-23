UPDATE order_field_definitions
SET field_type = CASE
  WHEN field_type IS NULL OR btrim(field_type) = '' THEN 'TEXT'
  WHEN upper(btrim(field_type)) IN ('BOOL', 'BOOLEAN', 'CHECK', 'CHECKBOX') THEN 'CHECKBOX'
  WHEN upper(btrim(field_type)) IN ('INT', 'INTEGER', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'NUMBER') THEN 'NUMBER'
  WHEN upper(btrim(field_type)) IN ('TEXTLONG', 'LONG_TEXT', 'TEXT_LONG') THEN 'TEXT_LONG'
  WHEN upper(btrim(field_type)) IN ('DATETIME', 'DATE_TIME') THEN 'DATETIME'
  WHEN upper(btrim(field_type)) IN ('CURRENCY', 'MONEDA', 'DINERO', 'MONEY') THEN 'MONEY'
  WHEN upper(btrim(field_type)) IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME', 'DATETIME') THEN upper(btrim(field_type))
  ELSE 'TEXT'
END
WHERE field_type IS DISTINCT FROM CASE
  WHEN field_type IS NULL OR btrim(field_type) = '' THEN 'TEXT'
  WHEN upper(btrim(field_type)) IN ('BOOL', 'BOOLEAN', 'CHECK', 'CHECKBOX') THEN 'CHECKBOX'
  WHEN upper(btrim(field_type)) IN ('INT', 'INTEGER', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'NUMBER') THEN 'NUMBER'
  WHEN upper(btrim(field_type)) IN ('TEXTLONG', 'LONG_TEXT', 'TEXT_LONG') THEN 'TEXT_LONG'
  WHEN upper(btrim(field_type)) IN ('DATETIME', 'DATE_TIME') THEN 'DATETIME'
  WHEN upper(btrim(field_type)) IN ('CURRENCY', 'MONEDA', 'DINERO', 'MONEY') THEN 'MONEY'
  WHEN upper(btrim(field_type)) IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME', 'DATETIME') THEN upper(btrim(field_type))
  ELSE 'TEXT'
END;

UPDATE order_field_definitions
SET field_type = 'MONEY',
    config = jsonb_set(COALESCE(config, '{}'::jsonb), '{currencyCode}', to_jsonb(COALESCE(NULLIF(upper(config->>'currencyCode'), ''), 'ARS')), true)
WHERE deleted_at IS NULL
  AND field_key IN ('paid_amount', 'total_amount')
  AND field_type <> 'MONEY';

UPDATE order_field_definitions
SET config = COALESCE(config, '{}'::jsonb)
WHERE config IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_order_field_definitions_field_type'
      AND conrelid = 'order_field_definitions'::regclass
  ) THEN
    ALTER TABLE order_field_definitions
      DROP CONSTRAINT ck_order_field_definitions_field_type;
  END IF;

  ALTER TABLE order_field_definitions
    ADD CONSTRAINT ck_order_field_definitions_field_type
    CHECK (field_type IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'MONEY', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME', 'DATETIME'));
END $$;
