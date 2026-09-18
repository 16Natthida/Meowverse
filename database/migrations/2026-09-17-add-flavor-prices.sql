-- Store optional ready-to-ship and preorder prices per product flavor.
-- Existing products continue using products.base_price/preorder_price as fallback.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS flavor_prices TEXT NULL AFTER flavor_stock;
