# คัดลอกข้อความนี้ไปวางใน Codex ของ VS Code

ตรวจสอบโปรเจกต์ Meowverse ที่เปิดอยู่ใน workspace นี้ด้วยบทบาท Senior QA + Test Automation Engineer

1. สำรวจ route `src/router/index.js`, หน้า `src/views`, API ใน `server/index.js`, `server/order.js`, `server/cart.js`, `server/shipping.js`, auth และ schema migrations
2. อ่าน `qa/TEST_CASES.md` แล้วขยายเป็น Test Cases ทุกหน้า พร้อม Positive/Negative/Boundary Cases และ map ไปยังไฟล์ต้นทาง
3. เริ่มจาก **Static Analysis เท่านั้น**: วิเคราะห์การคำนวณรสชาติ/ราคา, ตะกร้า, สถานะออเดอร์, อนุมัติสลิป, ค่านำเข้า, สิทธิ์ผู้ใช้, Error Handling, Validation; สรุป bug candidates โดยไม่กล่าวหาว่าทดสอบผ่านแล้ว
4. เมื่อฉันยืนยันว่า `DB_NAME` ชี้ test DB และ `npm run dev:full` รันอยู่ จึงค่อยใช้ Playwright MCP เปิด `http://localhost:5173` สำรวจทั้ง Admin/User (ถ้ามี test account) และ API
5. ช่วงแรกใช้ GET/อ่านข้อมูลและคลิกที่ไม่ส่งข้อมูลเท่านั้น หากจำเป็นต้อง POST/PATCH/PUT/DELETE ให้ขออนุญาตก่อนทุกครั้ง และทำเฉพาะใน test DB
6. สร้าง Automated Playwright Test ต่อจาก `qa-tests/smoke.spec.js` โดยให้รันซ้ำได้ หลีกเลี่ยงการขึ้นกับข้อมูลจริง
7. รัน `npx playwright test --config=playwright.config.qa.mjs` เมื่อเซิร์ฟเวอร์พร้อม และอ่านผลจากรายงาน HTML/JSON/trace
8. ให้ความสำคัญสูงสุดกับความตรงกันของ `order_details.Import_fee` และ `orders.import_fee_total`, ยอดค่าส่งจีน, ค่าขนส่ง และยอดชำระฝั่งลูกค้า/แอดมิน
9. สร้างสรุป `qa/TEST_SUMMARY.md` (Passed/Failed/Blocked/Not Tested), `qa/BUG_REPORT.md` พร้อมเส้นทางไฟล์/บรรทัด, Expected/Actual, Steps to Reproduce, severity, และหลักฐาน
10. ห้ามแก้ source code, schema หรือข้อมูลจริง ห้าม log password/token ห้าม push ขึ้น git และห้ามบอกว่า Pass ถ้ายังไม่ได้รันทดสอบจริง

ถามฉันก่อนทุกการแก้ไขโค้ดและทุกขั้นตอนที่ทำให้ข้อมูลเปลี่ยน
