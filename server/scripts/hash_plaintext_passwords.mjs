// แปลงรหัสผ่านที่ยังเก็บแบบไม่เข้ารหัส (plain text) ในตาราง accounts ให้เป็น bcrypt
//
// วิธีใช้ (รันจากโฟลเดอร์โปรเจกต์):
//   node server/scripts/hash_plaintext_passwords.mjs          ← ดูอย่างเดียวว่ามีกี่บัญชี (ไม่แก้ข้อมูล)
//   node server/scripts/hash_plaintext_passwords.mjs --apply  ← แปลงจริง
//
// ผู้ใช้ยัง login ด้วยรหัสผ่านเดิมได้ตามปกติ ควร backup ฐานข้อมูลก่อนรัน --apply

import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const apply = process.argv.includes('--apply')
const BCRYPT_PATTERN = /^\$2[aby]\$/

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'meowverse',
  connectionLimit: 2,
})

try {
  const [rows] = await pool.query('SELECT user_id, username, password FROM accounts')
  const plaintextAccounts = rows.filter(
    (row) => row.password && !BCRYPT_PATTERN.test(String(row.password)),
  )

  console.log(`พบบัญชีทั้งหมด ${rows.length} บัญชี, ยังไม่เข้ารหัส ${plaintextAccounts.length} บัญชี`)
  for (const row of plaintextAccounts) {
    console.log(`  - #${row.user_id} ${row.username}`)
  }

  if (!apply) {
    console.log('\n(ยังไม่ได้แก้ข้อมูล) รันซ้ำพร้อม --apply เพื่อแปลงจริง')
  } else {
    for (const row of plaintextAccounts) {
      const hash = await bcrypt.hash(String(row.password), 10)
      await pool.query('UPDATE accounts SET password = ? WHERE user_id = ? AND password = ?', [
        hash,
        row.user_id,
        row.password,
      ])
    }
    console.log(`\nแปลงเรียบร้อย ${plaintextAccounts.length} บัญชี`)
  }
} catch (error) {
  console.error('เกิดข้อผิดพลาด:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
