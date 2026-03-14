-- Ensure password_reset_tokens matches application schema without interactive prompts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
  ) THEN
    RETURN;
  END IF;

  -- Column compatibility: requested_ip -> requested_by_ip
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_ip'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_by_ip'
  ) THEN
    ALTER TABLE public.password_reset_tokens RENAME COLUMN requested_ip TO requested_by_ip;
  END IF;

  -- Required canonical columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.password_reset_tokens ADD COLUMN tenant_id INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.password_reset_tokens ADD COLUMN email VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'revoked'
  ) THEN
    ALTER TABLE public.password_reset_tokens ADD COLUMN revoked BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_by_ip'
  ) THEN
    ALTER TABLE public.password_reset_tokens ADD COLUMN requested_by_ip VARCHAR(100);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_user_agent'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_by_user_agent'
  ) THEN
    ALTER TABLE public.password_reset_tokens RENAME COLUMN requested_user_agent TO requested_by_user_agent;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'requested_by_user_agent'
  ) THEN
    ALTER TABLE public.password_reset_tokens ADD COLUMN requested_by_user_agent VARCHAR(255);
  END IF;

  -- Normalize lengths to canonical schema
  ALTER TABLE public.password_reset_tokens
    ALTER COLUMN requested_by_ip TYPE VARCHAR(100),
    ALTER COLUMN requested_by_user_agent TYPE VARCHAR(255),
    ALTER COLUMN email TYPE VARCHAR(255);

  -- Backfill tenant_id/email from users where possible
  UPDATE public.password_reset_tokens prt
  SET
    tenant_id = COALESCE(prt.tenant_id, u.tenant_id),
    email = COALESCE(prt.email, u.email)
  FROM public.users u
  WHERE u.id = prt.user_id
    AND (prt.tenant_id IS NULL OR prt.email IS NULL);

  -- Ensure revoked is always populated
  UPDATE public.password_reset_tokens
  SET revoked = FALSE
  WHERE revoked IS NULL;

  -- email must be not null for app logic; fill final unknowns safely
  UPDATE public.password_reset_tokens
  SET email = 'unknown@example.invalid'
  WHERE email IS NULL;

  ALTER TABLE public.password_reset_tokens
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN revoked SET NOT NULL,
    ALTER COLUMN revoked SET DEFAULT FALSE;

  -- Indexes/FKs used by runtime queries and consistency
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_tenant
    ON public.password_reset_tokens(tenant_id);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'password_reset_tokens_tenant_id_tenants_id_fk'
      AND conrelid = 'public.password_reset_tokens'::regclass
  ) THEN
    ALTER TABLE public.password_reset_tokens
      ADD CONSTRAINT password_reset_tokens_tenant_id_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
