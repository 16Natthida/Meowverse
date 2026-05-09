-- Add preorder_round_id tracking to cart table
-- Allows proper stock deduction from the correct preorder round

ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS preorder_round_id INT NULL;

-- Add foreign key constraint if the column was just added
ALTER TABLE cart
  ADD CONSTRAINT IF NOT EXISTS fk_cart_preorder_round
  FOREIGN KEY (preorder_round_id) REFERENCES preorder_rounds (round_id)
  ON DELETE SET NULL;

-- Add index for efficient queries
ALTER TABLE cart
  ADD KEY IF NOT EXISTS idx_cart_preorder_round (user_id, preorder_round_id);
