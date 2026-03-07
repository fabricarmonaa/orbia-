-- Agenda + Notas + Campos dinámicos agendables

ALTER TABLE order_field_definitions
  ADD COLUMN IF NOT EXISTS use_in_agenda BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  branch_id INTEGER REFERENCES branches(id),
  title VARCHAR(220) NOT NULL,
  content TEXT,
  remind_at TIMESTAMP NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_agenda BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_tenant_status ON notes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_remind_at ON notes(tenant_id, remind_at);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_branch ON notes(tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS agenda_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  branch_id INTEGER REFERENCES branches(id),
  title VARCHAR(220) NOT NULL,
  description TEXT,
  event_type VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  source_entity_type VARCHAR(40),
  source_entity_id INTEGER,
  source_field_key VARCHAR(100),
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(20),
  status VARCHAR(30),
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_events_tenant_starts_at ON agenda_events(tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_agenda_events_tenant_source ON agenda_events(tenant_id, source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_agenda_events_tenant_branch_starts_at ON agenda_events(tenant_id, branch_id, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_events_source_field ON agenda_events(tenant_id, source_entity_type, source_entity_id, source_field_key);

-- Habilitar features en planes PRO/ESCALA para instalaciones existentes
UPDATE plans SET features_json = COALESCE(features_json, '{}'::jsonb) || '{"agenda":false,"notes":false}'::jsonb WHERE plan_code = 'ECONOMICO';
UPDATE plans SET features_json = COALESCE(features_json, '{}'::jsonb) || '{"agenda":true,"notes":true}'::jsonb WHERE plan_code IN ('PROFESIONAL','ESCALA');
