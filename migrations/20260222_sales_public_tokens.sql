ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS public_token varchar(120),
  ADD COLUMN IF NOT EXISTS public_token_created_at timestamp,
  ADD COLUMN IF NOT EXISTS public_token_expires_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_public_token ON sales(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_public_token_expires ON sales(public_token_expires_at);
