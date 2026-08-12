import mysql from 'mysql2/promise'

async function fix() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'meowverse',
  })

  try {
    // Update cart items to set preorder_round_id = round_id where item_type = 'preorder'
    const [result] = await pool.query(
      'UPDATE cart SET preorder_round_id = round_id WHERE item_type = ? AND preorder_round_id IS NULL',
      ['preorder'],
    )
    console.log('✓ Updated', result.changedRows, 'cart items with preorder_round_id')

    // Check cart now
    const [cart] = await pool.query(
      'SELECT cart_id, prod_id, round_id, preorder_round_id, round_price FROM cart WHERE user_id = 9 LIMIT 4',
    )
    console.log('\nCart for user 9 after update:')
    console.table(cart)
  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await pool.end()
  }
}

fix()
