-- Add columns and table needed by admin product management frontend
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preorder_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ready_to_ship_enabled TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS product_images (
  img_id INT NOT NULL AUTO_INCREMENT,
  prod_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (img_id),
  KEY idx_product_images_prod_id (prod_id),
  CONSTRAINT fk_product_images_prod
    FOREIGN KEY (prod_id) REFERENCES products (prod_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
