-- Meowverse Phase 2.1 — Full Test Schema Bootstrap
-- STATUS: PREPARED ONLY — NOT EXECUTED
-- Target: meowverse_test ONLY
-- Execute only with an explicitly selected database:
--   mysql --host=127.0.0.1 --port=3306 --user=<QA_DB_USER> --database=meowverse_test < this-file.sql
-- This file intentionally contains no CREATE DATABASE, USE, DROP, TRUNCATE, or customer data.
-- It excludes the one-off production-like backup table import_fee_reset_backup_20261029.

SET NAMES utf8mb4;

CREATE TABLE `accounts` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('user','admin') DEFAULT 'user',
  `full_name` VARCHAR(100) NOT NULL,
  `phone_number` VARCHAR(15) DEFAULT NULL,
  `line_id` VARCHAR(50) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `token_version` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uniq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `categories` (
  `cat_id` INT NOT NULL AUTO_INCREMENT,
  `cat_name` VARCHAR(100) NOT NULL,
  `cat_detail` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `cat_image` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`cat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `products` (
  `prod_id` INT NOT NULL AUTO_INCREMENT,
  `cat_id` INT DEFAULT NULL,
  `prod_name` VARCHAR(200) NOT NULL,
  `sku` VARCHAR(100) DEFAULT NULL,
  `flavors` TEXT DEFAULT NULL,
  `stock_qty` INT DEFAULT 0,
  `base_price` DECIMAL(10,2) DEFAULT NULL,
  `preorder_price` DECIMAL(10,2) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `image_url` TEXT DEFAULT NULL,
  `preorder_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `ready_to_ship_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `flavor_stock` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    CHECK (JSON_VALID(`flavor_stock`)),
  `flavor_prices` TEXT DEFAULT NULL,
  `is_recommended` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`prod_id`),
  UNIQUE KEY `uk_products_sku` (`sku`),
  KEY `idx_products_cat_id` (`cat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `preorder_rounds` (
  `round_id` INT NOT NULL AUTO_INCREMENT,
  `round_name` VARCHAR(255) NOT NULL,
  `round_description` VARCHAR(255) DEFAULT NULL,
  `start_date` DATETIME NOT NULL,
  `end_date` DATETIME NOT NULL,
  `status` ENUM('active','closed','archived','scheduled') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`round_id`),
  KEY `idx_preorder_rounds_status` (`status`),
  KEY `idx_preorder_rounds_dates` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT DEFAULT NULL,
  `customer_name_snapshot` VARCHAR(255) DEFAULT NULL,
  `total_amount` DECIMAL(10,2) DEFAULT NULL,
  `status` ENUM(
    'Pending','Slip_submitted','Paid','Wait_for_Import_Fee','Pending_import',
    'Pending_import_fee','Import_slip_submitted','Ready_to_Ship','Shipped',
    'Delivered','Partially_Received','Missing','Delayed','Cancelled',
    'Invalid slip','Invalid_Slip','Invalid import slip'
  ) DEFAULT 'Pending',
  `deadline` DATETIME DEFAULT NULL,
  `Order_type` ENUM('Ready','Preorder') DEFAULT NULL,
  `Order_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `import_fee_total` DECIMAL(10,2) DEFAULT 0.00,
  `split_parent_order_id` INT DEFAULT NULL,
  `china_shipping_total_thb` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `refund_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `refund_completed_at` DATETIME DEFAULT NULL,
  `refund_completed_by` INT DEFAULT NULL,
  `is_addon` TINYINT(1) NOT NULL DEFAULT 0,
  `parent_order_id` INT DEFAULT NULL,
  `order_flow_version` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `preorder_round_id` INT DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uq_orders_user_round_addon` (`user_id`,`preorder_round_id`,`is_addon`),
  KEY `idx_orders_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `order_details` (
  `detail_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT DEFAULT NULL,
  `prod_id` INT DEFAULT NULL,
  `flavor` VARCHAR(120) DEFAULT NULL,
  `pack_size` VARCHAR(50) DEFAULT NULL,
  `Price` DECIMAL(10,2) DEFAULT NULL,
  `qty` INT DEFAULT NULL,
  `received_qty` INT DEFAULT 0,
  `Lot_id` INT DEFAULT NULL,
  `arrival_status` ENUM('Pending','Arrived','Missing','Delayed') DEFAULT 'Pending',
  `Import_fee` DECIMAL(10,2) DEFAULT 0.00,
  `item_type` VARCHAR(20) DEFAULT NULL,
  `preorder_round_id` INT DEFAULT NULL,
  `china_shipping_fee_thb` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `refund_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`detail_id`),
  KEY `idx_order_details_order_id` (`order_id`),
  KEY `idx_order_details_prod_id` (`prod_id`),
  KEY `idx_order_details_lot_id` (`Lot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `payment` (
  `pay_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT DEFAULT NULL,
  `type` ENUM('Order_fee','Import_Fee','Ready pay','import_fee') DEFAULT NULL,
  `amount` DECIMAL(10,2) DEFAULT NULL,
  `slip_img` VARCHAR(255) DEFAULT NULL,
  `Slip_date` DATETIME DEFAULT NULL,
  `status` ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  `payment_method` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (`pay_id`),
  KEY `idx_payment_order_id` (`order_id`),
  CONSTRAINT `fk_payment_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `shipping_providers` (
  `provider_id` INT NOT NULL AUTO_INCREMENT,
  `provider_code` VARCHAR(50) NOT NULL,
  `provider_name` VARCHAR(255) NOT NULL,
  `tracking_url_template` VARCHAR(500) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`provider_id`),
  UNIQUE KEY `uq_shipping_providers_code` (`provider_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `shipping` (
  `ship_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT DEFAULT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `Shipping_Carrier` VARCHAR(50) DEFAULT NULL,
  `provider_id` INT DEFAULT NULL,
  `tracking_number` VARCHAR(100) DEFAULT NULL,
  `tracking_url` VARCHAR(500) DEFAULT NULL,
  `shipping_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `shipped_at` DATETIME DEFAULT NULL,
  `delivered_at` DATETIME DEFAULT NULL,
  `actual_shipping_fee` DECIMAL(10,2) DEFAULT NULL,
  `updated_by` INT DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  `customer_confirmed_at` DATETIME DEFAULT NULL,
  `customer_confirmed_by` INT DEFAULT NULL,
  PRIMARY KEY (`ship_id`),
  KEY `idx_shipping_order_id` (`order_id`),
  KEY `idx_shipping_provider_id` (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `admin_qrcodes` (
  `qr_id` INT NOT NULL AUTO_INCREMENT,
  `payment_method` VARCHAR(50) NOT NULL,
  `qr_image` VARCHAR(255) DEFAULT NULL,
  `user_id` INT NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `type` VARCHAR(20) NOT NULL DEFAULT 'qr',
  `bank_name` VARCHAR(255) DEFAULT NULL,
  `account_name` VARCHAR(255) DEFAULT NULL,
  `account_number` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`qr_id`),
  KEY `idx_admin_qrcodes_user_id` (`user_id`),
  CONSTRAINT `fk_admin_qrcodes_user`
    FOREIGN KEY (`user_id`) REFERENCES `accounts` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `product_images` (
  `img_id` INT NOT NULL AUTO_INCREMENT,
  `prod_id` INT NOT NULL,
  `flavor` VARCHAR(255) DEFAULT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`img_id`),
  KEY `idx_product_images_prod_id` (`prod_id`),
  CONSTRAINT `fk_product_images_prod`
    FOREIGN KEY (`prod_id`) REFERENCES `products` (`prod_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `cart` (
  `cart_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `prod_id` INT NOT NULL,
  `pre_item_id` INT DEFAULT NULL,
  `qty` INT NOT NULL DEFAULT 1,
  `item_type` VARCHAR(20) DEFAULT NULL,
  `flavor` VARCHAR(120) DEFAULT NULL,
  `pack_size` VARCHAR(50) DEFAULT NULL,
  `round_id` INT DEFAULT NULL,
  `round_price` DECIMAL(10,2) DEFAULT NULL,
  `preorder_round_id` INT DEFAULT NULL,
  PRIMARY KEY (`cart_id`),
  KEY `idx_cart_user_id` (`user_id`),
  KEY `idx_cart_prod_id` (`prod_id`),
  KEY `idx_cart_pre_item_id` (`pre_item_id`),
  KEY `idx_cart_round_id` (`round_id`),
  KEY `idx_cart_preorder_round_id` (`preorder_round_id`),
  CONSTRAINT `fk_cart_user`
    FOREIGN KEY (`user_id`) REFERENCES `accounts` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cart_prod`
    FOREIGN KEY (`prod_id`) REFERENCES `products` (`prod_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `preorder_round_products` (
  `link_id` INT NOT NULL AUTO_INCREMENT,
  `round_id` INT NOT NULL,
  `prod_id` INT NOT NULL,
  `quantity_available` INT NOT NULL DEFAULT 0,
  `round_price` DECIMAL(10,2) DEFAULT NULL,
  `import_fee_per_products` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `quantity_sold` INT NOT NULL DEFAULT 0,
  `china_shipping_fee_thb` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `minimum_order_qty` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`link_id`),
  UNIQUE KEY `uq_preorder_round_product` (`round_id`,`prod_id`),
  KEY `idx_round_products_round_id` (`round_id`),
  KEY `idx_round_products_prod_id` (`prod_id`),
  CONSTRAINT `fk_preorder_round_products_round`
    FOREIGN KEY (`round_id`) REFERENCES `preorder_rounds` (`round_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_preorder_round_products_product`
    FOREIGN KEY (`prod_id`) REFERENCES `products` (`prod_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `preorder_notifications` (
  `notification_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `round_id` INT NOT NULL,
  `prod_id` INT NOT NULL,
  `notification_type` VARCHAR(40) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`notification_id`),
  UNIQUE KEY `uq_preorder_notification` (`user_id`,`round_id`,`prod_id`,`notification_type`),
  KEY `idx_preorder_notifications_user_expiry` (`user_id`,`expires_at`),
  KEY `idx_preorder_notifications_round_product` (`round_id`,`prod_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `inventory_intake_sessions` (
  `intake_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `admin_user_id` INT DEFAULT NULL,
  `expected_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `received_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Completed',
  `note` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `excess_stock_action` VARCHAR(20) NOT NULL DEFAULT 'none',
  PRIMARY KEY (`intake_id`),
  KEY `idx_inventory_intake_sessions_order_id` (`order_id`),
  KEY `idx_inventory_intake_sessions_admin_user_id` (`admin_user_id`),
  CONSTRAINT `fk_inventory_intake_sessions_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_intake_sessions_admin`
    FOREIGN KEY (`admin_user_id`) REFERENCES `accounts` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `inventory_intake_session_items` (
  `item_id` INT NOT NULL AUTO_INCREMENT,
  `intake_id` INT NOT NULL,
  `detail_id` INT NOT NULL,
  `prod_id` INT NOT NULL,
  `ordered_qty` INT NOT NULL DEFAULT 0,
  `received_qty` INT NOT NULL DEFAULT 0,
  `missing_qty` INT NOT NULL DEFAULT 0,
  `unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `arrival_status` VARCHAR(30) NOT NULL DEFAULT 'Pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `excess_qty` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`item_id`),
  KEY `idx_inventory_intake_session_items_intake_id` (`intake_id`),
  KEY `idx_inventory_intake_session_items_detail_id` (`detail_id`),
  KEY `idx_inventory_intake_session_items_prod_id` (`prod_id`),
  CONSTRAINT `fk_inventory_intake_items_session`
    FOREIGN KEY (`intake_id`) REFERENCES `inventory_intake_sessions` (`intake_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_intake_items_detail`
    FOREIGN KEY (`detail_id`) REFERENCES `order_details` (`detail_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_intake_items_product`
    FOREIGN KEY (`prod_id`) REFERENCES `products` (`prod_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `postpone` (
  `post_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT DEFAULT NULL,
  `new_deadline` DATETIME DEFAULT NULL,
  `reason` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `request_reason` VARCHAR(255) DEFAULT NULL,
  `contact_phone` VARCHAR(50) DEFAULT NULL,
  `post_detail` VARCHAR(500) DEFAULT NULL,
  `status` ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  `Post_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`),
  KEY `idx_postpone_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `revoked_tokens` (
  `jti` CHAR(32) NOT NULL,
  `user_id` INT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`jti`),
  KEY `idx_revoked_tokens_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `sales_summary` (
  `summary_id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `Lot_id` INT DEFAULT NULL,
  `total_quantity` INT DEFAULT 0,
  `total_sales_amount` DECIMAL(10,2) DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`summary_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `site_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `unpaid_preorder_orders` (
  `history_id` BIGINT NOT NULL AUTO_INCREMENT,
  `original_order_id` INT NOT NULL,
  `user_id` INT DEFAULT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_username` VARCHAR(255) DEFAULT NULL,
  `preorder_round_id` INT DEFAULT NULL,
  `preorder_round_name` VARCHAR(255) DEFAULT NULL,
  `order_date` DATETIME DEFAULT NULL,
  `payment_deadline` DATETIME NOT NULL,
  `archived_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status_before` VARCHAR(50) NOT NULL,
  `admin_note` TEXT DEFAULT NULL,
  `payment_snapshot` LONGTEXT DEFAULT NULL,
  PRIMARY KEY (`history_id`),
  UNIQUE KEY `uq_unpaid_preorder_original_order` (`original_order_id`),
  KEY `idx_unpaid_preorder_user` (`user_id`),
  KEY `idx_unpaid_preorder_round` (`preorder_round_id`),
  KEY `idx_unpaid_preorder_archived_at` (`archived_at`),
  KEY `idx_unpaid_preorder_deadline` (`payment_deadline`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `unpaid_preorder_order_items` (
  `history_item_id` BIGINT NOT NULL AUTO_INCREMENT,
  `history_id` BIGINT NOT NULL,
  `prod_id` INT DEFAULT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `flavor` VARCHAR(120) DEFAULT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `preorder_round_id` INT DEFAULT NULL,
  PRIMARY KEY (`history_item_id`),
  KEY `idx_unpaid_preorder_items_history` (`history_id`),
  KEY `idx_unpaid_preorder_items_product` (`prod_id`),
  CONSTRAINT `fk_unpaid_preorder_items_history`
    FOREIGN KEY (`history_id`) REFERENCES `unpaid_preorder_orders` (`history_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

