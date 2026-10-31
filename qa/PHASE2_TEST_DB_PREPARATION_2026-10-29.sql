-- Meowverse QA Phase 2 Test DB Preparation
-- STATUS: PREPARED ONLY — NOT EXECUTED
-- DO NOT run this file until the owner approves the target server and backup plan.
-- Never substitute `meowverse` for `meowverse_test` in any command below.
-- This plan intentionally does not copy customer/order/payment data.

-- 1) Create an isolated empty database only after approval.
CREATE DATABASE IF NOT EXISTS meowverse_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

-- 2) Recommended schema-only clone from the current DB.
-- Run from a terminal after confirming the source is the intended local DB:
-- mysqldump --host=127.0.0.1 --port=3306 --user=<QA_DB_USER> --no-data --routines --triggers meowverse > meowverse_test_schema.sql
-- mysql --host=127.0.0.1 --port=3306 --user=<QA_DB_USER> meowverse_test < meowverse_test_schema.sql

-- 3) Apply only approved additive migrations to the test DB.
-- Verify each migration file before executing. At minimum review:
-- database/migrations/2026-09-01-add-account-address.sql
-- database/migrations/2026-09-10-add-product-recommended.sql
-- database/migrations/2026-09-17-add-flavor-prices.sql
-- database/migrations/2026-09-18-add-preorder-minimum-order-qty.sql
-- database/migrations/2026-09-19-category-active-toggle-no-limit.sql
-- database/migrations/2026-09-20-add-preorder-notifications.sql
-- database/migrations/2026-09-21-extend-payment-channels.sql
-- database/migrations/2026-09-22-auth-token-revocation.sql
-- database/migrations/2026-09-23-expand-product-flavors.sql
-- database/migrations/2026-09-24-add-category-image.sql
-- database/migrations/2026-10-08-unpaid-preorder-history.sql

USE meowverse_test;

-- 4) Read-only schema gate after import/migrations.
SELECT DATABASE() AS current_database;
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = DATABASE();

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN (
    'accounts', 'categories', 'products', 'product_images', 'cart',
    'orders', 'order_details', 'payment', 'shipping', 'shipping_providers',
    'preorder_rounds', 'preorder_round_products', 'admin_qrcodes',
    'revoked_tokens', 'unpaid_preorder_orders', 'unpaid_preorder_order_items'
  )
ORDER BY table_name, ordinal_position;

-- 5) Synthetic account seed template.
-- Replace placeholders with newly generated bcrypt hashes only after approval.
-- Do not place plaintext passwords in SQL or source control.
-- INSERT INTO accounts (username, password, role, full_name, phone_number, token_version)
-- VALUES
--   ('qa_admin_p2', '<BCRYPT_HASH_FOR_RANDOM_QA_ADMIN_PASSWORD>', 'admin', 'QA Admin', NULL, 0),
--   ('qa_user_a_p2', '<BCRYPT_HASH_FOR_RANDOM_QA_USER_A_PASSWORD>', 'user', 'QA User A', NULL, 0),
--   ('qa_user_b_p2', '<BCRYPT_HASH_FOR_RANDOM_QA_USER_B_PASSWORD>', 'user', 'QA User B', NULL, 0);

-- 6) Synthetic product/category/preorder seed should be prepared separately,
-- using TEST-ONLY SKUs and no customer/order/payment records.
-- Required coverage: at least one active category, one ready-to-ship product,
-- one preorder product, two flavors with different prices, stock values,
-- one active preorder round, and one shipping provider.

-- 7) Final read-only gate before pointing Backend to the test DB.
SELECT LOWER(role) AS role_name, COUNT(*) AS count
FROM accounts
GROUP BY LOWER(role);

SELECT COUNT(*) AS active_rounds_now
FROM preorder_rounds
WHERE LOWER(status) IN ('active', 'open', 'scheduled')
  AND start_date <= NOW()
  AND end_date >= NOW();

SELECT COUNT(*) AS test_products
FROM products
WHERE prod_name LIKE 'TEST ONLY%'
   OR sku LIKE 'TEST-%';

-- 8) Only after all gates pass, create a separate .env.qa.local (never commit)
-- with DB_NAME=meowverse_test and a QA-only DB user, then restart Backend.
-- Verify live MySQL process list shows database `meowverse_test` before testing.

