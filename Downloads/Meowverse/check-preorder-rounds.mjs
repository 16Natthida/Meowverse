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
      'SELECT * FROM preorder_round_products WHERE prod_id IN (14,16,17) LIMIT 10',
    )
    console.log('preorder_round_products:')
    console.table(prp)

    const [rounds] = await pool.query(
      'SELECT * FROM preorder_rounds WHERE LOWER(status) = "active" LIMIT 5',
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
