# Bug Report จากการตรวจจริง

## BUG-001: route `/cart` ไม่มี router-level auth guard

- Severity: Low/Medium
- Status: Confirmed by static review; dynamic result is timing-sensitive
- Environment: localhost, Playwright Chromium 1.64.1, 29 ต.ค. 2569
- Preconditions: ไม่มี auth session
- Steps to reproduce:
  1. เปิด `http://localhost:5173/cart`
  2. ตรวจ URL หลังหน้าโหลด
- Expected: redirect ไป `/login` เหมือน route ของ user อื่น
- Actual: exploratory run แรกพบ URL ค้างที่ `/cart` และสร้าง `qa/screenshots/unauth-cart.png`; full run ล่าสุด redirect ได้จาก guard ภายใน `CartPage.vue:102` แต่ router เองยังเปิด route นี้ก่อน component guard ทำงาน
- Evidence: `qa-tests/static-review.spec.js` (`STATIC-001`) fail อย่างสม่ำเสมอ; `qa-tests/surface.spec.js` (`SURFACE-002`) ใช้ตรวจ dynamic behavior
- Root cause จาก Source Code: route `{ path: '/cart', component: ... }` ใน `src/router/index.js:128` ไม่มี `meta.requiresAuth` แม้ `CartPage.vue` จะมี component-level fallback
- Recommended fix: เพิ่ม `meta: { requiresAuth: true, roles: ['user'] }` และคง component guard ไว้เป็น defense-in-depth

## BUG-002: ค่าส่งจากจีนรวมแล้วขาด 0.01 จากการปัดเศษรายรายการ

- Severity: Medium/High (กระทบยอดเงิน)
- Status: Confirmed by pure-function test
- Environment: Node.js 22.13.1, Playwright test runner, ไม่มี DB write
- Preconditions: ค่าส่งรวม 100.00, quantity รวม 3, แยกเป็น 3 order lines
- Steps to reproduce:
  1. เรียก `calculateChinaShippingBreakdown()` จาก `server/chinaShipping.js`
  2. ส่ง 3 รายการ `qty=1`, `china_shipping_fee_thb=100`, round เดียวกัน
  3. ให้ runner คืน committed quantity = 3
- Expected: `breakdown.total === 100.00`
- Actual: `itemFees = [33.33, 33.33, 33.33]`, `total = 99.99`
- Evidence: `qa-tests/calculation.spec.js` (`CALC-002`); รันจริงแล้ว Failed
- Root cause จาก Source Code: `server/chinaShipping.js` ปัดเศษแต่ละ item ก่อน sum จึงมี rounding loss
- Recommended fix: allocate remainder ให้ line สุดท้าย หรือคำนวณยอดรวมจาก unrounded allocation แล้วปัดครั้งเดียว โดยต้องมี regression cases หลาย line

## REVIEW-003: Login log response ที่อาจมี JWT token

- Severity: Medium (ข้อมูล session อาจรั่วใน browser console)
- Status: Confirmed by static review; dynamic successful login ยัง Blocked เพราะไม่มี test account
- Evidence: `src/views/LoginView.vue:152` มี `console.log('📦 Response data:', data)` หลัง `/api/login` ซึ่ง response มี `data.token`
- Recommended fix: ลบ log นี้ หรือ log เฉพาะ status/field ที่ redacted

## REVIEW-004: route `/admin/postpones` ถูกประกาศซ้ำ

- Severity: Low
- Status: Confirmed by static review
- Evidence: `src/router/index.js:246` และ `src/router/index.js:264`
- Impact: route name/component ซ้ำทำให้ maintenance และ route resolution คลุมเครือ แม้ปลายทางปัจจุบันเหมือนกัน
- Recommended fix: เหลือ declaration เดียว

## สิ่งที่ยังไม่ยืนยัน

- Admin/User login, product CRUD, cart quantity, preorder/ready-to-ship, order totals, payment/slip, import fee, stock intake, reports และ ownership ระหว่าง User A/B ยังต้องมี test account + test DB จึงจะสรุป Passed/Failed ได้

## BUG-005: ReadyPayment compares normalized `Slip_submitted` with the wrong literal

- Severity: Medium
- Status: Confirmed by focused static test; first-payment upload remains blocked from dynamic verification because no approved test account/order/slip was provided
- Evidence: `src/views/User/ReadyPayment.vue:308-319` and `src/views/User/ReadyPayment.vue:635-646`
- Root cause: status is normalized with lower-case and `_`/whitespace converted to spaces, but the arrays use `Slip_submitted` instead of `slip submitted`
- Impact: after a slip is submitted, shipping fields and the payment action may not be locked consistently; cancellation eligibility may also be wrong
- Focused test: `qa-tests/ready-payment-review.spec.js` (`READY-PAY-002`)
