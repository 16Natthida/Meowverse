import mysql from 'mysql2/promise'

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'meowverse',
  })
  try {
    const [rows] = await pool.query(
      "SELECT cart_id, prod_id, round_id, preorder_round_id, round_price FROM cart WHERE item_type = 'preorder'",
    )
    console.log('Found', rows.length, 'preorder cart rows')
    for (const r of rows) {
      const roundId = r.preorder_round_id || r.round_id || null
      // resolve effective price
      const [priceRows] = await pool.query(
        `SELECT COALESCE(prp.round_price, p.preorder_price, p.base_price) AS effective_price
         FROM products p
         LEFT JOIN preorder_round_products prp ON prp.prod_id = p.prod_id AND prp.round_id = ?
         LEFT JOIN preorder_rounds pr ON pr.round_id = prp.round_id AND LOWER(pr.status) = 'active'
         WHERE p.prod_id = ?
         LIMIT 1`,
        [roundId, r.prod_id],
      )
      const effectivePrice = priceRows[0] ? priceRows[0].effective_price : null

      await pool.query('UPDATE cart SET preorder_round_id = ?, round_price = ? WHERE cart_id = ?', [
        roundId,
        effectivePrice,
        r.cart_id,
      ])
      console.log(
        `Updated cart_id=${r.cart_id}: preorder_round_id=${roundId}, round_price=${effectivePrice}`,
      )
    }
  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await pool.end()
  }
}

main()
