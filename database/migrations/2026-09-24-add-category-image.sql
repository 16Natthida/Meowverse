-- =====================================================================
-- Migration: Add an optional image to categories
--
-- Adds `cat_image` (VARCHAR(255), nullable) to `categories` so admins
-- can upload a picture for a category from the "เพิ่มหมวดหมู่" (Add
-- category) form, the same way product images are uploaded.
--
-- Safe to run more than once (idempotent). The backend also applies this
-- automatically on startup via ensureAdminSchema(), so running this file
-- by hand is optional.
-- =====================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS cat_image VARCHAR(255) DEFAULT NULL;
