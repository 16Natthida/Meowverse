// routes/order.js
// Clean order router for checkout, listing, details, and import-fee updates.

import express from 'express'

const router = express.Router()

let orderDetailsSupportsFlavor = null
let orderDetailsSupportsItemType = null
let orderDetailsSupportsPreorderRoundId = null

function getDB(req) {
  return req.app.locals.db
}

async function hasOrderDetailColumn(connection, columnName, cacheKeyName) {
  if (cacheKeyName === 'flavor' && orderDetailsSupportsFlavor !== null) {
    return orderDetailsSupportsFlavor
  }
  if (cacheKeyName === 'itemType' && orderDetailsSupportsItemType !== null) {
    return orderDetailsSupportsItemType
  }
  if (cacheKeyName === 'preorderRoundId' && orderDetailsSupportsPreorderRoundId !== null) {
    return orderDetailsSupportsPreorderRoundId
  }

  const [rows] = await connection.query('SHOW COLUMNS FROM order_details LIKE ?', [columnName])
  const exists = rows.length > 0

  if (cacheKeyName === 'flavor') orderDetailsSupportsFlavor = exists
  if (cacheKeyName === 'itemType') orderDetailsSupportsItemType = exists
  if (cacheKeyName === 'preorderRoundId') orderDetailsSupportsPreorderRoundId = exists

  return exists
}

router.post('/checkout', async (req, res) => {
  const { user_id, items: requestItems = [] } = req.body || {}

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  const db = getDB(req)
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const selectedCartIds = Array.isArray(requestItems)
      ? [...new Set(requestItems.map((item) => Number(item.cart_id)).filter(Boolean))]
      : []

    if (selectedCartIds.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'ต้องส่งรายการสินค้าที่ต้องการ checkout' })
    }

    const placeholders = selectedCartIds.map(() => '?').join(',')
    const [cartItems] = await connection.query(
      `SELECT
         c.cart_id,
         c.user_id,
         c.prod_id,
         c.qty,
         c.item_type,
         c.flavor,
         c.preorder_round_id,
         c.round_price,
         p.prod_name AS name,
         p.stock_qty AS stock,
         p.base_price AS basePrice,
         p.preorder_price AS preorderPrice,
         p.ready_to_ship_enabled AS readyToShipEnabled,
         p.preorder_enabled AS preorderEnabled,
         COALESCE(
           NULLIF(c.round_price, 0),
           CASE
             WHEN COALESCE(NULLIF(c.item_type, ''), CASE
               WHEN c.preorder_round_id IS NOT NULL THEN 'preorder'
               WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship'
               WHEN p.preorder_enabled = 1 THEN 'preorder'
               ELSE NULL
             END) = 'preorder' THEN CASE
               WHEN c.preorder_round_id IS NOT NULL THEN COALESCE(NULLIF(prp.round_price, 0), NULLIF(p.preorder_price, 0), NULLIF(p.base_price, 0))
               ELSE COALESCE(
                 (
                   SELECT prp2.round_price
                   FROM preorder_round_products prp2
                   JOIN preorder_rounds r2 ON r2.round_id = prp2.round_id
                   WHERE prp2.prod_id = c.prod_id
                     AND LOWER(r2.status) IN ('active', 'open')
                   ORDER BY r2.start_date DESC, prp2.round_id DESC
                   LIMIT 1
                 ),
                 NULLIF(p.preorder_price, 0),
                 NULLIF(p.base_price, 0)
               )
             END
             ELSE COALESCE(NULLIF(p.base_price, 0), NULLIF(p.preorder_price, 0))
           END
         ) AS price
       FROM cart c
       LEFT JOIN products p ON p.prod_id = c.prod_id
       LEFT JOIN preorder_round_products prp
         ON prp.round_id = c.preorder_round_id AND prp.prod_id = c.prod_id
       WHERE c.user_id = ? AND c.cart_id IN (${placeholders})
       ORDER BY c.cart_id`,
      [user_id, ...selectedCartIds],
    )

    if (cartItems.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'ตะกร้าสินค้าว่างเปล่า' })
    }

    for (const item of cartItems) {
      const itemType = String(item.item_type || '').toLowerCase()
      if (itemType === 'ready-to-ship' && item.qty > item.stock) {
        await connection.rollback()
        return res.status(400).json({
          error: `สินค้า "${item.name}" มีสต็อกไม่เพียงพอ (เหลือ ${item.stock} ชิ้น)`,
        })
      }
    }

    // ใช้ราคาจาก query (calculated price) แทนที่จาก frontend เพื่อหลีกเลี่ยง price=0
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * Number(item.qty || 0),
      0,
    )
    const hasPreorder = cartItems.some(
      (item) => String(item.item_type || '').toLowerCase() === 'preorder' || item.preorder_round_id,
    )
    const orderType = hasPreorder ? 'Preorder' : 'Ready'

    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total_amount, status, Order_type) VALUES (?, ?, ?, ?)',
      [user_id, totalAmount, 'Pending', orderType],
    )

    const orderId = orderResult.insertId
    const supportsFlavor = await hasOrderDetailColumn(connection, 'flavor', 'flavor')
    const supportsItemType = await hasOrderDetailColumn(connection, 'item_type', 'itemType')
    const supportsPreorderRoundId = await hasOrderDetailColumn(
      connection,
      'preorder_round_id',
      'preorderRoundId',
    )

    for (const item of cartItems) {
      const columns = [
        'order_id',
        'prod_id',
        'Price',
        'qty',
        'received_qty',
        'arrival_status',
        'Import_fee',
      ]
      const values = [orderId, item.prod_id, item.price, item.qty, 0, 'Pending', 0.0]

      if (supportsFlavor) {
        columns.splice(2, 0, 'flavor')
        values.splice(2, 0, item.flavor || null)
      }

      if (supportsItemType) {
        columns.push('item_type')
        values.push(item.item_type || null)
      }

      if (supportsPreorderRoundId) {
        columns.push('preorder_round_id')
        values.push(item.preorder_round_id || null)
      }

      await connection.query(
        `INSERT INTO order_details (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values,
      )
    }

    for (const item of cartItems) {
      const itemType = String(item.item_type || '').toLowerCase()

      if (itemType === 'preorder' && item.preorder_round_id) {
        await connection.query(
          `UPDATE preorder_round_products
           SET quantity_sold = COALESCE(quantity_sold, 0) + ?
           WHERE round_id = ? AND prod_id = ?`,
          [item.qty, item.preorder_round_id, item.prod_id],
        )
      }
    }

    // ลบเฉพาะสินค้าที่สั่งออกจากตะกร้า (เลือกเฉพาะตามรายการที่ได้รับ)
    if (selectedCartIds.length > 0) {
      const deletePlaceholders = selectedCartIds.map(() => '?').join(',')
      await connection.query(
        `DELETE FROM cart WHERE cart_id IN (${deletePlaceholders})`,
        selectedCartIds,
      )
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

router.get('/', async (req, res) => {
  const { user_id } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  try {
    const db = getDB(req)
    const [rows] = await db.query(
      `SELECT order_id, user_id, total_amount, status, deadline, Order_type, Order_date
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

    const [orderRows] = await db.query(
      `SELECT o.order_id, o.user_id, o.total_amount, o.status, o.deadline, o.Order_type, o.Order_date, a.username
       FROM orders o
       LEFT JOIN accounts a ON o.user_id = a.user_id
       WHERE o.order_id = ?
       LIMIT 1`,
      [order_id],
    )

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลออเดอร์' })
    }

    const order = orderRows[0]

    const [detailRows] = await db.query(
      `SELECT od.detail_id, od.prod_id, od.Price AS unit_price, od.qty, od.received_qty, od.arrival_status, od.Import_fee, od.item_type, od.preorder_round_id, p.prod_name AS name, c.cat_name AS category_name,
              (
                SELECT pi.image_url
                FROM product_images pi
                WHERE pi.prod_id = od.prod_id
                ORDER BY pi.sort_order ASC, pi.img_id ASC
                LIMIT 1
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

    await connection.query('UPDATE order_details SET Import_fee = ? WHERE detail_id = ?', [
      importFee,
      rows[0].detail_id,
    ])

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
