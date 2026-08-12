import mysql from 'mysql2/promise'

async function check() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'meowverse',
  })

  try {
    const [prp] = await pool.query(
      'SELECT prod_id, round_id, round_price FROM preorder_round_products WHERE prod_id IN (14,15,16,17,18,19)',
    )
    console.log('Preorder round products:')
    console.table(prp)

    const [rounds] = await pool.query(
      'SELECT round_id, status FROM preorder_rounds WHERE LOWER(status) = ?',
      ['active'],
    )
    console.log('\nActive rounds:')
    console.table(rounds)
  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await pool.end()
  }
}

check()
