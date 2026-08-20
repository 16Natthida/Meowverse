-- Store the China domestic shipping fee per product in each preorder round.
-- The fee is entered directly in THB.
ALTER TABLE preorder_round_products
  ADD COLUMN IF NOT EXISTS china_shipping_fee_thb DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- Snapshot the calculated first-round fee on the order so later rate changes
-- cannot change an order that has already been created for a closed round.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS china_shipping_total_thb DECIMAL(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS china_shipping_fee_thb DECIMAL(10,2) NOT NULL DEFAULT 0.00;
