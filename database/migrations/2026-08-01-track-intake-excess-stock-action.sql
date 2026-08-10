ALTER TABLE inventory_intake_sessions
  ADD COLUMN IF NOT EXISTS excess_stock_action VARCHAR(20) NOT NULL DEFAULT 'none';

-- Values:
-- none          = no excess was recorded
-- moved_to_stock = excess was added to ready-to-ship stock
-- not_moved     = excess was received but intentionally not added to stock
