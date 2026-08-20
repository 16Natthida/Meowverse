-- Allow customers to confirm receipt without requiring an admin status update.
ALTER TABLE shipping
  ADD COLUMN IF NOT EXISTS customer_confirmed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS customer_confirmed_by INT NULL;
