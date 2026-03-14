-- Align legacy/reset-token column names across environments.
-- Handles databases where columns were created as requested_ip/requested_user_agent
-- and aligns them to requested_by_ip/requested_by_user_agent expected by app schema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'password_reset_tokens'
  ) THEN
    -- requested_ip -> requested_by_ip
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_ip'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_by_ip'
    ) THEN
      ALTER TABLE public.password_reset_tokens
        RENAME COLUMN requested_ip TO requested_by_ip;
    ELSIF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_by_ip'
    ) THEN
      ALTER TABLE public.password_reset_tokens
        ADD COLUMN requested_by_ip VARCHAR(120);
    END IF;

    -- requested_user_agent -> requested_by_user_agent
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_user_agent'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_by_user_agent'
    ) THEN
      ALTER TABLE public.password_reset_tokens
        RENAME COLUMN requested_user_agent TO requested_by_user_agent;
    ELSIF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
        AND column_name = 'requested_by_user_agent'
    ) THEN
      ALTER TABLE public.password_reset_tokens
        ADD COLUMN requested_by_user_agent VARCHAR(300);
    END IF;
  END IF;
END $$;
