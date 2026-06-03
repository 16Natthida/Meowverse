import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
})

async function checkCart() {
  const connection = await pool.getConnection()

  try {
    // Get all users
    const [users] = await connection.query(`SELECT user_id, username, email FROM users LIMIT 5`)
    console.log('\n👥 ผู้ใช้:')
    console.log(users)

    if (users.length > 0) {
      const userId = users[0].user_id
      console.log(`\n🛒 ตะกร้าของ user_id = ${userId}:`)

      // Get cart items
      const [cart] = await connection.query(
        `
        SELECT
          c.cart_id,
          c.prod_id,
          c.qty,
          c.item_type,
          c.flavor,
          p.prod_name,
          p.base_price
        FROM cart c
        LEFT JOIN products p ON c.prod_id = p.prod_id
        WHERE c.user_id = ?
      `,
        [userId],
      )

      console.log(cart)

      // Check if there are orders
      console.log(`\n📋 ออเดอร์:`)
      const [orders] = await connection.query(`
        SELECT
          o.order_id,
          o.user_id,
          o.order_type,
          o.total_price,
          COUNT(od.detail_id) as item_count
        FROM orders o
        LEFT JOIN order_details od ON o.order_id = od.order_id
        GROUP BY o.order_id
        LIMIT 5
      `)

      console.log(orders)

      if (orders.length > 0) {
        const orderId = orders[0].order_id
        console.log(`\n📦 ลายละเอียดออเดอร์ #${orderId}:`)

        const [orderDetails] = await connection.query(
          `
          SELECT
            od.detail_id,
            od.prod_id,
            od.qty,
            od.unit_price,
            od.flavor,
            od.item_type,
            p.prod_name,
            p.base_price
          FROM order_details od
          LEFT JOIN products p ON od.prod_id = p.prod_id
          WHERE od.order_id = ?
        `,
          [orderId],
        )

        console.log(orderDetails)
      }
    }
  } finally {
    await connection.release()
    await pool.end()
  }
}

checkCart().catch(console.error)
