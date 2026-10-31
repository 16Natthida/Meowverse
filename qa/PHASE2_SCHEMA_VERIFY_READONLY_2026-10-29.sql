-- Meowverse Phase 2.1 — Read-only Schema and Seed Verification
-- STATUS: PREPARED ONLY — NOT EXECUTED
-- Contains SELECT/SHOW only. Run with --database=meowverse_test.

SELECT DATABASE() AS current_database;

SELECT table_name, engine, table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;

SELECT table_name, column_name, ordinal_position, column_type, is_nullable,
       column_default, extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
ORDER BY table_name, ordinal_position;

SELECT table_name, index_name, non_unique, seq_in_index, column_name, index_type
FROM information_schema.statistics
WHERE table_schema = DATABASE()
ORDER BY table_name, index_name, seq_in_index;

SELECT table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = DATABASE()
ORDER BY table_name, constraint_type, constraint_name;

SELECT table_name, constraint_name, column_name,
       referenced_table_name, referenced_column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IS NOT NULL
ORDER BY table_name, constraint_name, ordinal_position;

-- Required drift gates.
SELECT COUNT(*) AS accounts_address_column_count
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'accounts'
  AND column_name = 'address'
  AND data_type = 'text';

SELECT COUNT(*) AS corrected_cart_user_fk_count
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND table_name = 'cart'
  AND column_name = 'user_id'
  AND referenced_table_name = 'accounts'
  AND referenced_column_name = 'user_id';

SELECT COUNT(*) AS unexpected_cart_accounts_id_fk_count
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND table_name = 'cart'
  AND column_name = 'user_id'
  AND referenced_table_name = 'accounts'
  AND referenced_column_name = 'id';

-- Synthetic account and bcrypt-shape checks; no password value is returned.
SELECT user_id, username, role, full_name, token_version
FROM accounts
WHERE user_id IN (900001,900002,900003)
ORDER BY user_id;

SELECT COUNT(*) AS qa_account_count,
       SUM(password LIKE '$2%') AS bcrypt_like_count,
       SUM(LENGTH(password) >= 50) AS hash_length_ok_count
FROM accounts
WHERE user_id IN (900001,900002,900003);

-- Fixture inventory.
SELECT COUNT(*) AS qa_category_count FROM categories WHERE cat_id BETWEEN 910001 AND 910999;
SELECT COUNT(*) AS qa_product_count FROM products WHERE prod_id BETWEEN 920001 AND 920999;
SELECT COUNT(*) AS qa_round_count FROM preorder_rounds WHERE round_id BETWEEN 930001 AND 930999;
SELECT COUNT(*) AS qa_cart_count FROM cart WHERE cart_id BETWEEN 950001 AND 950999;
SELECT COUNT(*) AS qa_order_count FROM orders WHERE order_id BETWEEN 960001 AND 960999;
SELECT COUNT(*) AS qa_payment_count FROM payment WHERE pay_id BETWEEN 980001 AND 980999;

-- No orphan references in synthetic data.
SELECT COUNT(*) AS orphan_cart_users
FROM cart c LEFT JOIN accounts a ON a.user_id = c.user_id
WHERE c.cart_id BETWEEN 950001 AND 950999 AND a.user_id IS NULL;

SELECT COUNT(*) AS orphan_cart_products
FROM cart c LEFT JOIN products p ON p.prod_id = c.prod_id
WHERE c.cart_id BETWEEN 950001 AND 950999 AND p.prod_id IS NULL;

SELECT COUNT(*) AS orphan_order_details_orders
FROM order_details od LEFT JOIN orders o ON o.order_id = od.order_id
WHERE od.detail_id BETWEEN 970001 AND 970999 AND o.order_id IS NULL;

SELECT COUNT(*) AS orphan_order_details_products
FROM order_details od LEFT JOIN products p ON p.prod_id = od.prod_id
WHERE od.detail_id BETWEEN 970001 AND 970999 AND p.prod_id IS NULL;

SELECT COUNT(*) AS orphan_payments
FROM payment pay LEFT JOIN orders o ON o.order_id = pay.order_id
WHERE pay.pay_id BETWEEN 980001 AND 980999 AND o.order_id IS NULL;

-- Validate import-fee and China-shipping arithmetic.
SELECT o.order_id, o.import_fee_total,
       COALESCE(SUM(od.Import_fee),0) AS detail_import_fee_total,
       o.china_shipping_total_thb,
       COALESCE(SUM(od.china_shipping_fee_thb),0) AS detail_china_shipping_total
FROM orders o
LEFT JOIN order_details od ON od.order_id = o.order_id
WHERE o.order_id IN (960003,960004)
GROUP BY o.order_id, o.import_fee_total, o.china_shipping_total_thb
ORDER BY o.order_id;

-- Startup-job safety: all results should be zero before first Backend start.
SELECT COUNT(*) AS expired_ready_orders_eligible_for_auto_cancel
FROM orders
WHERE Order_type = 'Ready'
  AND status IN ('Pending','Invalid slip')
  AND deadline IS NOT NULL
  AND deadline < NOW();

SELECT COUNT(*) AS expired_preorder_orders_eligible_for_auto_archive
FROM orders
WHERE Order_type = 'Preorder'
  AND split_parent_order_id IS NULL
  AND status IN ('Pending','Invalid slip','Invalid_Slip')
  AND deadline IS NOT NULL
  AND deadline < NOW();

SELECT round_id, round_name, status, start_date, end_date
FROM preorder_rounds
ORDER BY round_id;

-- Verify no production-like backup table was imported.
SELECT COUNT(*) AS excluded_backup_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'import_fee_reset_backup_20261029';

