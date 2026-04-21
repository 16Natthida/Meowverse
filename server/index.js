import express from 'express'
import cors from 'cors'
import mysql from 'mysql2'
import bcrypt from 'bcryptjs'

const app = express()
app.use(cors())
app.use(express.json())

// 1. ตั้งค่าการเชื่อมต่อ Database
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'meowverse',
})

// 2. ฟังก์ชันสำหรับเริ่มรัน Server
function startServer() {
  app.listen(3000, () => {
    console.log('---------------------------------')
    console.log('Server running on http://localhost:3000')
    console.log('---------------------------------')
  })
}

// 3. เชื่อมต่อ MySQL และตรวจสอบความพร้อม
db.connect((err) => {
  if (err) {
    console.error('MySQL connect error:', err)
    // eslint-disable-next-line no-undef
    process.exit(1)
  }
  console.log('MySQL connected')

  // ตรวจสอบว่ามีข้อมูลในตาราง accounts หรือไม่
  db.query('SELECT COUNT(*) AS count FROM accounts', (countErr, _rows) => {
    if (countErr) {
      // ถ้า Error ตรงนี้ แสดงว่าอาจจะยังไม่ได้สร้างตารางใน phpMyAdmin
      console.error('Table "accounts" not found! Please create it in phpMyAdmin.')
    } else {
      console.log('Database Table: accounts is ready.')
      startServer()
    }
  })
})

// 4. API Login (แก้ไขให้ตรงกับชื่อ user_id)
app.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
    })
  }

  // ดึง password hash จากฐานข้อมูลมาก่อน แล้วค่อย compare ด้วย bcrypt
  const sql =
    'SELECT user_id, username, role, full_name, password FROM accounts WHERE username = ? LIMIT 1'

  db.query(sql, [username], async (err, result) => {
    if (err) {
      console.error('Login error:', err)
      return res.status(500).json({ success: false, error: 'Database error' })
    }

    if (result.length === 0) {
      // Login ไม่สำเร็จ
      return res.status(401).json({
        success: false,
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      })
    }

    const account = result[0]
    const storedPassword = String(account.password || '')
    const isHashedPassword = /^\$2[aby]\$/.test(storedPassword)

    const isValidPassword = isHashedPassword
      ? await bcrypt.compare(password, storedPassword)
      : storedPassword === password

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      })
    }

    // Login สำเร็จ
    console.log(`User logged in: ${username}`)
    return res.json({
      success: true,
      user: {
        user_id: account.user_id,
        username: account.username,
        role: account.role,
        full_name: account.full_name,
      },
    })
  })
})

// 5. API สำหรับสมัครสมาชิก (แถมให้เผื่อใช้งานครับ)
app.post('/register', async (req, res) => {
  const { username, password, full_name } = req.body

  if (!username || !password || !full_name) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' })
  }

  const sql = 'INSERT INTO accounts (username, password, full_name, role) VALUES (?, ?, ?, "User")'

  try {
    const hashedPassword = await bcrypt.hash(String(password), 10)

    db.query(sql, [username, hashedPassword, full_name], (err, _result) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' })
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ success: false, error: 'ไม่สามารถสมัครสมาชิกได้' })
  }
})
