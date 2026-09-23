-- Long product option lists exceed the legacy VARCHAR(255) column and become
-- truncated invalid JSON. Widen the existing column; ADD COLUMN IF NOT EXISTS
-- does not change the type of databases that already have the old column.
ALTER TABLE products
  MODIFY COLUMN flavors TEXT NULL;
