-- =====================================================================
-- Migration: Add on/off toggle to categories, remove the 10-category cap
--
-- 1) Adds `is_active` (TINYINT(1), default 1) to `categories`.
--    - When a category is turned off (is_active = 0), the storefront
--      (public/ready-to-ship/preorder product endpoints) stops showing
--      products that belong to it. The admin panel still shows them so
--      staff can manage the category and its products.
-- 2) The API no longer enforces a maximum number of categories — admins
--    can keep adding categories indefinitely. (The minimum of 4 categories
--    required before deleting one is unchanged.)
--
-- Safe to run more than once (idempotent). The backend also applies this
-- automatically on startup via ensureAdminSchema(), so running this file
-- by hand is optional.
-- =====================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;

UPDATE categories SET is_active = 1 WHERE is_active IS NULL;
