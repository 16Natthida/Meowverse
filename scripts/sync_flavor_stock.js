#!/usr/bin/env node
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'meowverse',
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
})

function parseFlavorStock(value) {
  if (!value) return {}
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch (e) {
    return {}
  }
}

async function main() {
  const conn = await pool.getConnection()
  const changes = []
  try {
    const [rows] = await conn.query('SELECT prod_id, flavor_stock, stock_qty FROM products')

    for (const row of rows) {
      const map = parseFlavorStock(row.flavor_stock)
      const sum = Object.values(map || {}).reduce((s, v) => s + (Number(v) || 0), 0)
      const current = Number(row.stock_qty) || 0
      if (sum !== current) {
        await conn.beginTransaction()
        await conn.query('UPDATE products SET stock_qty = ? WHERE prod_id = ?', [sum, row.prod_id])
        await conn.commit()
        changes.push({ prod_id: row.prod_id, from: current, to: sum })
      }
    }

    console.log('Sync complete. Updated products:')
    console.log(JSON.stringify(changes, null, 2))
  } catch (err) {
    console.error('Error during sync:', err.message || err)
    try {
      await conn.rollback()
    } catch (_) {}
    process.exitCode = 2
  } finally {
    conn.release()
    await pool.end()
  }
}

main()
