-- Store the user's default address for reuse in their profile and future orders.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS address TEXT NULL AFTER line_id;
