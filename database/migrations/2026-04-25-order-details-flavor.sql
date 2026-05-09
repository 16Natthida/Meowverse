-- Ensure checkout supports per-item flavor persistence
-- Safe to run multiple times on MySQL/MariaDB that support IF NOT EXISTS.
ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS flavor VARCHAR(120) NULL AFTER prod_id;
