ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE branches
SET is_system = true
WHERE deleted_at IS NULL
  AND is_system = false
  AND lower(trim(translate(name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) IN ('casa central', 'sucursal central');
