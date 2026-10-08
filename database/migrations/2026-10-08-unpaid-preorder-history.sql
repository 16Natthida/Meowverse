-- Archive unpaid, expired preorder orders without changing existing order data.
-- Run once against the target database before deploying the updated backend.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name_snapshot VARCHAR(255) NULL AFTER user_id;

CREATE TABLE IF NOT EXISTS unpaid_preorder_orders (
  history_id BIGINT NOT NULL AUTO_INCREMENT,
  original_order_id INT NOT NULL,
  user_id INT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_username VARCHAR(255) NULL,
  preorder_round_id INT NULL,
  preorder_round_name VARCHAR(255) NULL,
  order_date DATETIME NULL,
  payment_deadline DATETIME NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status_before VARCHAR(50) NOT NULL,
  admin_note TEXT NULL,
  payment_snapshot LONGTEXT NULL,
  PRIMARY KEY (history_id),
  UNIQUE KEY uq_unpaid_preorder_original_order (original_order_id),
  KEY idx_unpaid_preorder_user (user_id),
  KEY idx_unpaid_preorder_round (preorder_round_id),
  KEY idx_unpaid_preorder_archived_at (archived_at),
  KEY idx_unpaid_preorder_deadline (payment_deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS unpaid_preorder_order_items (
  history_item_id BIGINT NOT NULL AUTO_INCREMENT,
  history_id BIGINT NOT NULL,
  prod_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  flavor VARCHAR(120) NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  preorder_round_id INT NULL,
  PRIMARY KEY (history_item_id),
  KEY idx_unpaid_preorder_items_history (history_id),
  KEY idx_unpaid_preorder_items_product (prod_id),
  CONSTRAINT fk_unpaid_preorder_items_history
    FOREIGN KEY (history_id) REFERENCES unpaid_preorder_orders (history_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
