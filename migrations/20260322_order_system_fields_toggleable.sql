-- Ensure system base fields exist in every preset so they can be enabled/disabled from settings
WITH presets AS (
  SELECT p.id AS preset_id, p.tenant_id, p.order_type_id
  FROM order_type_presets p
), base_fields(field_key, label, field_type, sort_order) AS (
  VALUES
    ('cliente', 'Cliente', 'TEXT', 0),
    ('telefono', 'Teléfono', 'TEXT', 1),
    ('descripcion', 'Descripción', 'TEXT', 2),
    ('sena_pago', 'Seña / Pago', 'NUMBER', 3),
    ('valor_total', 'Valor total', 'NUMBER', 4)
)
INSERT INTO order_field_definitions (
  tenant_id, order_type_id, preset_id, field_key, label, field_type,
  required, sort_order, config, is_active, is_system_default, visible_in_tracking, use_in_agenda
)
SELECT
  p.tenant_id,
  p.order_type_id,
  p.preset_id,
  bf.field_key,
  bf.label,
  bf.field_type,
  false,
  bf.sort_order,
  '{}'::jsonb,
  true,
  true,
  false,
  false
FROM presets p
CROSS JOIN base_fields bf
WHERE NOT EXISTS (
  SELECT 1
  FROM order_field_definitions ofd
  WHERE ofd.tenant_id = p.tenant_id
    AND ofd.preset_id = p.preset_id
    AND ofd.field_key = bf.field_key
);
