-- Meowverse Phase 2.1 — Synthetic Seed Data Template
-- STATUS: PREPARED ONLY — NOT EXECUTED
-- Target: meowverse_test ONLY
-- Run only after bootstrap verification and approval, using --database=meowverse_test.
-- This script contains no customer data and intentionally fails on duplicate IDs/SKUs.
-- Replace the three bcrypt placeholders in a non-committed runtime copy before execution.

SET NAMES utf8mb4;
START TRANSACTION;

-- QA-only accounts. Never reuse a real username, password, phone, address, or token.
INSERT INTO `accounts`
  (`user_id`,`username`,`password`,`role`,`full_name`,`phone_number`,`line_id`,`address`,`notes`,`token_version`)
VALUES
  (900001,'qa_admin_p2','<REPLACE_WITH_BCRYPT_HASH_ADMIN>','admin','QA Admin',NULL,NULL,'TEST DATA — DO NOT SHIP','QA-P2 synthetic account',0),
  (900002,'qa_user_a_p2','<REPLACE_WITH_BCRYPT_HASH_USER_A>','user','QA User A','0000000001','qa-user-a','TEST DATA — DO NOT SHIP — USER A','QA-P2 synthetic account',0),
  (900003,'qa_user_b_p2','<REPLACE_WITH_BCRYPT_HASH_USER_B>','user','QA User B','0000000002','qa-user-b','TEST DATA — DO NOT SHIP — USER B','QA-P2 synthetic account',0);

INSERT INTO `categories` (`cat_id`,`cat_name`,`cat_detail`,`is_active`,`cat_image`) VALUES
  (910001,'QA-P2 Ready Products','TEST ONLY — ready-to-ship fixtures',1,NULL),
  (910002,'QA-P2 Preorder Products','TEST ONLY — preorder fixtures',1,NULL),
  (910003,'QA-P2 Inactive Category','TEST ONLY — must not appear publicly',0,NULL);

INSERT INTO `products`
  (`prod_id`,`cat_id`,`prod_name`,`sku`,`flavors`,`stock_qty`,`base_price`,`preorder_price`,
   `description`,`image_url`,`preorder_enabled`,`ready_to_ship_enabled`,`flavor_stock`,
   `flavor_prices`,`is_recommended`)
VALUES
  (920001,910001,'TEST ONLY — Ready Single','TEST-READY-SINGLE',NULL,10,120.00,NULL,
   'QA-P2 single-price ready product','/uploads/qa-p2/product-ready-single.svg',0,1,NULL,NULL,1),
  (920002,910001,'TEST ONLY — Ready Flavors','TEST-READY-FLAVOR',
   '["Tuna","Chicken"]',8,110.00,NULL,'QA-P2 flavor stock and price fixture',
   '/uploads/qa-p2/product-ready-flavor.svg',0,1,'{"Tuna":5,"Chicken":3}',
   '{"Tuna":{"readyPrice":110,"preorderPrice":null},"Chicken":{"readyPrice":130,"preorderPrice":null}}',1),
  (920003,910002,'TEST ONLY — Preorder Flavors','TEST-PREORDER-FLAVOR',
   '["Tuna","Chicken"]',0,0.00,90.00,'QA-P2 preorder flavor/minimum fixture',
   '/uploads/qa-p2/product-preorder.svg',1,0,'{"Tuna":0,"Chicken":0}',
   '{"Tuna":{"readyPrice":null,"preorderPrice":90},"Chicken":{"readyPrice":null,"preorderPrice":105}}',1),
  (920004,910001,'TEST ONLY — Out of Stock','TEST-READY-OOS',NULL,0,75.00,NULL,
   'QA-P2 out-of-stock boundary fixture',NULL,0,1,NULL,NULL,0),
  (920005,910003,'TEST ONLY — Inactive Category Product','TEST-INACTIVE-CAT',NULL,5,50.00,NULL,
   'QA-P2 visibility fixture',NULL,0,1,NULL,NULL,0);

INSERT INTO `product_images` (`img_id`,`prod_id`,`flavor`,`image_url`,`sort_order`) VALUES
  (925001,920001,NULL,'/uploads/qa-p2/product-ready-single.svg',0),
  (925002,920002,'Tuna','/uploads/qa-p2/product-ready-flavor.svg',0),
  (925003,920003,'Tuna','/uploads/qa-p2/product-preorder.svg',0);

-- Dates are relative to execution time so the active fixture does not expire in source control.
INSERT INTO `preorder_rounds`
  (`round_id`,`round_name`,`round_description`,`start_date`,`end_date`,`status`)
VALUES
  (930001,'QA-P2 Active Round','TEST ONLY — active preorder coverage',NOW() - INTERVAL 1 DAY,NOW() + INTERVAL 7 DAY,'active'),
  (930002,'QA-P2 Scheduled Round','TEST ONLY — scheduled coverage',NOW() + INTERVAL 10 DAY,NOW() + INTERVAL 20 DAY,'scheduled'),
  (930003,'QA-P2 Closed Round','TEST ONLY — historical coverage',NOW() - INTERVAL 20 DAY,NOW() - INTERVAL 10 DAY,'closed');

INSERT INTO `preorder_round_products`
  (`link_id`,`round_id`,`prod_id`,`quantity_available`,`round_price`,`import_fee_per_products`,
   `quantity_sold`,`china_shipping_fee_thb`,`minimum_order_qty`)
VALUES
  (935001,930001,920003,100,95.00,20.00,0,15.00,3),
  (935002,930002,920003,50,100.00,25.00,0,18.00,5),
  (935003,930003,920003,30,90.00,15.00,12,12.00,3);

INSERT INTO `shipping_providers`
  (`provider_id`,`provider_code`,`provider_name`,`tracking_url_template`,`is_active`)
VALUES
  (940001,'QA-P2','QA-P2 Test Carrier','https://example.invalid/track/{tracking_number}',1);

INSERT INTO `site_settings` (`setting_key`,`setting_value`) VALUES
  ('homepage_banner_image','/uploads/qa-p2/banner.svg'),
  ('brand_logo_image','/uploads/qa-p2/logo.svg'),
  ('theme_primary','#7c3aed'),
  ('theme_accent','#ec4899'),
  ('preorder_terms','["TEST ONLY: no real purchase","TEST ONLY: synthetic payment data"]');

INSERT INTO `admin_qrcodes`
  (`qr_id`,`payment_method`,`qr_image`,`user_id`,`is_active`,`type`,`bank_name`,`account_name`,`account_number`)
VALUES
  (945001,'QA-P2 Test Bank',NULL,900001,1,'bank','QA Test Bank','QA Admin','000-0-00000-0');

-- Separate carts verify flavor identity, minimum quantity, and User A/User B ownership.
INSERT INTO `cart`
  (`cart_id`,`user_id`,`prod_id`,`pre_item_id`,`qty`,`item_type`,`flavor`,`round_id`,`round_price`,`preorder_round_id`)
VALUES
  (950001,900002,920001,NULL,2,'ready-to-ship',NULL,NULL,NULL,NULL),
  (950002,900002,920002,NULL,1,'ready-to-ship','Tuna',NULL,NULL,NULL,NULL),
  (950003,900002,920003,NULL,2,'preorder','Tuna',930001,95.00,930001),
  (950004,900003,920003,NULL,3,'preorder','Chicken',930001,95.00,930001);

-- All mutable deadlines are in the future to avoid immediate startup auto-cancellation.
INSERT INTO `orders`
  (`order_id`,`user_id`,`customer_name_snapshot`,`total_amount`,`status`,`deadline`,`Order_type`,
   `Order_date`,`import_fee_total`,`split_parent_order_id`,`china_shipping_total_thb`,`shipping_fee`,
   `refund_status`,`is_addon`,`parent_order_id`,`order_flow_version`,`preorder_round_id`)
VALUES
  (960001,900002,'QA User A',240.00,'Pending',NOW() + INTERVAL 1 DAY,'Ready',NOW(),0.00,NULL,0.00,40.00,'pending',0,NULL,1,NULL),
  (960002,900002,'QA User A',130.00,'Shipped',NOW() + INTERVAL 1 DAY,'Ready',NOW(),0.00,NULL,0.00,40.00,'pending',0,NULL,1,NULL),
  (960003,900002,'QA User A',195.00,'Wait_for_Import_Fee',NOW() + INTERVAL 5 DAY,'Preorder',NOW(),40.00,NULL,30.00,50.00,'pending',0,NULL,1,930001),
  (960004,900003,'QA User B',190.00,'Slip_submitted',NOW() + INTERVAL 5 DAY,'Preorder',NOW(),0.00,NULL,30.00,50.00,'pending',0,NULL,1,930001);

INSERT INTO `order_details`
  (`detail_id`,`order_id`,`prod_id`,`flavor`,`Price`,`qty`,`received_qty`,`Lot_id`,
   `arrival_status`,`Import_fee`,`item_type`,`preorder_round_id`,`china_shipping_fee_thb`,`refund_status`)
VALUES
  (970001,960001,920001,NULL,120.00,2,0,NULL,'Pending',0.00,'ready-to-ship',NULL,0.00,'pending'),
  (970002,960002,920002,'Chicken',130.00,1,1,NULL,'Arrived',0.00,'ready-to-ship',NULL,0.00,'pending'),
  (970003,960003,920003,'Tuna',90.00,1,1,NULL,'Arrived',20.00,'preorder',930001,15.00,'pending'),
  (970004,960003,920003,'Chicken',105.00,1,0,NULL,'Missing',20.00,'preorder',930001,15.00,'pending'),
  (970005,960004,920003,'Tuna',95.00,2,0,NULL,'Pending',0.00,'preorder',930001,30.00,'pending');

INSERT INTO `payment`
  (`pay_id`,`order_id`,`type`,`amount`,`slip_img`,`Slip_date`,`status`,`payment_method`)
VALUES
  (980001,960002,'Ready pay',130.00,'qa-p2/slip-approved.svg',NOW(),'Approved','QA-P2 Test Bank'),
  (980002,960003,'Order_fee',195.00,'qa-p2/slip-approved.svg',NOW(),'Approved','QA-P2 Test Bank'),
  (980003,960003,'Import_Fee',40.00,'qa-p2/slip-pending.svg',NOW(),'Pending','QA-P2 Test Bank'),
  (980004,960004,'Order_fee',190.00,'qa-p2/slip-pending.svg',NOW(),'Pending','QA-P2 Test Bank');

INSERT INTO `shipping`
  (`ship_id`,`order_id`,`name`,`phone`,`address`,`notes`,`Shipping_Carrier`,`provider_id`,
   `tracking_number`,`tracking_url`,`shipping_status`,`shipped_at`,`actual_shipping_fee`,`updated_by`,`updated_at`)
VALUES
  (990001,960002,'QA User A','0000000001','TEST DATA — DO NOT SHIP — USER A','QA-P2 synthetic shipment',
   'QA-P2 Test Carrier',940001,'QA-P2-TRACK-001','https://example.invalid/track/QA-P2-TRACK-001','shipped',NOW(),40.00,900001,NOW()),
  (990002,960003,'QA User A','0000000001','TEST DATA — DO NOT SHIP — USER A','QA-P2 import-fee fixture',
   'QA-P2 Test Carrier',940001,NULL,NULL,'pending',NULL,50.00,900001,NOW());

INSERT INTO `inventory_intake_sessions`
  (`intake_id`,`order_id`,`admin_user_id`,`expected_amount`,`received_amount`,`refund_amount`,
   `status`,`note`,`excess_stock_action`)
VALUES
  (991001,960003,900001,195.00,90.00,105.00,'Completed','QA-P2 one arrived / one missing','none');

INSERT INTO `inventory_intake_session_items`
  (`item_id`,`intake_id`,`detail_id`,`prod_id`,`ordered_qty`,`received_qty`,`missing_qty`,
   `unit_price`,`refund_amount`,`arrival_status`,`excess_qty`)
VALUES
  (992001,991001,970003,920003,1,1,0,90.00,0.00,'Arrived',0),
  (992002,991001,970004,920003,1,0,1,105.00,105.00,'Missing',0);

INSERT INTO `postpone`
  (`post_id`,`order_id`,`new_deadline`,`reason`,`request_reason`,`contact_phone`,`post_detail`,`status`,`Post_date`)
VALUES
  (993001,960004,NOW() + INTERVAL 7 DAY,'QA-P2 test request','QA-P2 test request','0000000002',
   'TEST ONLY — no customer request','Pending',NOW());

INSERT INTO `preorder_notifications`
  (`notification_id`,`user_id`,`round_id`,`prod_id`,`notification_type`,`title`,`message`,`expires_at`)
VALUES
  (994001,900002,930001,920003,'minimum_reminder','QA-P2 preorder reminder',
   'TEST ONLY — synthetic minimum quantity reminder',NOW() + INTERVAL 7 DAY);

INSERT INTO `sales_summary`
  (`summary_id`,`product_id`,`Lot_id`,`total_quantity`,`total_sales_amount`)
VALUES
  (995001,920002,NULL,1,130.00);

COMMIT;

-- Required post-seed checks are in PHASE2_SCHEMA_VERIFY_READONLY_2026-10-29.sql.

