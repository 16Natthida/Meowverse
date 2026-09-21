-- Extend the existing admin_qrcodes table for QR and bank payment channels.
-- This migration is additive and preserves all existing QR records.

ALTER TABLE admin_qrcodes
  MODIFY COLUMN qr_image VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'qr',
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(64) DEFAULT NULL;

UPDATE admin_qrcodes
SET type = 'qr'
WHERE type IS NULL OR TRIM(type) = '';
