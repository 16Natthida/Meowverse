-- Add preorder metadata to order_details for correct order summary pricing
-- Safe to run multiple times on MySQL/MariaDB that support IF NOT EXISTS.
ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NULL AFTER flavor;

ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS preorder_round_id INT NULL AFTER item_type;

ALTER TABLE order_details
  ADD KEY IF NOT EXISTS idx_order_details_preorder_round_id (preorder_round_id);
