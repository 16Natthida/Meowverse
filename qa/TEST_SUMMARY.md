# Meowverse QA Test Summary

วันที่ตรวจ: 29 ตุลาคม 2569 (Asia/Bangkok)  
URL: `http://localhost:5173`  
API: `http://localhost:3001`  
Browser runner: Playwright Test 1.64.1 + Chromium  
ฐานข้อมูล: **ไม่สามารถยืนยันว่าเป็น test DB** เพราะ workspace ไม่มี `.env` และ process ไม่ได้เปิดเผย `DB_NAME`

## สรุปผลจากการรันจริง

| สถานะ | จำนวน | ขอบเขต |
|---|---:|---|
| Passed | 10 | Smoke เดิม: Login UI, validation, redirect บาง route, mobile overflow, health, unauthenticated admin API |
| Failed | 4 | `CALC-002`, `STATIC-001 /cart`, duplicate route และ token-bearing console log เป็นหลักฐานบั๊กที่รันซ้ำได้; exploratory `/cart` run แรกมี dynamic failure แต่ full run ล่าสุด redirect ผ่าน component guard |
| Blocked | 3 กลุ่ม | Admin/User authenticated E2E, order/cart mutation, payment/slip upload |
| Not Tested | ตามรายการ | การสร้าง/แก้ไข/ลบสินค้า, สร้างออเดอร์, upload/อนุมัติสลิป, ค่านำเข้า, stock intake, report data reconciliation |

## สิ่งที่ตรวจจริง

- `http://localhost:5173` ตอบ HTTP 200
- `GET http://localhost:3001/api/health` ตอบ HTTP 200 และ `{ ok: true }`
- Playwright smoke suite ผ่าน 10/10
- สำรวจ route แบบไม่ Login: หน้า Login และ route ที่มี guard ถูกทดสอบ; `/cart` ไม่ redirect และถูกบันทึกเป็น Failed
- API ที่เกี่ยวกับ payment, products, admin orders/users และ user orders ถูกยิงแบบไม่มี token เพื่อยืนยันการปฏิเสธ โดยไม่อ่านข้อมูลจริงและไม่ทำ mutation
- pure calculation ของการแบ่งค่าส่งจากจีนถูกทดสอบโดยใช้ข้อมูลจำลองใน memory เท่านั้น

## ข้อจำกัดสำคัญ

- ไม่พบ Playwright MCP server โดยตรงใน Codex config/session (`mcp_servers.playwright` ไม่มี) แต่มี Playwright package/runner ในโปรเจกต์และใช้ Chromium รันจริงได้
- ไม่พบ test account และไม่พบ `.env` ที่ยืนยัน `DB_NAME` ลงท้ายด้วย `_test`
- จึงไม่ Login จริง, ไม่สร้างออเดอร์, ไม่ส่ง/อนุมัติสลิป, ไม่แก้ stock/ค่านำเข้า และไม่แตะฐานข้อมูลด้วยคำสั่งเขียน

## เกณฑ์ก่อนเปิด E2E ที่เปลี่ยนข้อมูล

ต้องกำหนด `QA_E2E_ENABLED=1`, `QA_DB_NAME=<ชื่อที่ลงท้ายด้วย _test>`, `QA_ADMIN_*`, `QA_USER_*` และยืนยันว่า API process ใช้ DB เดียวกันก่อน โดยชุดทดสอบที่เพิ่มไว้จะไม่สร้าง order หรือชำระเงินจริง
