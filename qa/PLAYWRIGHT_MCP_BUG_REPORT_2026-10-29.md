# Meowverse Playwright MCP Bug Report

วันที่ทดสอบ: 2026-10-29 (Asia/Bangkok)  
Environment: `http://localhost:5173`, Playwright MCP, ไม่ใช้ Playwright Test  
Status ของรายงาน: New

## BUG-PMCP-001 — Vue Router deprecation warning ซ้ำทุกครั้งที่นำทาง

- Severity: Low / P2
- Status: New
- Area: Route Guard / Console hygiene
- Preconditions: เปิดเว็บโดยไม่มี auth session
- Steps to reproduce:
  1. เปิด `http://localhost:5173/` หรือ `/login`
  2. เปิด route ที่ต้อง login เช่น `/dashboard`, `/admin/home`, `/products/ready-to-ship`
  3. ตรวจ Browser Console ผ่าน Playwright MCP `browser_console_messages`
- Expected result: ไม่มี warning จาก application ในการนำทางตามปกติ
- Actual result: พบข้อความซ้ำ: `[Vue Router warn]: The \`next()\` callback in navigation guards is deprecated. Return the value instead of calling \`next(value)\`.`
- Frequency: เกิดซ้ำในการ route sweep; console log ที่เก็บไว้มี warning จำนวนมาก
- Impact: ไม่ทำให้หน้า Login ใช้งานไม่ได้ในรอบนี้ แต่ทำให้ Console noisy และอาจเป็น technical debt ที่จะกลายเป็นปัญหาเมื่ออัปเกรด Vue Router
- Evidence:
  - [Affected page screenshot](evidence/route-guard-dashboard-redirects-login.png)
  - [Console warning log](evidence/console-warnings-2026-10-29.txt)
  - [Network log](evidence/network-requests-2026-10-29.txt)
- Suspected root cause: navigation guard ใน `src/router/index.js` ใช้ callback `next(...)` แทนการ return route location ตามรูปแบบใหม่ของ Vue Router
- Proposed fix: refactor `router.beforeEach` ให้ return `'/login'`, `'/dashboard'` หรือ `'/admin/home'` ตามเงื่อนไข และเรียก `next()` เฉพาะกรณีที่จำเป็นตาม version ที่ใช้งาน
- Retest: รอแก้ไขแล้วตรวจ console ระหว่าง route sweep อีกครั้ง; Expected = 0 deprecation warnings

## Scope note — 401 จาก dummy login ไม่ใช่ Bug

การกรอก `qa.invalid.user` และ `NotARealPassword-2026` ทำให้ `POST /api/login` ตอบ `401 Unauthorized` และ UI แสดง `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง` ซึ่งเป็นผลลัพธ์ที่คาดหมายของ negative test ไม่ได้ใช้บัญชีจริงและไม่ถือเป็น defect ในรายงานนี้

## No additional functional bug confirmed

หน้า Login ผ่านการตรวจ desktop/mobile, empty-form validation, password visibility toggle และไม่พบ horizontal overflow. หน้าสินค้า เมนู ค้นหา และฟอร์มภายในถูก Route Guard บล็อกโดยไม่มี session จึงจัดเป็น Blocked/Not Tested ไม่สรุปเป็น defect จนกว่าจะมี test account หรือข้อกำหนดว่าหน้าสินค้าต้อง public จริง

