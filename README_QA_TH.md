# Meowverse AI QA Starter (สำหรับไฟล์ Web-Meowverse1 (2).zip)

ชุดนี้เป็น **ไฟล์เพิ่มในโปรเจกต์เดิม** เท่านั้น ไม่แก้โค้ดหน้าร้าน ไม่แก้ DB และไม่มีรหัสผ่าน

## ก่อนเริ่ม

- ใช้ Node.js 22.12+ หรือ Node.js รุ่นอื่นตาม `package.json` (Node 20.19+ รองรับโปรเจกต์ แต่บางเครื่องมือทดสอบรุ่นใหม่อาจกำหนดรุ่นสูงกว่า)
- แตกไฟล์ ZIP ของเว็บลงเครื่อง และเปิดโฟลเดอร์ `Web-Meowverse1` ใน VS Code
- เพื่อความปลอดภัย ควรสร้าง **ฐานข้อมูลทดสอบแยก** `meowverse_test` โดยมีโครงสร้างและข้อมูลจำลองที่จำเป็น ก่อนลองฟังก์ชันที่เปลี่ยนแปลงข้อมูล
- ติดตั้ง/ตรวจ MySQL หรือ MariaDB, คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่า `DB_NAME=meowverse_test` และ `JWT_SECRET` (อย่าใส่รหัสผ่านจริงลงรายงาน)
- ต้องเตรียม schema/test seed ให้ตรงกับโค้ดก่อนรัน API; ZIP ที่ได้รับไม่มี `meowverse.sql` ที่เอกสาร DB_SETUP.md อ้างถึง จึงอาจต้องใช้ schema backup ที่มีอยู่แยกต่างหาก

## 1) คัดลอกไฟล์

คัดลอก `playwright.config.qa.mjs`, `qa-tests/` และ `qa/` จากชุดนี้ไปยังโฟลเดอร์หลัก `Web-Meowverse1/`

## 2) ติดตั้ง Playwright

ที่ VS Code Terminal (PowerShell) เปิดในโฟลเดอร์โปรเจกต์:

```powershell
npm install
npm install -D @playwright/test
npx playwright install chromium
```

## 3) เปิดเว็บ + API

หากใช้ .env ที่ชี้ฐานข้อมูลทดสอบและ schema พร้อมแล้ว:

```powershell
npm run dev:full
```

จากเอกสารในโปรเจกต์: หน้าเว็บ `http://localhost:5173`, backend `http://localhost:3001`, health `http://localhost:3001/api/health`

## 4) รันทดสอบ (เปิด Terminal อีกอัน)

```powershell
npx playwright test --config=playwright.config.qa.mjs
npx playwright show-report qa-report
```

ถ้ารันแล้วเจอ `ERR_CONNECTION_REFUSED` ให้เช็ก `npm run dev:full`, .env และฐานข้อมูลก่อน ไม่ถือเป็นบั๊กของหน้าต่าง ๆ โดยทันที

## 5) เชื่อม AI กับ Browser

ใน Codex ของ VS Code เปิด MCP servers เพิ่ม server `playwright` แบบ STDIO:

- Command: `npx`
- Arguments: `@playwright/mcp@latest` (บาง Windows ใช้ `-y`, `@playwright/mcp@latest`)

หรือในไฟล์ `%USERPROFILE%\.codex\config.toml` เพิ่ม:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

จากนั้น Restart Codex แล้วใช้ Prompt ในไฟล์ `qa/PROMPT_FOR_CODEX.md`

## ขอบเขตของชุด Smoke Test

`qa-tests/smoke.spec.js` ใช้เฉพาะ GET, การเปิด URL และคลิกฟอร์ม login ว่าง — **ไม่ได้ส่งการชำระเงิน สร้างออเดอร์ เปลี่ยนข้อมูล หรือ Login จริง**

Test Cases สำหรับส่วนที่ใช้ Admin/User/Test data อยู่ใน `qa/TEST_CASES.md` แยกไว้เพื่อให้ AI สร้างชุด E2E เพิ่มเมื่อมี test account และ test database พร้อม

## หมายเหตุสำคัญ

- ห้ามทดสอบ workflow เขียนข้อมูลบนฐานข้อมูล Production
- ห้ามให้ AI ล้างข้อมูล/ยิง API ลบข้อมูล/ชำระเงินจริงเด็ดขาด
- Playwright MCP ใช้สำรวจเว็บด้วย AI; Playwright Test ใช้รันเทสซ้ำอัตโนมัติ (เป็นคนละเครื่องมือ)
- ไฟล์รายงานผลจะสร้างหลังจากรันเทสบนเครื่อง ไม่ใช่การยืนยันว่าระบบผ่านการทดสอบแล้ว
