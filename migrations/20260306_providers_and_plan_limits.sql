-- Migration: 20260306_providers_and_plan_limits
-- 1) Crea tabla providers
-- 2) Agrega FK opcional provider_id -> purchases
-- 3) Corrige guard faltante para columnas paid_amount / payment_status / entity en caso de no haber corrido la migración anterior

-- ── Tabla providers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  address       TEXT,
  phone         VARCHAR(60),
  email         VARCHAR(255),
  contact_name  VARCHAR(200),
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_providers_tenant        ON providers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_providers_tenant_active ON providers (tenant_id, active);

-- ── FK opcional en purchases ─────────────────────────────────────────────────
-- La columna provider_id ya existe en el schema de Drizzle; aquí añadimos la FK
-- si aún no existe (la columna misma se crea con IF NOT EXISTS por si acaso)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL;

-- ── Seguridad: re-aplicar columnas faltantes de la migración 20260305 ─────────
-- Idempotente gracias a IF NOT EXISTS
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20)   NOT NULL DEFAULT 'UNPAID';

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50)
    CHECK (entity_type IN ('ORDER','PURCHASE','SALE')),
  ADD COLUMN IF NOT EXISTS entity_id   INTEGER;

CREATE INDEX IF NOT EXISTS idx_cash_movements_entity
  ON cash_movements (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_branch_time
  ON cash_movements (tenant_id, branch_id, created_at DESC);
