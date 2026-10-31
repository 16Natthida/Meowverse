# Meowverse QA Phase 2.1 — Test Database & Isolated Environment Preparation

วันที่จัดทำ: 2026-10-29 (Asia/Bangkok)  
สถานะ: **PREPARED — EXECUTION NOT AUTHORIZED**  
ขอบเขตที่ทำ: read-only schema inspection และสร้างไฟล์ตัวอย่างใน `qa` เท่านั้น

ไม่ได้รัน SQL, ไม่สร้าง `meowverse_test`, ไม่แก้ `meowverse`, ไม่เปลี่ยน Backend/Frontend ที่กำลังทำงาน, ไม่แก้ Source Code เดิม, ไม่ Push/Deploy

## 1. Current schema inspection

ตรวจด้วย schema-only dump (`mysqldump --no-data --skip-triggers --routines=false --events=false`) และอ่าน source/migrations โดยไม่คัดลอก rows

ฐานปัจจุบันมี 23 tables:

- 22 application tables ที่นำมาจัดทำ bootstrap
- 1 one-off backup table `import_fee_reset_backup_20261029` ซึ่งถูกตัดออกจาก Test Schema

Full column, type, primary key, index และ foreign key definitions ถูกนำไปจัดทำใน:

- `qa/PHASE2_BOOTSTRAP_SCHEMA_2026-10-29.sql`
- `qa/PHASE2_SCHEMA_VERIFY_READONLY_2026-10-29.sql`

Bootstrap มี 22 `CREATE TABLE`, ไม่มี `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `INSERT` หรือ `ALTER`

## 2. Schema drift findings

| Area | Current schema | Code/Migration intent | Bootstrap decision | ต้องอนุมัติ/แก้ก่อนรัน |
|---|---|---|---|---|
| `accounts.address` | ไม่มี | migration 2026-09-01 เพิ่ม `TEXT` แต่ API ปัจจุบันไม่ใช้ | รวม nullable `address TEXT` | ตัดสินใจว่าจะรองรับจริงหรือคงเป็น future field |
| `cart.user_id` FK | ไม่มี FK ใน current DB | clean bootstrap ใน source อ้างผิด `accounts(id)` | แก้เป็น `accounts(user_id)` | ควรแก้ source `server/index.js:1804` แยกต่างหากก่อนพึ่ง auto-bootstrap |
| `cart.prod_id` FK | ไม่มีใน current DB | source กำหนด cascade FK | รวม FK ตาม source intent | review behavior เมื่อ product ถูกลบ |
| `product_images.prod_id` FK | ไม่มีใน current DB | source กำหนด cascade FK | รวม FK ตาม source intent | review orphan cleanup/compatibility |
| Preorder round product FKs | ไม่มีใน current DB | source กำหนด round/product cascade FKs | รวมตาม source intent | review compatibility |
| Inventory item FKs | บาง FK หาย | source กำหนด session/detail/product FKs | รวมตาม source intent | review delete behavior |
| `payment.order_id` FK | ไม่มีใน current DB | legacy payment schema กำหนด FK | รวม non-cascade FK | review manual delete order flow |
| `products.description` | `VARCHAR(1000)` | source bootstrap ใช้ `TEXT` | ใช้ `TEXT` | ยืนยัน schema baseline |
| `shipping_providers.provider_name` | `VARCHAR(100)` | source bootstrap ใช้ `VARCHAR(255)` | ใช้ 255 | ยืนยัน schema baseline |
| `revoked_tokens` charset | `utf8` | app tables ใช้ `utf8mb4` | ใช้ `utf8mb4` | low-risk normalization |
| Backup table | มี | ไม่ใช่ application schema | ไม่รวม | ถูกต้อง |

ข้อสำคัญ: Test Schema นี้เป็น **reconciled intended schema** ไม่ใช่ byte-for-byte clone ของ current DB. Foreign keys ที่เพิ่มขึ้นอาจทำให้ Test DB เข้มงวดกว่าฐานปัจจุบัน จึงต้อง review และอนุมัติก่อน execute

## 3. Migration review

### Additive/conditional migrations

ตรวจแล้วว่า migrations ต่อไปนี้มี DDL/DML และต้องบังคับ target เป็น `meowverse_test`:

- account address
- recommended product
- flavor prices / expanded flavors
- preorder minimum quantity
- category active/image
- preorder notifications
- payment channels
- auth token revocation
- unpaid preorder history

Bootstrap รวมผลลัพธ์สุดท้ายของ migrations เหล่านี้แล้ว จึงไม่ควรรัน migration ซ้ำโดยอัตโนมัติหลัง bootstrap เว้นแต่ schema verification พบว่าขาดจริง

### Migration ไม่อนุมัติให้รันอัตโนมัติ

`2026-09-19-set-10-product-categories.sql` มี `UPDATE products` และ `DELETE FROM categories`; ไม่ถูกรวมใน bootstrap/seed execution plan

### Missing baseline

เอกสารเดิมอ้าง `meowverse.sql` และ `2026-04-16-admin-products.sql` แต่ไม่พบใน repository. Bootstrap ที่จัดทำใหม่จึงเป็น candidate baseline สำหรับ Test DB เท่านั้น และยังไม่แทน production migration authority จนกว่าจะได้รับ review

## 4. Full Test Schema

ไฟล์: `qa/PHASE2_BOOTSTRAP_SCHEMA_2026-10-29.sql`

คุณสมบัติ:

- ไม่มี `CREATE DATABASE` หรือ `USE`
- ต้องเลือก target ผ่าน client `--database=meowverse_test`
- ไม่มีข้อมูลจริงและไม่มี AUTO_INCREMENT counters จาก current DB
- ไม่รวม triggers, routines, events หรือ definers
- รวม PK/index/type/enum ที่ระบบใช้
- แก้ `cart.user_id → accounts.user_id`
- รวม `accounts.address` เป็น nullable field ตาม migration
- ไม่รวม one-off backup table

ยังไม่ได้ execute/lint กับ database parser เพราะข้อกำหนดห้ามรัน SQL. ก่อนใช้งานจริงต้อง validate บน disposable `meowverse_test` ที่ได้รับอนุญาตเท่านั้น

## 5. Synthetic seed design

ไฟล์: `qa/PHASE2_SEED_DATA_TEMPLATE_2026-10-29.sql`

ครอบคลุม:

- QA Admin, User A, User B พร้อม bcrypt placeholders
- active/inactive categories
- ready single-price, ready flavor-price, preorder flavor-price, out-of-stock, inactive-category products
- stock และ flavor stock
- active, scheduled และ closed preorder rounds
- minimum quantity, round price, China shipping และ import fee
- cart ของ User A/User B สำหรับ ownership และ minimum tests
- Ready/Preorder orders หลายสถานะ
- Order fee, Ready pay และ Import Fee payment rows
- shipping/tracking
- inventory intake แบบ arrived/missing
- postpone request, notification, site settings, payment channel และ dashboard summary fixture

ทุก record ใช้ synthetic IDs ช่วง 900000+, prefix `QA-P2`/`TEST ONLY`, phone/address ปลอม และ deadlines อนาคตเพื่อลด auto-cancel ระหว่าง startup

ไฟล์ยังไม่พร้อม execute จนกว่าจะใส่ bcrypt hashes ผ่าน runtime copy ที่ไม่ commit. ห้ามเก็บ plaintext QA passwords ใน repository

## 6. Test uploads

เตรียม synthetic SVG fixtures ที่:

`qa/test-fixtures/uploads/qa-p2/`

ประกอบด้วย product images, banner, logo และ payment-slip fixtures ที่ระบุ `TEST ONLY` ชัดเจน ไม่มีข้อมูลลูกค้า/ธุรกรรมจริง

SVG เหล่านี้ใช้สำหรับ seeded read-only display. ก่อนทดสอบ upload validation แบบ mutation ต้องเตรียม valid PNG/JPEG/WebP และ invalid MIME fixtures เพิ่มใน isolated workspace หลังได้รับอนุญาต

หลังอนุมัติ ให้ copy เฉพาะ directory นี้ไปยัง `server/uploads/qa-p2/` ของ **isolated QA workspace** ไม่ใช่ workspace/process ปัจจุบัน

## 7. Isolated process/config design

### Current stack — ห้ามเปลี่ยน

- Frontend `5173`
- Backend `3001`
- Database `meowverse`

### Proposed QA stack — ยังไม่เปิด

- Frontend `5174`
- Backend `3002`
- Database `meowverse_test`
- QA-only DB user restricted to `meowverse_test.*`
- QA-only JWT secret
- isolated workspace and `server/uploads`

Configuration examples:

- `qa/PHASE2_TEST_ENV_2026-10-29.env.example`
- `qa/PHASE2_VITE_CONFIG_2026-10-29.example.mjs`

Env example ไม่ได้ถูก load. Vite example ผ่าน `node --check` แต่ยังไม่ได้ start

### Unsupported settings requiring a decision

Current source ยังไม่รองรับ:

- configurable uploads directory
- `QA_DISABLE_BACKGROUND_JOBS`
- `QA_DISABLE_AUTO_SCHEMA`

ทางเลือกโดยไม่แก้ source คือรันจาก isolated workspace เพื่อแยก uploads และใช้ Test DB ที่ fixtures ไม่มี expired eligible rows. หากต้องการ strict read-only startup ต้องขออนุญาตแก้ source เพิ่ม flags เหล่านี้

## 8. Startup jobs and auto-migration impact

การ start Backend มีผลต่อ database แม้ยังไม่กด UI:

| Job | Trigger | Potential writes |
|---|---|---|
| `ensureAdminSchema()` | startup | `ALTER`/`CREATE`, rebuild import fee totals, repair order statuses |
| `ensureAuthSchema()` | startup | `ALTER accounts`, `CREATE revoked_tokens`, `DELETE` expired revoked tokens |
| Preorder status sync | startup, ทุก 60 วินาที, และบาง GET endpoints | insert notifications, update round status, create orders เมื่อปิดรอบ |
| Ready auto-cancel | startup และทุก 15 วินาที | restore stock, delete payment/shipping/details/order |
| Preorder auto-archive | startup และทุก 15 วินาที | insert history, update quantity sold, delete original order |

GET endpoints `/api/preorder-rounds`, `/api/preorder-rounds/active` และ `/api/admin/preorder-progress` เรียก preorder status sync จึงไม่ strictly read-only

ผลกระทบต้องจำกัดอยู่ที่ `meowverse_test` เท่านั้น การ start QA Backend ก่อนยืนยัน process-to-database mapping ถือว่าไม่ปลอดภัย

## 9. Verifying the Backend uses the Test DB

หลังได้รับอนุญาตและเปิด process:

1. `netstat -ano` หา PID listener `3001` และ `3002`
2. หา outbound local ports ของแต่ละ PID ที่เชื่อม MySQL `3306`
3. ใช้ `SHOW FULL PROCESSLIST` ผ่าน read-only inspection account
4. จับคู่ local port/PID กับ `Host` ใน process list
5. ต้องยืนยัน:
   - `3001 PID → db=meowverse`
   - `3002 PID → db=meowverse_test`
6. เรียก health แยก `3001`/`3002`
7. รัน `PHASE2_SCHEMA_VERIFY_READONLY_2026-10-29.sql` บน test target
8. บันทึก evidence โดยไม่บันทึก credentials/hash/token

ห้ามเชื่อเพียงค่าใน env file; ต้องตรวจ live process connection

## 10. Read-only verification

ไฟล์ `qa/PHASE2_SCHEMA_VERIFY_READONLY_2026-10-29.sql` มีเฉพาะ `SELECT` และตรวจ:

- tables, columns, data types
- PK/FK/indexes
- `accounts.address`
- corrected cart FK
- QA accounts โดยไม่แสดง password
- fixture counts
- orphan references
- import fee/China shipping arithmetic
- expired orders ที่อาจถูก startup jobs เปลี่ยน
- ยืนยันว่า backup table ไม่ถูก import

## 11. Rollback and cleanup

ไฟล์ `qa/PHASE2_TEST_CLEANUP_TEMPLATE_2026-10-29.sql` มี read-only preflight และเก็บ `DROP DATABASE meowverse_test` เป็น comment เท่านั้น

ลำดับ cleanup หลังได้รับอนุญาตแยก:

1. หยุดเฉพาะ QA frontend/backend ที่ `5174/3002`
2. ยืนยัน PID ไม่ตรงกับ current stack
3. archive QA reports/screenshots/logs ที่ต้องเก็บ
4. ลบเฉพาะ isolated QA workspace uploads หรือย้ายเข้าถังขยะ
5. ยืนยัน exact schema name `meowverse_test`
6. ขอ cleanup approval
7. จึงค่อย uncomment/drop เฉพาะ `meowverse_test`
8. ยืนยัน `meowverse` และ process `3001/5173` ไม่เปลี่ยน

ไม่มี cleanup command ใดถูกรันในขั้นนี้

## 12. Remaining changes/approvals before execution

### Source changes ที่แนะนำ แต่ยังไม่ได้ทำ

1. แก้ `server/index.js:1804` จาก `accounts(id)` เป็น `accounts(user_id)`
2. เพิ่ม test-only background-job disable flag หากต้องการ strict read-only authenticated phase
3. เพิ่ม configurable uploads path หากไม่ใช้ isolated workspace
4. พิจารณา configurable Vite proxy target แทน hard-coded `3001`
5. ตัดสินใจว่า profile/default address จะใช้ `accounts.address` หรือ deprecate migration

### Execution approvals ที่ยังต้องขอ

1. สร้าง `meowverse_test`
2. สร้าง/grant QA-only DB user
3. execute bootstrap schema
4. generate bcrypt hashes และ execute synthetic seed
5. copy test uploads เข้า isolated workspace
6. start Backend `3002` และ Frontend `5174`
7. เริ่ม Playwright authenticated testing

## Prepared artifacts

- `PHASE2_BOOTSTRAP_SCHEMA_2026-10-29.sql`
- `PHASE2_SEED_DATA_TEMPLATE_2026-10-29.sql`
- `PHASE2_SCHEMA_VERIFY_READONLY_2026-10-29.sql`
- `PHASE2_TEST_CLEANUP_TEMPLATE_2026-10-29.sql`
- `PHASE2_TEST_ENV_2026-10-29.env.example`
- `PHASE2_VITE_CONFIG_2026-10-29.example.mjs`
- `test-fixtures/uploads/qa-p2/*`

## Stop gate

การเตรียมไฟล์เสร็จแล้วและหยุดที่ approval gate ตามข้อกำหนด ขั้นตอนต่อไปจะเปลี่ยน state ครั้งแรกด้วยการสร้าง `meowverse_test`; **ห้ามดำเนินการจนกว่าจะได้รับอนุญาตโดยชัดเจน**

