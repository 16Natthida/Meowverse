import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'meowverse',
})

async function checkPrices() {
  const connection = await pool.getConnection()

  try {
    console.log('\n📊 ตรวจสอบราคาพรีออเดอร์กับพร้อมส่ง:\n')

    // Get active round
    const [activeRound] = await connection.query(
      `SELECT round_id, round_name FROM preorder_rounds WHERE status='active' LIMIT 1`,
    )

    if (activeRound.length === 0) {
      console.log('❌ ไม่มีรอบพรีออเดอร์ที่เปิดใช้งาน')
      return
    }

    const roundId = activeRound[0].round_id
    console.log(`✅ รอบพรีออเดอร์ที่เปิดใช้งาน: #${roundId} - ${activeRound[0].round_name}\n`)

    // Get pricing info
    const [results] = await connection.query(
      `
      SELECT
        p.prod_id,
        p.prod_name,
        p.base_price,
        COALESCE(pr.round_price, 'NULL') as round_price,
        CASE
          WHEN pr.round_price IS NULL THEN '❌ ไม่มี'
          WHEN pr.round_price = p.base_price THEN '✅ เหมือนกัน'
          ELSE '⚠️  ต่างกัน'
        END as status
      FROM products p
      LEFT JOIN preorder_round_products pr ON p.prod_id = pr.prod_id AND pr.round_id = ?
      ORDER BY p.prod_id
    `,
      [roundId],
    )

    console.log('กำหนดราคาสินค้า:')
    console.log('─'.repeat(80))
    console.log('ID | ชื่อสินค้า | ราคาพื้นฐาน | ราคาพรีออเดอร์ | สถานะ')
    console.log('─'.repeat(80))

    let samePrice = 0
    let diffPrice = 0
    let nullPrice = 0

    for (const row of results) {
      const id = String(row.prod_id).padEnd(4)
      const name = String(row.prod_name).substring(0, 20).padEnd(20)
      const basePrice = String(row.base_price).padEnd(12)
      const roundPrice = String(row.round_price).padEnd(16)
      const stat = row.status

      console.log(`${id} | ${name} | ${basePrice} | ${roundPrice} | ${stat}`)

      if (row.round_price === 'NULL') {
        nullPrice++
      } else if (row.round_price === row.base_price) {
        samePrice++
      } else {
        diffPrice++
      }
    }

    console.log('─'.repeat(80))
    console.log(`\n📈 สรุป:`)
    console.log(`  ✅ ราคาเหมือนกัน: ${samePrice} รายการ`)
    console.log(`  ⚠️  ราคาต่างกัน: ${diffPrice} รายการ`)
    console.log(`  ❌ ไม่มีราคาพรีออเดอร์: ${nullPrice} รายการ\n`)
  } finally {
    await connection.end()
    await pool.end()
  }
}

checkPrices().catch(console.error)
