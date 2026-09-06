import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'meowverse',
  waitForConnections: true,
  connectionLimit: 5,
})

async function main() {
  const connection = await pool.getConnection()
  try {
    const [rows] = await connection.query(
      "SELECT order_id, import_fee_total, status FROM orders WHERE Order_type = 'Preorder' AND status = 'Ready_to_Ship'",
    )

    if (!rows || rows.length === 0) {
      console.log('No matching orders found.')
      return
    }

    console.log(`Found ${rows.length} preorder orders in Ready_to_Ship status.`)
    for (const r of rows) {
      const orderId = r.order_id
      const importFee = Number(r.import_fee_total || 0)
      if (importFee > 0) {
        const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
        await connection.query(
          'UPDATE orders SET status = ?, deadline = ? WHERE order_id = ?',
          ['Pending_import_fee', deadline, orderId],
        )
        console.log(`order ${orderId} -> Pending_import_fee (import_fee_total=${importFee})`)
      } else {
        await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [
          'Paid',
          orderId,
        ])
        console.log(`order ${orderId} -> Paid (no import fee)`)
      }
    }
  } catch (err) {
    console.error('Error:', err)
  } finally {
    connection.release()
    await pool.end()
  }
}

main()
