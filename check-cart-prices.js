const mysql = require('mysql2/promise')

async function check() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'meowverse',
  })

  try {
    const [prods] = await pool.query(
      'SELECT prod_id, prod_name, base_price, preorder_price FROM products WHERE prod_id IN (14,16,17)',
    )
    console.log('Products 14,16,17:')
    console.table(prods)

    const [cartWithPrice] = await pool.query(`
      SELECT c.cart_id, c.prod_id, p.prod_name, p.base_price, p.preorder_price, c.item_type
      FROM cart c
      LEFT JOIN products p ON c.prod_id = p.prod_id
      WHERE c.user_id = 9
    `)
    console.log('\nCart (user 9) with product prices:')
    console.table(cartWithPrice)
  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await pool.end()
  }
}

check()
