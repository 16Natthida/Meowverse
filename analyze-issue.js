import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
})

async function analyzeIssue() {
  const connection = await pool.getConnection()

  try {
    console.log('\n💰 วิเคราะห์ปัญหาราคา:\n')

    // Get all products
    const [products] = await connection.query(`SELECT prod_id, prod_name, base_price FROM products`)
    console.log('📦 สินค้าทั้งหมด:')
    console.table(products)

    // Check cart with preorder items
    console.log('\n🛒 ตะกร้า (แสดง item_type):')
    const [cart] = await connection.query(`
      SELECT
        cart_id,
        prod_id,
        qty,
        item_type,
        round_price,
        p.prod_name,
        p.base_price
      FROM cart c
      LEFT JOIN products p ON c.prod_id = p.prod_id
      ORDER BY prod_id
    `)
    console.table(cart)

    // Check preorder items in preorder_items or pre_items table
    console.log('\n⏳ ตรวจสอบตาราง pre_items (พรีออเดอร์):')
    const [preItems] = await connection.query(`
      SELECT * FROM pre_items LIMIT 5
    `)
    console.table(preItems)

    // Check products_preorder
    console.log('\n⏳ ตรวจสอบตาราง products_preorder:')
    const [productsPreorder] = await connection.query(`
      SELECT * FROM products_preorder LIMIT 5
    `)
    console.table(productsPreorder)

    // Check preorder_items
    console.log('\n⏳ ตรวจสอบตาราง preorder_items:')
    const [preorderItems] = await connection.query(`
      SELECT * FROM preorder_items LIMIT 5
    `)
    console.table(preorderItems)
  } finally {
    await connection.release()
    await pool.end()
  }
}

analyzeIssue().catch(console.error)
