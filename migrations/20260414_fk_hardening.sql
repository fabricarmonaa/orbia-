-- ============================================================
-- Migración: FK Hardening - referencias huérfanas y claves foráneas faltantes
-- Fecha: 20260414
-- Idempotente: SÍ (usa IF NOT EXISTS + saneamiento previo)
-- ============================================================
-- PRECAUCIÓN: Esta migración nullea referencias huérfanas antes de
-- agregar las FKs. Verificar en producción con las queries de diagnóstico
-- comentadas al final de este archivo antes de ejecutar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. orders.assigned_agent_id → delivery_agents(id)
-- ============================================================

-- Saneamiento previo: nullear referencias a delivery_agents que no existen
UPDATE orders
SET assigned_agent_id = NULL
WHERE assigned_agent_id IS NOT NULL
  AND assigned_agent_id NOT IN (SELECT id FROM delivery_agents);

-- Agregar FK si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_assigned_agent_id_fk'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_assigned_agent_id_fk
      FOREIGN KEY (assigned_agent_id)
      REFERENCES delivery_agents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 2. orders.order_preset_id → order_type_presets(id)
-- ============================================================

-- Saneamiento previo: nullear referencias a presets que no existen o están soft-deleted
UPDATE orders
SET order_preset_id = NULL
WHERE order_preset_id IS NOT NULL
  AND order_preset_id NOT IN (
    SELECT id FROM order_type_presets WHERE deleted_at IS NULL
  );

-- Agregar FK sin constraint para presets soft-deleted (referencia opcional, sin FK restrictiva)
-- Dado que order_type_presets usa soft delete, usamos una FK simple con SET NULL en hard delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_order_preset_id_fk'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_order_preset_id_fk
      FOREIGN KEY (order_preset_id)
      REFERENCES order_type_presets(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 3. users.branch_id → branches(id)
-- ============================================================

-- Saneamiento previo: nullear referencias a branches que no existen o están soft-deleted
UPDATE users
SET branch_id = NULL
WHERE branch_id IS NOT NULL
  AND branch_id NOT IN (
    SELECT id FROM branches WHERE deleted_at IS NULL
  );

-- Agregar FK si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_branch_id_fk'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_branch_id_fk
      FOREIGN KEY (branch_id)
      REFERENCES branches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 4. Índice adicional en auth_refresh_sessions para acelerar cleanup
-- Mejora el performance de cleanupExpiredRefreshSessions() que filtra por
-- expires_at y revoked_at.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_cleanup
  ON auth_refresh_sessions(expires_at, revoked_at)
  WHERE revoked_at IS NULL;

COMMIT;

-- ============================================================
-- QUERIES DE DIAGNÓSTICO (ejecutar ANTES de la migración en producción):
-- ============================================================
-- -- Pedidos con agent_id inválido:
-- SELECT COUNT(*) FROM orders
-- WHERE assigned_agent_id IS NOT NULL
--   AND assigned_agent_id NOT IN (SELECT id FROM delivery_agents);
--
-- -- Pedidos con order_preset_id inválido:
-- SELECT COUNT(*) FROM orders
-- WHERE order_preset_id IS NOT NULL
--   AND order_preset_id NOT IN (SELECT id FROM order_type_presets WHERE deleted_at IS NULL);
--
-- -- Usuarios con branch_id inválido:
-- SELECT COUNT(*) FROM users
-- WHERE branch_id IS NOT NULL
--   AND branch_id NOT IN (SELECT id FROM branches WHERE deleted_at IS NULL);
-- ============================================================
