-- Use Thai baht directly for China domestic shipping fees.
ALTER TABLE preorder_round_products
  ADD COLUMN IF NOT EXISTS china_shipping_fee_thb DECIMAL(10,2) NOT NULL DEFAULT 0.00;
