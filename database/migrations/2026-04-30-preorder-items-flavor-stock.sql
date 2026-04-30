-- Add flavor_stock JSON column to products table
-- Stores stock quantities per flavor variant
-- Example: {"Lavender 6L": 1, "Apple 6L": 1, "Jasmine 10L": 0}
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS flavor_stock JSON NULL;

-- Update existing products: if no flavor_stock, set to empty JSON object
UPDATE products SET flavor_stock = '{}' WHERE flavor_stock IS NULL;
