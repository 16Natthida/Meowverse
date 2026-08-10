import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
})

async function checkDetails() {
  const connection = await pool.getConnection()

  try {
    console.log('\n🛒 ตะกร้า (cart):')
    const [cartData] = await connection.query(`
      SELECT
        c.cart_id,
        c.user_id,
        c.prod_id,
        c.qty,
        c.item_type,
        c.flavor,
        c.round_id,
        c.round_price,
        p.prod_name,
        p.base_price
      FROM cart c
      LEFT JOIN products p ON c.prod_id = p.prod_id
      LIMIT 10
    `)
    console.log(cartData)

    console.log('\n📋 ออเดอร์:')
    const [orderData] = await connection.query(`
      SELECT
        order_id,
        user_id,
        order_type,
        total_price,
        created_at
      FROM orders
      LIMIT 10
    `)
    console.log(orderData)

    if (orderData.length > 0) {
      const orderId = orderData[0].order_id
      console.log(`\n📦 ลายละเอียดออเดอร์ #${orderId}:`)
      const [orderDetails] = await connection.query(
        `
        SELECT
          detail_id,
          order_id,
          prod_id,
          qty,
          unit_price,
          flavor,
          item_type,
          (SELECT prod_name FROM products WHERE prod_id = order_details.prod_id) as prod_name
        FROM order_details
        WHERE order_id = ?
      `,
        [orderId],
      )
      console.log(orderDetails)
    }
  } finally {
    await connection.release()
    await pool.end()
  }
}

checkDetails().catch(console.error)
