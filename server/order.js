// routes/order.js
// Express router สำหรับ Order API
// ตาราง: orders, order_details
//
// วิธีใช้ใน app.js / server.js:
//   import orderRouter from './order.js'
//   app.use('/api/orders', orderRouter)

import express from 'express'
const router = express.Router()

function getDB(req) {
  return req.app.locals.db
}

// ─────────────────────────────────────────────
// POST /api/orders/checkout
// สร้างออเดอร์จากตะกร้าสินค้า
// Body: { user_id }
// ─────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const { user_id } = req.body

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  const db = getDB(req)
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    // 1. ดึงข้อมูลตะกร้าของผู้ใช้
    const [cartItems] = await connection.query(
      `SELECT
         c.cart_id,
         c.user_id,
         c.prod_id,
         c.qty,
         c.item_type,
         c.flavor,
         p.prod_name AS name,
         p.base_price AS price,
         p.stock_qty AS stock
       FROM cart c
       LEFT JOIN products p ON c.prod_id = p.prod_id
       WHERE c.user_id = ?
       ORDER BY c.cart_id`,
      [user_id]
    )

    if (cartItems.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'ตะกร้าสินค้าว่างเปล่า' })
    }

    // 2. ตรวจสอบสต็อกสำหรับสินค้าที่พร้อมส่ง
    for (const item of cartItems) {
      if (item.item_type === 'ready-to-ship' && item.qty > item.stock) {
        await connection.rollback()
        return res.status(400).json({
          error: `สินค้า "${item.name}" มีสต็อกไม่เพียงพอ (เหลือ ${item.stock} ชิ้น)`
        })
      }
    }

    // 3. คำนวณราคารวมและกำหนดประเภทออเดอร์
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0)
    const hasPreorder = cartItems.some(item => item.item_type === 'preorder')
    const orderType = hasPreorder ? 'Preorder' : 'Ready'

    // 4. สร้างออเดอร์
    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total_amount, status, Order_type) VALUES (?, ?, ?, ?)',
      [user_id, totalAmount, 'Pending', orderType]
    )

    const orderId = orderResult.insertId

    // 5. สร้าง order_details
   // ในไฟล์ order.js ส่วนการวนลูป INSERT order_details
for (const item of cartItems) {
  await connection.query(
    'INSERT INTO order_details (order_id, prod_id, flavor, Price, qty, received_qty, arrival_status, Import_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [orderId, item.prod_id, item.flavor, item.price, item.qty, 0, 'Pending', 0.00]
  );
}

    // 6. ลบรายการในตะกร้า
    await connection.query('DELETE FROM cart WHERE user_id = ?', [user_id])

    // 7. ลดสต็อกสำหรับสินค้าที่พร้อมส่ง
    for (const item of cartItems) {
      if (item.item_type === 'ready-to-ship') {
        await connection.query(
          'UPDATE products SET stock_qty = stock_qty - ? WHERE prod_id = ?',
          [item.qty, item.prod_id]
        )
      }
    }

    await connection.commit()

    res.status(201).json({
      message: 'สร้างออเดอร์สำเร็จ',
      order_id: orderId,
      total_amount: totalAmount,
      item_count: cartItems.length
    })

  } catch (err) {
    await connection.rollback()
    console.error('[POST /api/orders/checkout]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างออเดอร์' })
  } finally {
    connection.release()
  }
})

// ─────────────────────────────────────────────
// GET /api/orders/:order_id
// ดึงข้อมูลออเดอร์พร้อมรายละเอียด
// ─────────────────────────────────────────────
router.get('/:order_id', async (req, res) => {
  const { order_id } = req.params

  try {
    const db = getDB(req)

    // ดึงข้อมูลออเดอร์
    const [orderRows] = await db.query(
      `SELECT
         o.order_id,
         o.user_id,
         o.Order_date AS order_date,
         o.total_amount,
         o.status,
         o.Order_type,
         o.deadline,
         a.username,
         a.full_name
       FROM orders o
       LEFT JOIN accounts a ON o.user_id = a.user_id
       WHERE o.order_id = ?
       LIMIT 1`,
      [order_id]
    )

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบออเดอร์' })
    }

    const order = orderRows[0]

    // ดึงรายละเอียดออเดอร์
    const [detailRows] = await db.query(
      `SELECT
         od.detail_id,
         od.prod_id,
         od.Price AS unit_price,
         od.qty,
         od.received_qty,
         od.Lot_id,
         od.arrival_status,
         p.prod_name AS name,
         COALESCE(
           (
             SELECT pi.image_url
             FROM product_images pi
             WHERE pi.prod_id = p.prod_id
             ORDER BY pi.sort_order ASC, pi.img_id ASC
             LIMIT 1
           ),
           ''
         ) AS image
       FROM order_details od
       LEFT JOIN products p ON od.prod_id = p.prod_id
       WHERE od.order_id = ?
       ORDER BY od.detail_id`,
      [order_id]
    )

    res.json({
      ...order,
      items: detailRows
    })

  } catch (err) {
    console.error('[GET /api/orders/:order_id]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์' })
  }
})

export default router