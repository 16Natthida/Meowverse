// routes/order.js
// Express router สำหรับ Order API
// ตาราง: orders, order_details
//
// วิธีใช้ใน app.js / server.js:
//   import orderRouter from './order.js'
//   app.use('/api/orders', orderRouter)

import express from 'express'
const router = express.Router()

let orderDetailsSupportsFlavor = null

function getDB(req) {
  return req.app.locals.db
}

async function canUseOrderDetailFlavor(connection) {
  if (orderDetailsSupportsFlavor !== null) {
    return orderDetailsSupportsFlavor
  }

  const [rows] = await connection.query("SHOW COLUMNS FROM order_details LIKE 'flavor'")
  orderDetailsSupportsFlavor = rows.length > 0
  return orderDetailsSupportsFlavor
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

    // 1. ดึงข้อมูลตะกร้าของผู้ใช้ (รวม preorder_round_id และราคา Preorder round)
    const [cartItems] = await connection.query(
      `SELECT
         c.cart_id,
         c.user_id,
         c.prod_id,
         c.qty,
         COALESCE(NULLIF(c.item_type, ''), CASE
           WHEN c.preorder_round_id IS NOT NULL THEN 'preorder'
           WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship'
           WHEN p.preorder_enabled = 1 THEN 'preorder'
           ELSE NULL
         END) AS item_type,
         c.flavor,
         COALESCE(
           c.preorder_round_id,
           (
             SELECT prp2.round_id
             FROM preorder_round_products prp2
             JOIN preorder_rounds r2 ON r2.round_id = prp2.round_id
             WHERE prp2.prod_id = c.prod_id
               AND LOWER(r2.status) IN ('active', 'open')
             ORDER BY r2.start_date DESC, prp2.round_id DESC
             LIMIT 1
           )
         ) AS preorder_round_id,
         p.prod_name AS name,
         COALESCE(
           CASE
             WHEN COALESCE(NULLIF(c.item_type, ''), CASE
               WHEN c.preorder_round_id IS NOT NULL THEN 'preorder'
               WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship'
               WHEN p.preorder_enabled = 1 THEN 'preorder'
               ELSE NULL
             END) = 'preorder' THEN CASE
               WHEN c.preorder_round_id IS NOT NULL THEN COALESCE(prp.round_price, p.base_price)
               ELSE (
                 SELECT prp2.round_price
                 FROM preorder_round_products prp2
                 JOIN preorder_rounds r2 ON r2.round_id = prp2.round_id
                 WHERE prp2.prod_id = c.prod_id
                   AND LOWER(r2.status) IN ('active', 'open')
                 ORDER BY r2.start_date DESC, prp2.round_id DESC
                 LIMIT 1
               )
             END
             ELSE NULL
           END,
           p.base_price
         ) AS price,
         p.stock_qty AS stock
       FROM cart c
       LEFT JOIN products p ON c.prod_id = p.prod_id
       LEFT JOIN preorder_round_products prp ON prp.round_id = c.preorder_round_id AND prp.prod_id = c.prod_id
       WHERE c.user_id = ?
       ORDER BY c.cart_id`,
      [user_id],
    )

    if (cartItems.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'ตะกร้าสินค้าว่างเปล่า' })
    }

    // 2. ตรวจสอบสต็อกสำหรับสินค้าที่พร้อมส่ง และ preorder
    for (const item of cartItems) {
      if (item.item_type === 'ready-to-ship' && item.qty > item.stock) {
        await connection.rollback()
        return res.status(400).json({
          error: `สินค้า "${item.name}" มีสต็อกไม่เพียงพอ (เหลือ ${item.stock} ชิ้น)`,
        })
      }

    }

    // 3. คำนวณราคารวมและกำหนดประเภทออเดอร์
    const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0)
    const hasPreorder = cartItems.some((item) => item.item_type === 'preorder')
    const orderType = hasPreorder ? 'Preorder' : 'Ready'

    // 4. สร้างออเดอร์
    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total_amount, status, Order_type) VALUES (?, ?, ?, ?)',
      [user_id, totalAmount, 'Pending', orderType],
    )

    const orderId = orderResult.insertId

    // 5. สร้าง order_details (รองรับ schema เก่าที่ไม่มีคอลัมน์ flavor)
    const supportsFlavor = await canUseOrderDetailFlavor(connection)
    for (const item of cartItems) {
      if (supportsFlavor) {
        await connection.query(
          'INSERT INTO order_details (order_id, prod_id, flavor, Price, qty, received_qty, arrival_status, Import_fee, item_type, preorder_round_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            orderId,
            item.prod_id,
            item.flavor || null,
            item.price,
            item.qty,
            0,
            'Pending',
            0.0,
            item.item_type,
            item.preorder_round_id || null,
          ],
        )
      } else {
        await connection.query(
          'INSERT INTO order_details (order_id, prod_id, Price, qty, received_qty, arrival_status, Import_fee, item_type, preorder_round_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            orderId,
            item.prod_id,
            item.price,
            item.qty,
            0,
            'Pending',
            0.0,
            item.item_type,
            item.preorder_round_id || null,
          ],
        )
      }
    }

    // 6. ลบรายการในตะกร้า
    await connection.query('DELETE FROM cart WHERE user_id = ?', [user_id])

    // 7. ลดสต็อกสำหรับสินค้าที่พร้อมส่ง
    for (const item of cartItems) {
      if (item.item_type === 'ready-to-ship') {
        await connection.query('UPDATE products SET stock_qty = stock_qty - ? WHERE prod_id = ?', [
          item.qty,
          item.prod_id,
        ])
      }
    }

    // 8. ลดสต็อก preorder (เพิ่ม quantity_sold)
    for (const item of cartItems) {
      if (item.item_type === 'preorder' && item.preorder_round_id) {
        await connection.query(
          `UPDATE preorder_round_products
           SET quantity_sold = COALESCE(quantity_sold, 0) + ?
           WHERE round_id = ? AND prod_id = ?`,
          [item.qty, item.preorder_round_id, item.prod_id],
        )
      }
    }

    await connection.commit()

    res.status(201).json({
      message: 'สร้างออเดอร์สำเร็จ',
      order_id: orderId,
      order_type: orderType,
      total_amount: totalAmount,
      item_count: cartItems.length,
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
// ─────────────────────────────────────────────
// GET /api/orders?user_id=xxx
// ดึงรายการออเดอร์ทั้งหมดของ user
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { user_id } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  try {
    const db = getDB(req)

    const [rows] = await db.query(
      `SELECT
         order_id,
         user_id,
         total_amount,
         status,
         deadline,
         Order_type,
         Order_date
       FROM orders
       WHERE user_id = ?
       ORDER BY Order_date DESC`,
      [user_id],
    )

    res.json(rows)
  } catch (err) {
    console.error('[GET /api/orders]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' })
  }
})

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
      [order_id],
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
         od.Price AS price,
         od.qty,
         od.received_qty,
         od.Lot_id,
         od.arrival_status,
         od.flavor,
         od.Import_fee AS import_fee,
         od.item_type,
         od.preorder_round_id,
         p.prod_name AS name,
         p.cat_id AS categoryId,
         c.cat_name AS categoryName,
         p.base_price AS base_price,
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
       LEFT JOIN categories c ON p.cat_id = c.cat_id
       WHERE od.order_id = ?
       ORDER BY od.item_type ASC, od.detail_id`,
      [order_id],
    )

    const importFeeTotal = detailRows.reduce((sum, item) => sum + (Number(item.import_fee) || 0), 0)

    res.json({
      ...order,
      items: detailRows,
      import_fee_total: importFeeTotal,
    })
  } catch (err) {
    console.error('[GET /api/orders/:order_id]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์' })
  }
})

router.patch('/:order_id/import-fee', async (req, res) => {
  const { order_id } = req.params
  const importFee = Number(req.body.import_fee)

  if (Number.isNaN(importFee) || importFee < 0) {
    return res.status(400).json({ error: 'import_fee must be a non-negative number' })
  }

  const connection = await getDB(req).getConnection()
  try {
    await connection.beginTransaction()

    const [rows] = await connection.query(
      `SELECT detail_id FROM order_details
       WHERE order_id = ? AND item_type = 'preorder'
       ORDER BY detail_id ASC
       LIMIT 1`,
      [order_id],
    )

    if (rows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบรายการพรีออเดอร์ในออเดอร์นี้' })
    }

    await connection.query(
      'UPDATE order_details SET Import_fee = ? WHERE detail_id = ?',
      [importFee, rows[0].detail_id],
    )

    await connection.commit()
    res.json({ success: true, order_id: Number(order_id), import_fee: importFee })
  } catch (err) {
    await connection.rollback()
    console.error('[PATCH /api/orders/:order_id/import-fee]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกค่านำเข้า' })
  } finally {
    connection.release()
  }
})

export default router
