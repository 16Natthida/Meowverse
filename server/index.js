import express from 'express'
import cors from 'cors'
import mysql from 'mysql2'

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
    console.log('---------------------------------');
    console.log('Server running on http://localhost:3000');
    console.log('---------------------------------');
  })
}

// 3. เชื่อมต่อ MySQL และตรวจสอบความพร้อม
db.connect(err => {
  if (err) {
    console.error('MySQL connect error:', err);
    process.exit(1);
  }
  console.log('MySQL connected');

  // ตรวจสอบว่ามีข้อมูลในตาราง accounts หรือไม่
  db.query('SELECT COUNT(*) AS count FROM accounts', (countErr, rows) => {
    if (countErr) {
      // ถ้า Error ตรงนี้ แสดงว่าอาจจะยังไม่ได้สร้างตารางใน phpMyAdmin
      console.error('Table "accounts" not found! Please create it in phpMyAdmin.');
    } else {
      console.log('Database Table: accounts is ready.');
      startServer();
    }
  });
})

// 4. API Login (แก้ไขให้ตรงกับชื่อ user_id)
app.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' 
    })
  }

  // ใช้ user_id, role, full_name ตามโครงสร้าง SQL ของคุณ
  const sql = 'SELECT user_id, username, role, full_name FROM accounts WHERE username = ? AND password = ? LIMIT 1'
  
  db.query(sql, [username, password], (err, result) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (result.length > 0) {
      // Login สำเร็จ
      console.log(`User logged in: ${username}`);
      return res.json({ 
        success: true, 
        user: result[0] // ส่งข้อมูล user_id, username, role, full_name กลับไป
      })
    } else {
      // Login ไม่สำเร็จ
      res.status(401).json({ 
        success: false, 
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' 
      })
    }
  })
})

// 5. API สำหรับสมัครสมาชิก (แถมให้เผื่อใช้งานครับ)
app.post('/register', (req, res) => {
  const { username, password, full_name } = req.body;
  const sql = 'INSERT INTO accounts (username, password, full_name, role) VALUES (?, ?, ?, "User")';
  
  db.query(sql, [username, password, full_name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' });
  });
});