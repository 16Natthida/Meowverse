-- Keep the list of supported shipping companies in one place.
CREATE TABLE IF NOT EXISTS shipping_providers (
  provider_id INT AUTO_INCREMENT PRIMARY KEY,
  provider_code VARCHAR(50) NOT NULL UNIQUE,
  provider_name VARCHAR(100) NOT NULL,
  tracking_url_template VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Link each shipping record to a managed provider.
-- Shipping_Carrier is intentionally kept for compatibility with existing data.
ALTER TABLE shipping
  ADD COLUMN IF NOT EXISTS provider_id INT NULL;

ALTER TABLE shipping
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS tracking_url VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shipped_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS updated_by INT NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL;

ALTER TABLE shipping
  ADD KEY IF NOT EXISTS idx_shipping_provider_id (provider_id);

-- Initial providers. Admins can add or deactivate providers later.
INSERT INTO shipping_providers (provider_code, provider_name)
VALUES
  ('flash', 'Flash Express'),
  ('kerry', 'KEX / Kerry Express'),
  ('thailand_post', 'ไปรษณีย์ไทย'),
  ('j_and_t', 'J&T Express')
ON DUPLICATE KEY UPDATE
  provider_name = VALUES(provider_name);

-- These statuses are used after an administrator assigns a carrier and tracking number.
ALTER TABLE orders
  MODIFY COLUMN status ENUM(
    'Pending',
    'Slip_submitted',
    'Paid',
    'Wait_for_Import_Fee',
    'Pending_import',
    'Pending_import_fee',
    'Import_slip_submitted',
    'Ready_to_Ship',
    'Shipped',
    'Delivered',
    'Partially_Received',
    'Missing',
    'Delayed',
    'Cancelled',
    'Invalid slip',
    'Invalid_Slip',
    'Invalid import slip'
  ) DEFAULT 'Pending';
