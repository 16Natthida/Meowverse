-- JWT: รองรับการยกเลิก token (logout / ออกจากระบบทุกอุปกรณ์ / เปลี่ยนรหัสผ่าน)
-- เซิร์ฟเวอร์สร้างให้อัตโนมัติตอนเริ่มทำงาน (ensureAuthSchema ใน server/auth.js)
-- ไฟล์นี้มีไว้สำหรับรันเองบนฐานข้อมูลที่ไม่ได้ให้สิทธิ์ ALTER กับแอป

-- เพิ่มทีละ 1 เมื่อเปลี่ยนรหัสผ่าน/ออกจากระบบทุกอุปกรณ์ → token ที่ออกก่อนหน้าใช้ไม่ได้
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- token ที่ถูก logout (เก็บไว้จนกว่าจะหมดอายุ แล้วระบบลบทิ้งเอง)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti CHAR(32) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_revoked_tokens_expires_at (expires_at)
);
