ALTER TABLE preorder_round_products
  ADD COLUMN IF NOT EXISTS minimum_order_qty INT NOT NULL DEFAULT 0
  AFTER quantity_sold;
