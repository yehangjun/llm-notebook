ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_language VARCHAR(10) NOT NULL DEFAULT 'zh';

UPDATE users
SET public_id = 'user_' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12)
WHERE public_id IS NULL OR TRIM(public_id) = '';

ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_public_id_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_public_id_key UNIQUE (public_id);
  END IF;
END $$;
