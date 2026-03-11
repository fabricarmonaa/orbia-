DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_order_field_definitions_field_type'
      AND conrelid = 'order_field_definitions'::regclass
  ) THEN
    ALTER TABLE order_field_definitions DROP CONSTRAINT ck_order_field_definitions_field_type;
  END IF;

  ALTER TABLE order_field_definitions
    ADD CONSTRAINT ck_order_field_definitions_field_type
    CHECK (field_type IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME', 'DATETIME'));
END$$;
