-- Create preorder rounds management tables

CREATE TABLE IF NOT EXISTS preorder_rounds (
  round_id INT NOT NULL AUTO_INCREMENT,
  round_name VARCHAR(255) NOT NULL,
  round_description VARCHAR(255) NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  status ENUM('active', 'closed', 'archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id),
  KEY idx_preorder_rounds_status (status),
  KEY idx_preorder_rounds_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS preorder_round_products (
  link_id INT NOT NULL AUTO_INCREMENT,
  round_id INT NOT NULL,
  prod_id INT NOT NULL,
  quantity_available INT NOT NULL DEFAULT 0,
  round_price DECIMAL(10, 2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (link_id),
  UNIQUE KEY unique_round_product (round_id, prod_id),
  KEY idx_round_products_round_id (round_id),
  KEY idx_round_products_prod_id (prod_id),
  CONSTRAINT fk_preorder_round_products_round
    FOREIGN KEY (round_id) REFERENCES preorder_rounds (round_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_preorder_round_products_product
    FOREIGN KEY (prod_id) REFERENCES products (prod_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
