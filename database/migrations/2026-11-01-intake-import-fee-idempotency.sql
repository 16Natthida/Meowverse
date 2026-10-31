-- Safe, additive migration for the intake/import-fee workflow.
-- Existing order_details, intake sessions and payment rows are preserved.

CREATE TABLE IF NOT EXISTS preorder_import_fee_saves (
  round_id INT NOT NULL,
  fee_segment VARCHAR(20) NOT NULL,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, fee_segment)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preorder_import_fee_confirmations (
  round_id INT NOT NULL,
  prod_id INT NOT NULL,
  fee_segment VARCHAR(20) NOT NULL DEFAULT 'Main',
  first_confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_confirmed_by INT NULL,
  missing_checked_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, prod_id, fee_segment),
  KEY idx_preorder_import_fee_confirmations_round (round_id, fee_segment)
) ENGINE=InnoDB;

ALTER TABLE preorder_import_fee_confirmations
  ADD COLUMN IF NOT EXISTS confirmation_source VARCHAR(30) NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS preorder_import_fee_history (
  history_id BIGINT NOT NULL AUTO_INCREMENT,
  round_id INT NOT NULL,
  fee_segment VARCHAR(20) NOT NULL DEFAULT 'Main',
  admin_user_id INT NULL,
  action VARCHAR(30) NOT NULL,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (history_id),
  KEY idx_preorder_import_fee_history_scope (round_id, fee_segment, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_intake_receipts (
  receipt_id BIGINT NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(100) NOT NULL,
  detail_id INT NOT NULL,
  round_id INT NULL,
  incoming_qty INT NOT NULL DEFAULT 0,
  applied_qty INT NOT NULL DEFAULT 0,
  admin_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (receipt_id),
  UNIQUE KEY uq_inventory_intake_receipt_request (detail_id, request_id),
  KEY idx_inventory_intake_receipts_round (round_id),
  CONSTRAINT fk_inventory_intake_receipts_detail
    FOREIGN KEY (detail_id) REFERENCES order_details (detail_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Do not insert confirmations for legacy fee saves. Existing auxiliary rows
-- from an earlier compatibility build are explicitly marked as legacy and
-- remain outside the new confirmation workflow.
UPDATE preorder_import_fee_confirmations c
JOIN preorder_import_fee_saves s
  ON s.round_id = c.round_id AND s.fee_segment = c.fee_segment
LEFT JOIN preorder_import_fee_history h
  ON h.round_id = c.round_id
 AND h.fee_segment = c.fee_segment
 AND h.action = 'first_confirmation'
SET c.confirmation_source = 'legacy_unconfirmed'
WHERE c.confirmation_source = 'admin'
  AND h.history_id IS NULL;
