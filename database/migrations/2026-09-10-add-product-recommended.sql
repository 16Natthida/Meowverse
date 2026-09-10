-- Allow admins to curate the products shown in the homepage recommendation section.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_recommended TINYINT(1) NOT NULL DEFAULT 0;
