import mysql from 'mysql2/promise'

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'meowverse',
    waitForConnections: true,
  })

  try {
    const prodId = 17
    const roundId = 1

    const [prpRows] = await pool.query(
      'SELECT link_id, prod_id, round_id, quantity_available, round_price FROM preorder_round_products WHERE prod_id = ? AND round_id = ? LIMIT 1',
      [prodId, roundId],
    )

    console.log('PRP rows:', prpRows)

    const [reservedRows] = await pool.query(
      'SELECT COALESCE(SUM(qty),0) AS reserved FROM cart WHERE prod_id = ? AND item_type = ? AND round_id = ?',
      [prodId, 'preorder', roundId],
    )

    console.log('Reserved in cart for prod:', reservedRows[0])

    const [cartRows] = await pool.query(
      'SELECT cart_id, flavor, qty, round_id FROM cart WHERE prod_id = ? AND item_type = ?',
      [prodId, 'preorder'],
    )
    console.log('Cart rows (preorder, this product):', cartRows)

    const [productRows] = await pool.query(
      'SELECT prod_id, flavors, flavor_stock FROM products WHERE prod_id = ?',
      [prodId],
    )
    console.log('Product row:', productRows[0])
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e)
  } finally {
    await pool.end()
  }
}

main()
