-- Migration: Fix unique index strategy for user_google_connections
-- Justification:
--   - Old index: UNIQUE on (user_id) alone → incorrect for multi-tenant users.
--     A user can belong to multiple tenants and should be able to have one
--     Google connection per tenant.
--   - New index 1: UNIQUE on (user_id, tenant_id) → one Google connection per
--     user per tenant. This is the primary business constraint.
--   - New index 2: UNIQUE on (tenant_id, google_user_id) → prevents two
--     different users within the same tenant from connecting the same Google
--     account. Essential to avoid token/calendar access confusion.

-- Drop the incorrect global unique index on user_id only.
DROP INDEX IF EXISTS uq_user_google_connections_user;

-- Create correct composite unique index: one connection per user per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_google_conn_user_tenant
  ON user_google_connections(user_id, tenant_id);

-- Create unique index: one user per Google account per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_google_conn_google_per_tenant
  ON user_google_connections(tenant_id, google_user_id);
