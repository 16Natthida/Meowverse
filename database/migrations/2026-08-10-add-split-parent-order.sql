-- Link a delayed-child order back to the original order.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS split_parent_order_id INT NULL;

