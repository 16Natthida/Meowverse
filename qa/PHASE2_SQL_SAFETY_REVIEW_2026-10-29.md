# Meowverse Phase 2 — SQL Safety Review

วันที่ตรวจ: 2026-10-29 (Asia/Bangkok)  
ไฟล์ที่ตรวจ:

- `qa/PHASE2_ENVIRONMENT_REPORT_2026-10-29.md`
- `qa/PHASE2_TEST_CASES_2026-10-29.md`
- `qa/PHASE2_TEST_DB_PREPARATION_2026-10-29.sql`
- migrations ใต้ `database/migrations/`
- schema bootstrap และ background jobs ใน `server/index.js` / `server/auth.js`

ขอบเขตการดำเนินการ: อ่านไฟล์และตรวจโค้ดเท่านั้น **ไม่ได้รัน SQL, ไม่สร้างฐานข้อมูล, ไม่แก้ Source/Environment และไม่เปลี่ยน connection ของ process ที่กำลังทำงาน**

## Verdict

**SQL Preparation ปลอดภัยสำหรับใช้เป็นเอกสารร่าง แต่ยังไม่ปลอดภัยสำหรับ execute แบบทั้งไฟล์หรือใช้เริ่ม Phase 2 ทันที**

เหตุผลหลัก:

1. คำสั่ง active ที่เปลี่ยน state มี `CREATE DATABASE IF NOT EXISTS meowverse_test` ซึ่งตั้งใจใช้สร้าง Test DB แต่ยังเป็น DDL และต้องได้รับอนุญาตก่อน
2. ไม่พบ active `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `ALTER`, `INSERT`, `GRANT` หรือ `REVOKE` ในไฟล์ Preparation
3. template `INSERT INTO accounts` เป็น comment จึงไม่ทำงาน
4. ไฟล์ชี้ให้รัน migrations แยกภายหลัง; migrations หลายไฟล์มี `ALTER`/`UPDATE` และหนึ่งไฟล์มี `DELETE` จริง หากเลือก database ผิดจะกระทบ `meowverse`
5. warning ใน comment ไม่มี technical guard ที่หยุด execution เมื่อ session ชี้ผิด database
6. Backend ทำ schema/data mutation อัตโนมัติระหว่าง startup จึงไม่สามารถถือว่าการเปิด Test Backend เป็น read-only ได้โดยอัตโนมัติ

## 1. Active statement audit ของ SQL Preparation

คำสั่งที่ active มีเพียง:

- บรรทัด 8: `CREATE DATABASE IF NOT EXISTS meowverse_test ...`
- บรรทัด 31: `USE meowverse_test`
- `SELECT` สำหรับตรวจ schema/account/round/product fixture

ผลตรวจ keyword:

| Command | Active ใน Preparation | ความเสี่ยงต่อ `meowverse` |
|---|---:|---|
| `CREATE DATABASE` | 1 | ไม่แก้ `meowverse` โดยตรง แต่เปลี่ยน server state และห้ามรันก่อนอนุมัติ |
| `USE meowverse_test` | 1 | ไม่แก้ข้อมูล แต่การพึ่ง session state อาจผิดพลาดเมื่อรัน migrations แยก |
| `SELECT` | มี | Read-only |
| `INSERT` | ไม่มี; มีเฉพาะ comment | ไม่มีผลจนกว่าจะ uncomment |
| `UPDATE` | ไม่มี | ไม่มีผลจากไฟล์นี้ |
| `DELETE` | ไม่มี | ไม่มีผลจากไฟล์นี้ |
| `ALTER` | ไม่มี | ไม่มีผลจากไฟล์นี้ |
| `DROP` / `TRUNCATE` | ไม่มี | ไม่มีผลจากไฟล์นี้ |

## 2. Migration risk review

การรัน migration ต้องบังคับ target เป็น `meowverse_test` ผ่าน client option เช่น `--database=meowverse_test`; ห้ามอาศัย `USE` จาก session ก่อนหน้า

### Additive/controlled แต่ยังเป็น mutation

- `2026-09-01-add-account-address.sql`: `ALTER TABLE accounts`
- `2026-09-10-add-product-recommended.sql`: `ALTER TABLE products`
- `2026-09-17-add-flavor-prices.sql`: `ALTER TABLE products`
- `2026-09-18-add-preorder-minimum-order-qty.sql`: `ALTER TABLE preorder_round_products`
- `2026-09-19-category-active-toggle-no-limit.sql`: `ALTER` และ `UPDATE categories`
- `2026-09-20-add-preorder-notifications.sql`: `CREATE TABLE`
- `2026-09-21-extend-payment-channels.sql`: `ALTER admin_qrcodes` และ `UPDATE admin_qrcodes`
- `2026-09-22-auth-token-revocation.sql`: `ALTER accounts` และ `CREATE TABLE`
- `2026-09-23-expand-product-flavors.sql`: `ALTER/MODIFY products.flavors`
- `2026-09-24-add-category-image.sql`: `ALTER categories`
- `2026-10-08-unpaid-preorder-history.sql`: `ALTER orders` และ `CREATE TABLE`

### Migration ที่ต้องห้ามรันโดยอัตโนมัติ

`2026-09-19-set-10-product-categories.sql` มี:

- `INSERT` หมวดหมู่
- `UPDATE products` เพื่อย้ายหมวด
- `DELETE FROM categories` สำหรับหมวดที่ไม่อยู่ในรายการ 10 หมวด

ไฟล์นี้ไม่อยู่ในรายการ Preparation ปัจจุบัน ซึ่งถูกต้องแล้ว ควรคงเป็น **manual opt-in only** และใช้เฉพาะ Test DB ที่มี synthetic data หลังตรวจ diff เท่านั้น

## 3. Schema review เทียบ current schema, code และ migrations

### `accounts.address`

- Migration ประกาศ `accounts.address` ที่ `database/migrations/2026-09-01-add-account-address.sql`
- Environment report ระบุว่า current schema ไม่มีคอลัมน์นี้
- `ensureAdminSchema()` และ `ensureAuthSchema()` ไม่สร้าง `accounts.address`
- API profile ปัจจุบันอ่าน/เขียนเฉพาะ `full_name`, `phone_number`, `line_id`, `notes` (`server/index.js:1291`, `server/index.js:1327`)
- checkout ใช้ `shipping.address` ไม่ใช่ `accounts.address`

ข้อสรุป: เป็น schema drift จริง แต่ยังไม่ใช่ runtime dependency ของ profile/checkout ปัจจุบัน ต้องตัดสินใจก่อนสร้าง baseline ว่าจะ:

1. apply migration ใน Test DB และเพิ่ม test case สำหรับ future/default address; หรือ
2. ระบุ migration นี้เป็น deferred/deprecated จนกว่า API และ UI จะรองรับ

ห้ามแก้ current `meowverse` เพียงเพื่อทำให้ schema ตรงในขั้นนี้

### Clean-bootstrap defect

`server/index.js:1789` สร้าง `cart` และที่ `server/index.js:1804` กำหนด FK เป็น `REFERENCES accounts (id)` แต่ current schema/code ใช้ primary identifier `accounts.user_id` ควรเป็น `REFERENCES accounts (user_id)`

ผลกระทบ: clean database ที่ไม่มี `cart` อาจ bootstrap ไม่สำเร็จ แม้ schema clone จากฐานปัจจุบันจะหลบจุดนี้เพราะ `CREATE TABLE IF NOT EXISTS` ไม่ทำงานเมื่อ table มีอยู่แล้ว จุดนี้ต้องแก้หรือมี authoritative schema baseline ก่อนพึ่ง auto-bootstrap

### Missing authoritative baseline

- `docs/DB_SETUP.md` อ้างถึง `meowverse.sql` และ migration `2026-04-16-admin-products.sql`
- ไม่พบทั้งสองไฟล์ใน repository
- `database/payment (2).sql` มีเฉพาะตาราง `payment` ไม่ใช่ full schema
- migrations ปัจจุบันเป็น incremental และไม่สามารถสร้าง base tables ทั้งระบบได้ด้วยตัวเอง

ดังนั้น Test DB ไม่ควรสร้างจาก migrations อย่างเดียว

### Referential integrity observations

จาก Environment report มี orphan references ในฐานปัจจุบัน:

- cart → product: 1
- order_details → product: 3
- product_images → product: 45

ห้าม copy rows เหล่านี้เข้า Test DB. ใช้ schema-only clone และ synthetic seed เท่านั้น

## 4. ความเสี่ยงจาก schema-only dump ที่เสนอ

Preparation เดิมเสนอ:

`mysqldump --no-data --routines --triggers meowverse`

`--no-data` ป้องกันการคัดลอก customer/order/payment rows แต่ `--routines --triggers` อาจนำเข้า:

- `DEFINER` จาก environment เดิม
- trigger/event/routine ที่เขียนข้อมูลอัตโนมัติ
- qualified reference ไป `meowverse.*`

ข้อเสนอที่ปลอดภัยกว่าในรอบแรก:

1. export schema-only ด้วย `--no-data --skip-triggers --routines=false --events=false`
2. ตรวจ dump หา `DEFINER`, `USE meowverse`, และ qualified `meowverse.` ก่อน import
3. import ด้วย client option `--database=meowverse_test`
4. review triggers/routines/events แยกทีละรายการก่อนนำเข้า ถ้าจำเป็นจริง

## 5. วิธีสร้าง `meowverse_test` แบบแยกจริง — ยังไม่ดำเนินการ

ลำดับที่แนะนำหลังได้รับอนุญาต:

1. ยืนยัน MySQL host/port ว่าเป็น local QA server ที่ตั้งใจใช้
2. DBA สร้าง `meowverse_test` เป็นขั้นตอนแยกจาก schema import
3. สร้าง DB user สำหรับ QA โดย grant เฉพาะ `meowverse_test.*`; ห้าม grant บน `meowverse.*` หรือ `*.*`
4. export เฉพาะ schema จาก `meowverse` โดยไม่เอา data/triggers/routines/events
5. review dump และ import เข้า `meowverse_test` ด้วย target ที่ระบุชัด
6. apply additive migrations ทีละไฟล์ผ่าน `--database=meowverse_test`
7. ไม่รัน `2026-09-19-set-10-product-categories.sql` โดยอัตโนมัติ
8. verify tables, columns, indexes และ FK; แก้ clean-bootstrap FK ของ `cart` ในแผนที่ได้รับอนุมัติก่อนพึ่ง auto-bootstrap
9. seed synthetic data ใน transaction บน `meowverse_test` เท่านั้น
10. ตรวจว่าไม่มี username, phone, address, slip, image หรือ order จากลูกค้าจริง

ควรแยกไฟล์ execution ในอนาคตเป็น:

- `00-preflight-readonly.sql`
- `01-create-test-db.sql` — DBA approval required
- `02-schema-import-and-migrations.md` — command checklist, ไม่รวม customer data
- `03-seed-synthetic.sql` — Test DB only
- `04-post-seed-verification.sql` — SELECT only

## 6. Synthetic data plan

ทุก record ใช้ prefix `QA-P2`/`TEST-ONLY`, ข้อมูลติดต่อปลอม และ deterministic keys/SKUs เพื่อ audit ได้

| Area | Fixture plan |
|---|---|
| Categories | active category สำหรับ ready/preorder, inactive category 1 รายการ |
| Products | ready single-price, ready multi-flavor, preorder multi-flavor, out-of-stock, product ใน inactive category |
| Flavor pricing | อย่างน้อย 2 รสที่ ready/preorder price ต่างกัน และ flavor stock แยกกัน |
| Stock | stock ปกติ, stock = 1 สำหรับ boundary, stock = 0, flavor stock ไม่เท่ากัน |
| Preorder rounds | active round ช่วงเวลาปัจจุบัน, scheduled future, closed past; active round มี end date อนาคต |
| Round products | minimum quantity = 3, quantity sold = 0, round price และ China shipping fee แบบคำนวณตรวจได้ |
| Cart | User A มี ready + flavor + preorder ต่ำกว่าขั้นต่ำ; User B มี cart แยกเพื่อ ownership test |
| Orders | Ready Pending ที่ deadline ยังไม่หมด, Ready Shipped, Preorder Slip_submitted, Preorder Wait_for_Import_Fee |
| Payment | Order_fee Pending/Approved และ Import_Fee Pending โดยผูกเฉพาะ synthetic orders |
| Slip | ใช้ generated placeholder ที่มีข้อความ `TEST ONLY`; เก็บใน test workspace uploads เท่านั้น |
| Import fee | กำหนด `orders.import_fee_total` และกระจาย `order_details.Import_fee` ให้ยอดรวมตรวจสอบได้ |
| China shipping | กำหนด fee ต่อ item/flavor และยอดรวม order แบบตัวเลขง่ายต่อ assertion |
| Shipping | ชื่อ `QA User A/B`, เบอร์ปลอม, address `TEST DATA — DO NOT SHIP`, test provider |
| Inventory | intake session ที่มี received/missing/excess fixtures และผลรวมสัมพันธ์กับ order details |
| Dashboard/report | เตรียมสถานะ order/payment/shipping หลายแบบให้ KPI รวมเทียบ SQL ได้ |
| Images/settings | ใช้ placeholder assets และ theme/banner/logo สำหรับ test เท่านั้น |

ข้อกำหนดเวลา: ห้ามสร้าง expired Pending order ใน seed เริ่มต้น เพราะ background jobs อาจลบ/archive ทันทีเมื่อ Backend เริ่ม

## 7. QA account plan

สร้างหลังอนุมัติใน `meowverse_test` เท่านั้น:

- `qa_admin_p2` — role `admin`
- `qa_user_a_p2` — role `user`
- `qa_user_b_p2` — role `user`

มาตรการ:

- สุ่ม password คนละค่าและเก็บในช่องทาง secret ที่ไม่ commit
- insert เฉพาะ bcrypt hash; ห้ามเก็บ plaintext ใน SQL/report
- full name เป็น `QA Admin`, `QA User A`, `QA User B`
- phone/address เป็นข้อมูลปลอมชัดเจน
- `token_version = 0`
- ห้าม reuse credential หรือข้อมูลของบัญชีที่มีอยู่ใน `meowverse`
- verify User A/User B ownership ด้วยข้อมูลคนละชุด

## 8. Test Backend isolation plan

ห้ามเปลี่ยน process ปัจจุบันที่ `3001`/`5173`

แนวทางที่แนะนำหลังอนุมัติ:

- Current stack คงเดิม: frontend `5173` → backend `3001` → `meowverse`
- QA stack แยก: frontend `5174` → backend `3002` → `meowverse_test`
- QA Backend ใช้ process environment แยก: `API_PORT=3002`, `DB_NAME=meowverse_test`, test-only `JWT_SECRET`, `FRONTEND_ORIGIN=http://localhost:5174`
- DB user ของ QA ต้องเข้าถึงได้เฉพาะ `meowverse_test.*`
- รัน QA Backend จาก test workspace/copy แยก เพื่อให้ `server/uploads` ไม่ปะปนกับ process ปัจจุบัน
- `vite.config.js` ปัจจุบัน proxy `/api` และ `/uploads` ไป `3001` แบบ hard-coded จึงต้องมี test-only Vite config/proxy ไป `3002` หลังได้รับอนุญาต; ห้ามใช้ frontend `5173` ทดสอบ QA Backend

### การยืนยัน connection ของแต่ละ process

1. ใช้ `netstat -ano` หา PID ของ listener `3001` และ `3002`
2. หา outbound local ports ของแต่ละ PID ที่เชื่อม `3306`
3. ใช้ MySQL `SHOW FULL PROCESSLIST` ด้วยบัญชีตรวจสอบที่ได้รับอนุญาต
4. จับคู่ local port จาก netstat กับ `Host` ใน process list
5. ต้องได้:
   - PID ของ `3001` → column `db` เป็น `meowverse`
   - PID ของ `3002` → column `db` เป็น `meowverse_test`
6. ตรวจ `GET /api/health` แยกทั้ง `3001` และ `3002`
7. บันทึก PID/port/database mapping ใน QA evidence โดยไม่บันทึก credential

## 9. Backend startup is not read-only

เมื่อ start Backend โค้ดจะ:

- รัน `ensureAdminSchema()` และ `ensureAuthSchema()` (`server/index.js:7458-7459`) ซึ่งมี `ALTER TABLE`/`CREATE TABLE`
- cleanup `revoked_tokens` ด้วย `DELETE` (`server/auth.js:189`)
- auto-sync preorder status และอาจสร้าง order (`server/index.js:629`, `7461`)
- auto-cancel expired Ready orders พร้อมคืน stock/ลบ order (`server/index.js:682`, `7474`)
- archive/cancel expired Preorder orders (`server/index.js:712`, `7487`)

ดังนั้นก่อน Automated E2E ต้องเลือกหนึ่งทาง:

1. ทางที่ปลอดภัยที่สุด: ขออนุญาตเพิ่ม test-only flag สำหรับปิด background jobs; หรือ
2. ถ้ายังไม่แก้ Source: ใช้ Test DB เท่านั้น, apply schema ให้ครบล่วงหน้า, ไม่มี expired eligible rows, ใช้ deadlines อนาคต และ snapshot row counts ก่อน/หลัง startup

แม้ใช้ข้อ 2 ก็ยังไม่ใช่ strictly read-only เพราะ schema ensure/cleanup อาจทำงาน

## 10. Pre-E2E safety checklist

- [ ] ได้รับอนุญาตเป็นลายลักษณ์อักษรก่อนสร้าง `meowverse_test`
- [ ] ยืนยัน DB host/port และยืนยันว่าไม่ใช่ production server
- [ ] current Backend `3001` ยังใช้ PID/connection เดิมและชี้ `meowverse`
- [ ] Test DB user มีสิทธิ์เฉพาะ `meowverse_test.*`
- [ ] schema export เป็น `--no-data` และไม่มี customer data
- [ ] dump ไม่มี `DEFINER`, `USE meowverse`, qualified `meowverse.*`, trigger/routine/event ที่ยังไม่ review
- [ ] additive migrations ถูกเลือกและ review ทีละไฟล์
- [ ] ไม่รัน category normalization migration โดยอัตโนมัติ
- [ ] ตัดสินใจเรื่อง `accounts.address`
- [ ] แก้หรือมี workaround ที่อนุมัติสำหรับ FK `accounts(id)` ใน clean bootstrap
- [ ] synthetic seed ใช้ prefix `QA-P2`/`TEST-ONLY` เท่านั้น
- [ ] มี QA Admin, User A, User B ที่ไม่ reuse ข้อมูลจริง
- [ ] ไม่มี phone/address/slip/image/order ของลูกค้าจริง
- [ ] active preorder round และ deadlines ถูกตั้งให้ไม่ trigger auto-cancel
- [ ] test uploads แยก filesystem จาก current backend
- [ ] Test Backend ฟัง `3002`; Test Frontend ฟัง `5174` และ proxy ไป `3002`
- [ ] process-to-database mapping ยืนยันว่า `3002` → `meowverse_test`
- [ ] background jobs ถูกปิดด้วย flag ที่อนุมัติ หรือ fixtures ถูกออกแบบไม่ให้ถูก mutate
- [ ] บันทึก baseline table counts/checksums ก่อน startup และก่อน E2E
- [ ] เริ่มด้วย authenticated read-only navigation/API GET เท่านั้น
- [ ] Mutation suites ถูก disabled จนได้รับอนุญาตแยก
- [ ] Playwright base URL เป็น `http://localhost:5174` ไม่ใช่ `5173`
- [ ] มี teardown/archive plan สำหรับ Test DB และ test uploads โดยไม่แตะ `meowverse`

## Required changes before Phase 2

1. แยก one-time database creation ออกจาก verification SQL และเพิ่ม approval gate
2. เปลี่ยน schema export รอบแรกให้ไม่รวม triggers/routines/events
3. เพิ่ม target guard ที่ระดับ command (`--database=meowverse_test`) ทุกครั้ง
4. จัดทำ authoritative schema baseline หรือแก้ clean-bootstrap FK ก่อนสร้างฐานเปล่า
5. ตัดสินใจและบันทึก policy ของ `accounts.address`
6. จัดทำ synthetic seed SQL แบบ transaction-safe หลังได้รับอนุญาต
7. จัดทำ QA credentials ผ่าน secret channel
8. เตรียม frontend/backend/upload isolation ที่ `5174`/`3002`
9. ควบคุมหรือออกแบบรอบ background jobs ก่อน start Test Backend

## Final status

**Not approved to execute yet.** ไม่มีคำสั่งใน Preparation ที่ลบหรือแก้ `meowverse` โดยตรง แต่กระบวนการรอบข้างยังมีความเสี่ยงสูงหากเลือก target ผิดหรือ start Backend โดยไม่แยก environment. ต้องแก้รายการด้านบนและขออนุญาตก่อนสร้าง Test DB จริง

