CREATE TABLE IF NOT EXISTS preorder_notifications (
  notification_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  round_id INT NOT NULL,
  prod_id INT NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_preorder_notification (user_id, round_id, prod_id, notification_type),
  KEY idx_preorder_notifications_user_expiry (user_id, expires_at),
  KEY idx_preorder_notifications_round_product (round_id, prod_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
