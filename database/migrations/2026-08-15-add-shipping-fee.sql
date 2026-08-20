-- Store the flat shipping fee charged for each order.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
