-- Safe, additive migration for import-fee grouping.
-- Existing rows remain NULL and are shown as "ไม่ระบุขนาด"; no value is
-- inferred from product or flavor names.
ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50) DEFAULT NULL;

ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS preorder_import_fee_settings (
  round_id INT NOT NULL,
  prod_id INT NOT NULL,
  fee_segment VARCHAR(20) NOT NULL DEFAULT 'Main',
  mode VARCHAR(20) NOT NULL DEFAULT 'aggregate',
  group_config TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, prod_id, fee_segment)
) ENGINE=InnoDB;
