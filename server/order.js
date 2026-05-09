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
let orderDetailsSupportsItemType = null

function normalizeItemOrderType(item) {
  if (item.item_type === 'preorder' || item.pre_item_id) {
    return 'Preorder'
  }

  return 'Ready'
}

function isPreorderItem(item) {
  return normalizeItemOrderType(item) === 'Preorder'
}

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

async function canUseOrderDetailItemType(connection) {
  if (orderDetailsSupportsItemType !== null) {
    return orderDetailsSupportsItemType
  }

  const [rows] = await connection.query("SHOW COLUMNS FROM order_details LIKE 'item_type'")
  orderDetailsSupportsItemType = rows.length > 0
  return orderDetailsSupportsItemType
}

// ─────────────────────────────────────────────
// POST /api/orders/checkout
// สร้างออเดอร์จากตะกร้าสินค้า
// Body: { user_id }
// ─────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const { user_id, items: requestItems = [] } = req.body

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
           c.round_id,
           c.round_price AS cart_round_price,
           p.prod_name AS name,
           -- prefer locked cart.round_price when present
           COALESCE(c.round_price,
           CASE
             WHEN COALESCE(c.item_type, CASE WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship' WHEN p.preorder_enabled = 1 THEN 'preorder' ELSE NULL END) = 'preorder'
               THEN COALESCE(
                 (
                   SELECT prp.round_price
                   FROM preorder_round_products prp
                   JOIN preorder_rounds r ON prp.round_id = r.round_id
                   WHERE prp.prod_id = p.prod_id AND r.status = 'active'
                   ORDER BY prp.link_id DESC
                   LIMIT 1
                 ), p.preorder_price, p.base_price
               )
             ELSE p.base_price
           END) AS price,
           p.stock_qty AS stock
         FROM cart c
         LEFT JOIN products p ON c.prod_id = p.prod_id
         WHERE c.user_id = ? AND c.cart_id IN (${placeholders})
         ORDER BY c.cart_id`,
      [user_id, ...selectedCartIds],
    )

    if (cartItems.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบรายการสินค้าที่เลือกในตะกร้า' })
    }

    if (cartItems.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'ตะกร้าสินค้าว่างเปล่า' })
    }

    // 2. ตรวจสอบสต็อกสำหรับสินค้าที่พร้อมส่ง
    for (const item of cartItems) {
      if (item.item_type === 'ready-to-ship' && item.qty > item.stock) {
        await connection.rollback()
        return res.status(400).json({
          error: `สินค้า "${item.name}" มีสต็อกไม่เพียงพอ (เหลือ ${item.stock} ชิ้น)`,
        })
      }
    }

    // 3. แยกออเดอร์ตามประเภทสินค้า
    const readyItems = cartItems.filter((item) => !isPreorderItem(item))
    const preorderItems = cartItems.filter((item) => isPreorderItem(item))
    const orderGroups = []

    if (readyItems.length > 0) {
      orderGroups.push({ type: 'Ready', items: readyItems })
    }

    if (preorderItems.length > 0) {
      orderGroups.push({ type: 'Preorder', items: preorderItems })
    }

    // 4. สร้างออเดอร์แยกตามประเภทสินค้า
    const supportsFlavor = await canUseOrderDetailFlavor(connection)
    const orderIds = []

    for (const group of orderGroups) {
      const totalAmount = group.items.reduce((sum, item) => sum + item.price * item.qty, 0)

      const [orderResult] = await connection.query(
        'INSERT INTO orders (user_id, total_amount, status, Order_type) VALUES (?, ?, ?, ?)',
        [user_id, totalAmount, 'Pending', group.type],
      )

      const orderId = orderResult.insertId
      orderIds.push(orderId)

      for (const item of group.items) {
        if (supportsFlavor) {
          await connection.query(
            'INSERT INTO order_details (order_id, prod_id, flavor, Price, qty, received_qty, arrival_status, Import_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [orderId, item.prod_id, item.flavor || null, item.price, item.qty, 0, 'Pending', 0.0],
          )
        } else {
          await connection.query(
            'INSERT INTO order_details (order_id, prod_id, Price, qty, received_qty, arrival_status, Import_fee) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, item.prod_id, item.price, item.qty, 0, 'Pending', 0.0],
          )
        }
      }
    }

    await connection.commit()

    res.status(201).json({
      message: 'สร้างออเดอร์สำเร็จ',
      order_id: orderIds[0] ?? null,
      order_ids: orderIds,
      total_amount: cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
      item_count: cartItems.length,
      mixed_order: orderIds.length > 1,
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
    const supportsItemType = await canUseOrderDetailItemType(db)
    const itemTypeSelect = supportsItemType ? 'od.item_type' : 'NULL AS item_type'

    // ดึงรายละเอียดออเดอร์
    const [detailRows] = await db.query(
      `SELECT
         od.detail_id,
         od.prod_id,
          ${itemTypeSelect},
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
      [order_id],
    )

    res.json({
      ...order,
      items: detailRows,
    })
  } catch (err) {
    console.error('[GET /api/orders/:order_id]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์' })
  }
})

export default router
