# Meowverse QA Phase 2 — Environment Readiness Report

วันที่ตรวจ: 2026-10-29 (Asia/Bangkok)  
โหมด: Read-only inspection เท่านั้น  
สถานะ: **NOT READY สำหรับ Authenticated Testing**

## Executive conclusion

ระบบรันอยู่และ Backend ตอบ health check ได้ แต่ยังไม่ควรเริ่มทดสอบด้วยบัญชีที่มีสิทธิ์หรือทำ mutation เพราะ Backend เชื่อมต่อฐานข้อมูล `meowverse` ซึ่งไม่ใช่ Test Database, ไม่พบ `meowverse_test`, และยังไม่มีบัญชี User A/User B ที่ยืนยันชื่อ/credential ได้

## 1. Backend และ configuration

| รายการ | ผลตรวจ |
|---|---|
| Frontend | `http://localhost:5173` ตอบ HTTP 200 |
| Backend | `http://localhost:3001` ตอบ HTTP 200 |
| Health | `GET /api/health` ได้ `{"ok":true}` |
| Backend listener | `127.0.0.1:3001`, process ID `33952` |
| MySQL listener | `127.0.0.1:3306` |
| Live DB binding | MySQL process list แสดง connection ของ Backend เป็น database `meowverse` |
| Workspace `.env` | ไม่พบไฟล์ `.env`; มีเฉพาะ `.env.example` และไม่ได้แสดงค่า Secret |
| Default config reference | `.env.example` ชี้ `DB_NAME=meowverse`, `DB_HOST=127.0.0.1`, `DB_PORT=3306` |

ไม่แสดง `DB_PASSWORD`, `JWT_SECRET`, token, password หรือ password hash ในรายงานนี้

## 2. Test Database check

- MySQL ที่ `127.0.0.1:3306` เชื่อมต่อได้แบบ read-only
- พบ database `meowverse`
- **ไม่พบ database `meowverse_test`**
- ยังไม่สร้าง database และยังไม่รัน DDL/DML ใด ๆ

## 3. Account readiness

| รายการ | จำนวน/ผลตรวจ |
|---|---:|
| Accounts ทั้งหมด | 613 |
| Admin | 10 |
| User | 603 |
| Username ที่มี pattern `test|qa|demo` | 3 (Admin 1, User 2) |
| Candidate ที่ยืนยันเป็น User A | ไม่พบจาก naming pattern ที่ตรวจ |
| Candidate ที่ยืนยันเป็น User B | ไม่พบจาก naming pattern ที่ตรวจ |
| Password shape | 613/613 มีรูปแบบ bcrypt-like; ไม่พบค่าความยาวต่ำกว่า 50 |

มีบัญชีที่ดูเป็น test-like อยู่บางส่วน แต่ยังไม่ทราบ credential และยังยืนยันไม่ได้ว่าเป็นบัญชีทดสอบที่ได้รับอนุญาต จึงถือว่า **ไม่มี verified Admin/User A/User B test account** สำหรับการทดสอบ

## 4. Schema และข้อมูลจำลอง

ฐานข้อมูลมี 23 ตาราง รวมตารางหลักสำหรับ `accounts`, `categories`, `products`, `product_images`, `cart`, `orders`, `order_details`, `payment`, `shipping`, `shipping_providers`, `preorder_rounds`, `preorder_round_products`, inventory intake และ unpaid preorder history

ข้อมูลที่พบจาก aggregate แบบไม่เปิดเผยข้อมูลส่วนบุคคล:

| Area | Result |
|---|---:|
| Products | 329 |
| Ready-to-ship enabled | 77 |
| Preorder enabled | 205 |
| Products with flavor pricing | 236 |
| Test fixture products (`TEST ONLY`/`TEST-`) | 3 |
| Active categories | 10 |
| Active shipping providers | 6 |
| Preorder rounds | 4 แต่ปิดทั้งหมด |
| Active preorder round ณ เวลาตรวจ | 0 |
| Orders | 35 |
| Payment rows | 42 (Approved 30, Pending 12) |
| Shipping rows | 38 |

### Schema/data risks ที่ต้องแก้หรือยืนยันก่อน Phase 2

1. `accounts.address` ยังไม่มี แม้มี migration `2026-09-01-add-account-address.sql` และ flow profile/address อ้างถึงฟิลด์นี้
2. พบ orphan references จาก read-only integrity check: cart → product 1 รายการ, order_details → product 3 รายการ, product_images → product 45 รายการ
3. ไม่พบ active/open/scheduled preorder round จึงยังทดสอบ preorder checkout และ minimum-order flow แบบจริงไม่ได้
4. มี foreign key ที่ตรวจพบเพียงบางตาราง; ต้องยืนยัน baseline schema ก่อนทำ data-integrity testing เต็มรูปแบบ
5. พบ test fixture products 3 รายการในฐานข้อมูลปัจจุบัน แต่ฐานข้อมูลนี้มีข้อมูลธุรกรรมจริง/กึ่งจริงอยู่ จึงห้ามใช้เป็น QA mutation target

## 5. Read-only API probe

| Endpoint | Result |
|---|---|
| `GET /api/health` | 200 |
| `GET /api/categories` | 200, 10 rows |
| `GET /api/products/public` | 200 |
| `GET /api/products/ready-to-ship` | 200, 77 rows |
| `GET /api/products/preorder` | 200 |
| `GET /api/preorder-rounds/active` | 200, 0 rows |
| `GET /api/site-settings/*` | 200 |
| `GET /api/shipping-providers` | 200, 6 rows |
| `GET /api/cart` | 401 ตาม expected auth protection |
| `GET /api/orders` | 401 ตาม expected auth protection |
| `GET /api/qrcodes` | 401 ตาม expected auth protection |

## Readiness decision

**Blocked — ยังไม่พร้อมเข้าสู่ Authenticated Testing**

ปลดล็อกได้เมื่อมีครบทุกข้อ:

- สร้างและยืนยัน `meowverse_test` แยกจาก `meowverse`
- มี schema baseline ที่อนุมัติ และ apply migration ที่จำเป็น โดยเฉพาะ `accounts.address`
- seed synthetic data ที่ไม่มีข้อมูลลูกค้าจริง
- ยืนยัน credential ของ test-only Admin, User A และ User B ผ่านช่องทางปลอดภัย
- ยืนยันว่า Backend ที่จะเปิดทดสอบชี้ไป `meowverse_test` จาก live connection/process list
- อนุมัติ scope ของ read-only authenticated testing ก่อน จึงค่อยพิจารณา mutation test แยกต่างหาก

## Evidence / related files

- [Test DB preparation SQL](PHASE2_TEST_DB_PREPARATION_2026-10-29.sql)
- [Phase 2 coverage matrix](PHASE2_TEST_CASES_2026-10-29.md)
- Phase 1 [Test Cases](PLAYWRIGHT_MCP_TEST_CASES_2026-10-29.md)
- Phase 1 [Bug Report](PLAYWRIGHT_MCP_BUG_REPORT_2026-10-29.md)

