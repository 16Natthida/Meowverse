# Meowverse QA — Static Review Notes (ยังไม่ได้รันเว็บ)

## REVIEW-01 อาจมีการพิมพ์ Login Token ลง Browser Console

- สถานะ: **ต้องตรวจยืนยัน** (พบโค้ดที่น่ากังวล ไม่ใช่ผลจาก Dynamic Test)
- ตำแหน่ง: `src/views/LoginView.vue`
- หลักฐาน: หลัง `POST /api/login` มี `console.log('📦 Response data:', data)` ขณะที่ Backend ส่ง JSON ที่มี `token`
- ความเสี่ยง: หากบันทึก output จริง อาจเปิดเผย session token ให้ผู้ที่เข้าถึง browser console/log ได้
- ทดสอบ: Login บัญชีทดสอบแล้วตรวจ Console ว่ามี token หรือไม่ (ห้ามคัดลอกค่า token ลง Bug Report)
- แนะนำ: ไม่ log response ที่มี token, password หรือข้อมูลส่วนตัว

## REVIEW-02 เอกสารตั้งค่าฐานข้อมูลอ้างอิงไฟล์ schema ที่ไม่พบใน ZIP

- สถานะ: **ตรวจชื่อไฟล์แล้ว** (พบใน ZIP `database/payment (2).sql` และ migrations; ไม่พบ `meowverse.sql`)
- ตำแหน่ง: `docs/DB_SETUP.md`
- ผลกระทบที่เป็นไปได้: คนตั้งค่าเครื่องใหม่อาจไม่มี schema เต็มสำหรับสร้าง Test Database
- แนะนำ: เตรียม schema/seed ข้อมูลทดสอบหรืออัปเดตคู่มือให้ตรงกับไฟล์จริง

## REVIEW-03 เส้นทาง Admin ซ้ำ

- สถานะ: **ตรวจโค้ดแล้ว**; ยังไม่พิสูจน์ผลกระทบ
- ตำแหน่ง: `src/router/index.js`
- หลักฐาน: `/admin/postpones` ประกาศสองครั้ง
- แนะนำ: ตรวจว่าควรเหลือ route เดียว

## REVIEW-04 ค่านำเข้าจากหลายคอลัมน์ (กรณีต้อง Regression)

- สถานะ: **พบ data flow จากโค้ด** ยังไม่ใช่ข้อสรุปว่าบั๊ก
- `server/index.js`: GET `/api/admin/preorder-import-fee/rounds` รวม `SUM(od.Import_fee)` จาก `order_details`
- `server/order.js`: GET order detail ส่ง `orders.import_fee_total` และมี PATCH `/api/orders/:order_id/import-fee` ที่จัดสรรยอดตาม `order_details`
- ดังนั้นการรีเซ็ตเฉพาะ `orders.import_fee_total` ไม่ได้พิสูจน์ว่าหน้า Admin ค่านำเข้าต้องเป็น 0
- แนะนำ: ให้ AI ทำแผนผังว่าแต่ละหน้า/API อ่านค่าไหน; ทดสอบกับ test DB พร้อมตรวจข้อมูลก่อน-หลังโดยไม่ล้าง Production

---

## BUG-XXX Template

- Severity: Critical / High / Medium / Low
- Status: New / Confirmed / Fixed / Retest
- Environment: test DB, URL, browser, commit
- Preconditions:
- Steps to Reproduce:
  1.
  2.
  3.
- Expected Result:
- Actual Result:
- Screenshot / trace path (ไม่ใส่ token, password หรือข้อมูลส่วนตัว):
- API Request/Response (redacted):
- Suspected root cause:
- Proposed fix:
- Retest result:
