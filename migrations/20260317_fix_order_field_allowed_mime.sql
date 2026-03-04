-- ETAPA 6: fix constraint inválido (subquery en CHECK) de migración 20260311

ALTER TABLE order_field_definitions
  DROP CONSTRAINT IF EXISTS ck_order_field_definitions_file_mime_config;

ALTER TABLE order_field_definitions
  DROP CONSTRAINT IF EXISTS ck_order_field_definitions_field_type;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_order_field_definitions_field_type_v2'
      AND conrelid = 'order_field_definitions'::regclass
  ) THEN
    ALTER TABLE order_field_definitions
      ADD CONSTRAINT ck_order_field_definitions_field_type_v2
      CHECK (field_type IN ('TEXT', 'NUMBER', 'FILE', 'MONEY', 'BOOLEAN', 'DATE', 'SELECT', 'TEXTAREA'));
  END IF;
END $$;
