-- Safe, additive migration for import-fee grouping.
-- Existing rows remain NULL and are shown as "ไม่ระบุขนาด"; no value is
-- inferred from product or flavor names.
ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50) DEFAULT NULL;

ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50) DEFAULT NULL;
