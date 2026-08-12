import mysql from 'mysql2/promise'

const db = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'MyRootPass2024',
  database: 'meowverse',
})

try {
  const [products] = await db.query(
    `SELECT prod_id, prod_name, base_price, preorder_price, ready_to_ship_enabled, preorder_enabled
     FROM products
     WHERE prod_id IN (1, 2, 3, 4, 18)
     LIMIT 10`,
  )
  console.log('Products:')
  console.table(products)

  // Check cart items for user 1
  const [cartItems] = await db.query(
    `SELECT c.cart_id, c.prod_id, c.qty, c.item_type, p.prod_name, p.base_price, p.preorder_price
     FROM cart c
     LEFT JOIN products p ON c.prod_id = p.prod_id
     WHERE c.user_id = 1`,
  )
  console.log('\nCart items for user 1:')
  console.table(cartItems)
} catch (err) {
  console.error('Error:', err.message)
} finally {
  await db.end()
}
