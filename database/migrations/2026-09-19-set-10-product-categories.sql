-- =====================================================================
-- Migration: Standardize product categories to exactly these 10, in order
--   1. Wet Food
--   2. Soup
--   3. Lickable Cat Treats
--   4. Cat Supplies / Toys
--   5. Freeze-Dried Food
--   6. Vitamins / Supplements
--   7. Snacks / Treats
--   8. Promotions
--   9. Trial Sets
--   10. Others
--
-- Safe to run more than once (idempotent).
-- Existing products in a category that is being removed are NOT deleted;
-- they are reassigned to "Others" before the old category row is dropped,
-- because the API already forbids deleting a category that still has
-- products attached to it (see DELETE /api/categories/:id).
-- =====================================================================

START TRANSACTION;

-- 1. Make sure every target category exists (insert only the missing ones)
INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Wet Food' AS cat_name, 'Wet cat food (pouches / cans)' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Soup' AS cat_name, 'Cat soup pouches' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Lickable Cat Treats' AS cat_name, 'Squeeze / lickable treat tubes' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Cat Supplies / Toys' AS cat_name, 'Toys and everyday cat supplies' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Freeze-Dried Food' AS cat_name, 'Freeze-dried meat / fish pieces' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Vitamins / Supplements' AS cat_name, 'Supplement bottles / powders' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Snacks / Treats' AS cat_name, 'General cat snacks and treats' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Promotions' AS cat_name, 'Discounted / special-deal products' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Trial Sets' AS cat_name, 'Sample bundles / mixed-flavor starter packs' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

INSERT INTO categories (cat_name, cat_detail)
SELECT * FROM (SELECT 'Others' AS cat_name, 'Anything that does not fit the categories above' AS cat_detail) t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE cat_name = t.cat_name);

-- 2. Move any product that is sitting in a category OUTSIDE the 10 above
--    into "Others", so nothing gets orphaned.
UPDATE products p
JOIN categories c ON c.cat_id = p.cat_id
SET p.cat_id = (SELECT cat_id FROM categories WHERE cat_name = 'Others' LIMIT 1)
WHERE c.cat_name NOT IN (
  'Wet Food', 'Soup', 'Lickable Cat Treats', 'Cat Supplies / Toys',
  'Freeze-Dried Food', 'Vitamins / Supplements', 'Snacks / Treats',
  'Promotions', 'Trial Sets', 'Others'
);

-- 3. Remove every category that is not part of the 10 above
--    (safe now — step 2 already emptied them of products).
DELETE FROM categories
WHERE cat_name NOT IN (
  'Wet Food', 'Soup', 'Lickable Cat Treats', 'Cat Supplies / Toys',
  'Freeze-Dried Food', 'Vitamins / Supplements', 'Snacks / Treats',
  'Promotions', 'Trial Sets', 'Others'
);

COMMIT;

-- Verify:
-- SELECT cat_id, cat_name FROM categories ORDER BY cat_id;
