-- Add quantity tracking for preorder round products
-- Allows monitoring of remaining stock for each preorder round

ALTER TABLE preorder_round_products
  ADD COLUMN IF NOT EXISTS quantity_sold INT NOT NULL DEFAULT 0;

-- Add composite index for efficient stock queries
ALTER TABLE preorder_round_products
  ADD KEY IF NOT EXISTS idx_quantity_tracking (round_id, prod_id, quantity_sold);

-- Create view for remaining quantity (optional, for easier queries)
CREATE OR REPLACE VIEW preorder_stock_remaining AS
SELECT 
  round_id,
  prod_id,
  quantity_available,
  quantity_sold,
  (quantity_available - quantity_sold) AS quantity_remaining
FROM preorder_round_products
ORDER BY round_id, prod_id;
