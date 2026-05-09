import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0,
})

async function main() {
  try {
    // Check existing users
    const [users] = await pool.query('SELECT user_id, username, role FROM accounts')
    console.log('Existing users:', users)

    // Insert test user if not exists
    const testUsername = 'testuser'
    const [existing] = await pool.query('SELECT user_id FROM accounts WHERE username = ?', [
      testUsername,
    ])

    if (existing.length === 0) {
      // Insert without bcrypt (plain password for testing)
      await pool.query(
        'INSERT INTO accounts (username, password, role, full_name) VALUES (?, ?, ?, ?)',
        [testUsername, 'test123', 'user', 'Test User'],
      )
      console.log(`✅ Created test user: ${testUsername} / test123`)
    } else {
      console.log(`✅ Test user already exists`)
    }

    // Check cart table columns
    const [cartCols] = await pool.query('SHOW COLUMNS FROM cart')
    console.log('Cart table columns:', cartCols.map((c) => c.Field))

    // Check preorder_round_products table columns
    const [prpCols] = await pool.query('SHOW COLUMNS FROM preorder_round_products')
    console.log('Preorder round products columns:', prpCols.map((c) => c.Field))

    await pool.end()
    console.log('✅ Done')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
