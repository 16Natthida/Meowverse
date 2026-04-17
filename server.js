import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
const port = 3000;
const JWT_SECRET = 'your_secret_key'; // เปลี่ยนเป็น key ที่ปลอดภัย

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware สำหรับตรวจสอบ token
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware สำหรับตรวจสอบ admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // เปลี่ยนเป็น username ของคุณถ้าต่างกัน
  password: '', // ใส่รหัสผ่านถ้ามี
  database: 'meowverse' // เปลี่ยนเป็นชื่อฐานข้อมูลของคุณ
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS accounts (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') DEFAULT 'user',
      full_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(createTableSql, async (tableErr) => {
    if (tableErr) {
      console.error('Error creating accounts table:', tableErr);
      return;
    }

    db.query("SELECT * FROM accounts WHERE username = 'admin' LIMIT 1", async (adminErr, adminResults) => {
      if (adminErr) {
        console.error('Error checking admin account:', adminErr);
        return;
      }

      const defaultPassword = 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      if (adminResults.length === 0) {
        db.query(
          'INSERT INTO accounts (username, password, role, full_name) VALUES (?, ?, ?, ?)',
          ['admin', hashedPassword, 'admin', 'Administrator'],
          (insertErr) => {
            if (insertErr) {
              if (insertErr.code !== 'ER_DUP_ENTRY') {
                console.error('Failed to create default admin:', insertErr);
              }
              return;
            }
            console.log('Default admin created: admin / admin123');
          }
        );
        return;
      }

      const admin = adminResults[0];
      let passwordMatches = false;
      try {
        passwordMatches = await bcrypt.compare(defaultPassword, admin.password);
      } catch (compareErr) {
        passwordMatches = false;
      }

      if (!passwordMatches) {
        db.query(
          'UPDATE accounts SET password = ? WHERE user_id = ?',
          [hashedPassword, admin.user_id],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to reset admin password:', updateErr);
              return;
            }
            console.log('Admin password reset to: admin / admin123');
          }
        );
      } else {
        console.log('Admin password already set to admin123');
      }
    });
  });
});

// Route สำหรับสร้างตาราง accounts (รันครั้งเดียว)
app.post('/api/setup', (req, res) => {
  const sql = `
    CREATE TABLE IF NOT EXISTS accounts (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') DEFAULT 'user',
      full_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  db.query(sql, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Table accounts created successfully' });
  });
});

// Route สำหรับ login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.query('SELECT * FROM accounts WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = results[0];
    let isValidPassword = false;

    try {
      isValidPassword = await bcrypt.compare(password, user.password);
    } catch (err) {
      isValidPassword = false;
    }

    if (!isValidPassword && user.password === password) {
      // ถ้า password ยังเก็บเป็น plain text ให้ migrate เป็น hash
      isValidPassword = true;
      const newHash = await bcrypt.hash(password, 10);
      db.query('UPDATE accounts SET password = ? WHERE user_id = ?', [newHash, user.user_id], (updateErr) => {
        if (updateErr) console.error('Failed to migrate password hash:', updateErr.message);
      });
    }

    if (!isValidPassword) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = jwt.sign({ user_id: user.user_id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.user_id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
      },
    });
  });
});

// Route สำหรับดึงสรุปยอดขายและสถานะคำสั่งซื้อ (สำหรับ admin)
app.get('/api/admin/orders-summary', authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT
      COUNT(*) AS totalOrders,
      COALESCE(SUM(o.total_amount), 0) AS totalRevenue,
      SUM(CASE WHEN o.status = 'Pending' THEN 1 ELSE 0 END) AS pendingOrders,
      SUM(CASE WHEN o.status = 'Paid' THEN 1 ELSE 0 END) AS paidOrders,
      SUM(CASE WHEN o.Order_type = 'Preorder' THEN 1 ELSE 0 END) AS preorderOrders,
      COALESCE(SUM(od.qty), 0) AS totalItems
    FROM orders o
    LEFT JOIN order_details od ON od.order_id = o.order_id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const summary = results[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      paidOrders: 0,
      preorderOrders: 0,
      totalItems: 0,
    };
    summary.totalRevenue = parseFloat(summary.totalRevenue) || 0;
    summary.totalOrders = Number(summary.totalOrders) || 0;
    summary.pendingOrders = Number(summary.pendingOrders) || 0;
    summary.paidOrders = Number(summary.paidOrders) || 0;
    summary.preorderOrders = Number(summary.preorderOrders) || 0;
    summary.totalItems = Number(summary.totalItems) || 0;
    res.json(summary);
  });
});

app.get('/api/admin/order-list', authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT
      o.order_id,
      o.user_id,
      o.total_amount,
      o.status,
      o.Order_type AS order_type,
      o.Order_date AS order_date,
      COALESCE(SUM(od.qty), 0) AS items
    FROM orders o
    LEFT JOIN order_details od ON od.order_id = o.order_id
    GROUP BY o.order_id
    ORDER BY o.Order_date DESC
    LIMIT 50
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const orders = results.map((order) => ({
      ...order,
      total_amount: parseFloat(order.total_amount) || 0,
      items: Number(order.items) || 0,
    }));
    res.json(orders);
  });
});

// Route สำหรับเพิ่ม user/admin (ต้องการ admin role)
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role, full_name } = req.body;
  if (!username || !password || !full_name) return res.status(400).json({ error: 'Username, password, and full_name required' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const hashedPassword = await bcrypt.hash(password, 10);
  db.query('INSERT INTO accounts (username, password, role, full_name) VALUES (?, ?, ?, ?)', [username, hashedPassword, role, full_name], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User added successfully' });
  });
});

// Route สำหรับดึงรายชื่อ users (สำหรับ admin)
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.query('SELECT user_id, username, role, full_name, created_at FROM accounts', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});
app.get('/api/test', (req, res) => {
  db.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: 'MySQL connection successful', result: results[0].result });
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});