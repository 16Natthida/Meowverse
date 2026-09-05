import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
})

async function checkAllData() {
  const connection = await pool.getConnection()

  try {
    // Check all rounds
    const [rounds] = await connection.query(`SELECT * FROM preorder_rounds`)
    console.log('\n🔔 รอบพรีออเดอร์ทั้งหมด:')
    console.log(rounds)

    // Check products count
    const [productsCount] = await connection.query(`SELECT COUNT(*) as count FROM products`)
    console.log(`\n📦 จำนวนสินค้า: ${productsCount[0].count}`)

    // Check preorder_round_products
    const [preorderProducts] = await connection.query(
      `SELECT * FROM preorder_round_products LIMIT 10`,
    )
    console.log(`\n🛍️ ตัวอย่างราคาพรีออเดอร์ (ตัวแรก 10 รายการ):`)
    console.log(preorderProducts)

    // Compare prices
    const [comparison] = await connection.query(`
      SELECT
        p.prod_id,
        p.prod_name,
        p.base_price,
        pr.round_price,
        pr.round_id,
        r.round_name,
        r.status
      FROM products p
      LEFT JOIN preorder_round_products pr ON p.prod_id = pr.prod_id
      LEFT JOIN preorder_rounds r ON pr.round_id = r.round_id
      WHERE pr.round_id IS NOT NULL
      ORDER BY p.prod_id
      LIMIT 20
    `)

    console.log(`\n💰 เปรียบเทียบราคา:`)
    console.log(comparison)
  } finally {
    await connection.release()
    await pool.end()
  }
}

checkAllData().catch(console.error)
