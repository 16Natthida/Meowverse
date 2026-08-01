// routes/order.js
// Clean order router for checkout, listing, details, and import-fee updates.

import express from 'express'

const router = express.Router()

let orderDetailsSupportsFlavor = null
let orderDetailsSupportsItemType = null
let orderDetailsSupportsPreorderRoundId = null
let postponeDeadlineColumnName = null

function getDB(req) {
  return req.app.locals.db
}

function normalizeItemType(value) {
  const type = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')

  if (type === 'ready-to-ship' || type === 'preorder') {
    return type
  }

  return ''
}

function getEffectiveItemType(item) {
  const normalizedType = normalizeItemType(item?.item_type)
  if (normalizedType) {
    return normalizedType
  }

  if (item?.preorder_round_id) {
    return 'preorder'
  }

  return ''
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

async function getPostponeDeadlineColumn(connection) {
  if (postponeDeadlineColumnName !== null) {
    return postponeDeadlineColumnName
  }

  const [newDeadlineRows] = await connection.query('SHOW COLUMNS FROM postpone LIKE ?', [
    'new_deadline',
  ])
  if (newDeadlineRows.length > 0) {
    postponeDeadlineColumnName = 'new_deadline'
    return postponeDeadlineColumnName
  }

  const [legacyDeadlineRows] = await connection.query('SHOW COLUMNS FROM postpone LIKE ?', [
    'deadline',
  ])
  if (legacyDeadlineRows.length > 0) {
    postponeDeadlineColumnName = 'deadline'
    return postponeDeadlineColumnName
  }

  postponeDeadlineColumnName = ''
  return postponeDeadlineColumnName
}

async function maybeExpireOrder(connection, orderId) {
  const [rows] = await connection.query(
    'SELECT status, deadline FROM orders WHERE order_id = ? LIMIT 1',
    [orderId],
  )
  if (rows.length === 0) return null

  const order = rows[0]
  if (!order.deadline) return order

  const deadlineTime = new Date(order.deadline).getTime()
  if (Number.isNaN(deadlineTime)) return order

  const cancellableStatuses = ['Pending']
  if (deadlineTime <= Date.now() && cancellableStatuses.includes(order.status)) {
    await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [
      'Cancelled',
      orderId,
    ])
    order.status = 'Cancelled'
  }

  return order
}

function resolveReopenedOrderStatus(orderRow) {
  const orderType = String(orderRow?.Order_type || '')
    .trim()
    .toLowerCase()
  const importFeeTotal = Number(orderRow?.import_fee_total || 0)

  if (orderType === 'pending_import' || importFeeTotal > 0) {
    return 'Wait_for_Import_Fee'
  }

  return 'Pending'
}

/**
 * ตรวจสอบสถานะของรอบพรีออเดอร์ก่อนแปลงเป็นออเดอร์
 * อนุญาตเฉพาะเมื่อรอบ "closed" (ปิดรับแล้ว พร้อมยืนยัน)
 * บล็อกถ้ารอบยัง "active" (ยังรับออเดอร์อยู่) หรือ "archived"
 */
async function validatePreorderRound(connection, roundId) {
  if (!roundId) return { ok: true }

  const [rows] = await connection.query(
    `SELECT round_id, round_name, status FROM preorder_rounds WHERE round_id = ? LIMIT 1`,
    [roundId],
  )

  if (rows.length === 0) {
    return { ok: false, error: 'ไม่พบรอบพรีออเดอร์ที่ระบุ' }
  }

  const status = String(rows[0].status || '')
    .trim()
    .toLowerCase()
  const roundName = rows[0].round_name || `รอบ #${roundId}`

  if (['active', 'open'].includes(status)) {
    return {
      ok: false,
      error: `รอบพรีออเดอร์ "${roundName}" ยังเปิดรับออเดอร์อยู่ ไม่สามารถยืนยันออเดอร์ได้จนกว่ารอบจะปิด`,
    }
  }
  if (status === 'archived') {
    return { ok: false, error: `รอบพรีออเดอร์ "${roundName}" ถูกเก็บถาวรแล้ว ไม่สามารถสั่งซื้อได้` }
  }

  // status === 'closed' → ผ่าน สามารถยืนยันออเดอร์ได้
  return { ok: true }
}

router.post('/checkout-preview', async (req, res) => {
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

    // Merge duplicate cart rows that refer to the same product+flavor+price+round
    const mergedMap = new Map()
    for (const it of cartItems) {
      const key = [
        it.prod_id,
        it.flavor || '',
        String(it.price || ''),
        it.preorder_round_id || '',
        String(it.round_price || ''),
        String(it.item_type || ''),
      ].join('|')
      if (!mergedMap.has(key)) {
        mergedMap.set(key, Object.assign({}, it))
      } else {
        const existing = mergedMap.get(key)
        existing.qty = Number(existing.qty || 0) + Number(it.qty || 0)
      }
    }
    const mergedItems = Array.from(mergedMap.values())

    for (const item of mergedItems) {
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

    await connection.commit()

    res.status(201).json({
      message: 'วาลิเดตออเดอร์สำเร็จ',
      cart_items: cartItems,
      order_type: orderType,
      total_amount: totalAmount,
      item_count: cartItems.length,
    })
  } catch (err) {
    await connection.rollback()
    console.error('[POST /api/orders/checkout-preview]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างออเดอร์' })
  } finally {
    connection.release()
  }
})

// POST /api/orders/confirm-payment
// สร้างออเดอร์จริง + ลบ cart เมื่อกดยืนยันการชำระ
router.post('/confirm-payment', async (req, res) => {
  let { user_id, items: requestItems = [] } = req.body || {}

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  let selectedItems = requestItems

  // ถ้า items เป็น string (มาจาก formData) ให้ parse เป็น array
  if (typeof requestItems === 'string') {
    try {
      selectedItems = JSON.parse(requestItems)
    } catch (e) {
      selectedItems = []
    }
  }

  const db = getDB(req)
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const selectedCartIds = Array.isArray(selectedItems)
      ? [...new Set(selectedItems.map((item) => Number(item.cart_id)).filter(Boolean))]
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

      // ✅ เช็คสถานะรอบพรีออเดอร์ก่อนสร้างออเดอร์จริง
      if (itemType === 'preorder' || item.preorder_round_id) {
        const roundCheck = await validatePreorderRound(connection, item.preorder_round_id)
        if (!roundCheck.ok) {
          await connection.rollback()
          return res.status(400).json({ error: roundCheck.error })
        }
      }
    }

    // Merge duplicate cart rows that refer to the same product+flavor+price+round
    const mergedMap = new Map()
    for (const it of cartItems) {
      const key = [
        it.prod_id,
        it.flavor || '',
        String(it.price || ''),
        it.preorder_round_id || '',
        String(it.round_price || ''),
        String(it.item_type || ''),
      ].join('|')

      if (!mergedMap.has(key)) {
        mergedMap.set(key, Object.assign({}, it))
      } else {
        const existing = mergedMap.get(key)
        existing.qty = Number(existing.qty || 0) + Number(it.qty || 0)
      }
    }
    const mergedItems = Array.from(mergedMap.values())

    // ใช้ราคาจาก query (calculated price) ของรายการที่รวมแล้ว
    const totalAmount = mergedItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * Number(item.qty || 0),
      0,
    )
    const hasPreorder = mergedItems.some(
      (item) => String(item.item_type || '').toLowerCase() === 'preorder' || item.preorder_round_id,
    )
    // ถ้าเป็นการชำระรอบ 2 (import fee) ให้ตั้ง orderType = 'Pending_import'
    let orderType = hasPreorder ? 'Preorder' : 'Ready'
    // ตรวจสอบว่ามี import_fee_total > 0 และสถานะออเดอร์เป็น Wait_for_Import_Fee (รอบ 2)
    // (สมมติว่ามี logic ตรวจสอบจากฝั่ง client หรือส่ง flag มาด้วย)
    if (hasPreorder && req.body.is_import_fee_round) {
      orderType = 'Pending_import'
    }

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

    for (const item of mergedItems) {
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
      const effectiveItemType = getEffectiveItemType(item)

      if (supportsFlavor) {
        columns.splice(2, 0, 'flavor')
        values.splice(2, 0, item.flavor || null)
      }

      if (supportsItemType) {
        columns.push('item_type')
        values.push(effectiveItemType || null)
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

    for (const item of mergedItems) {
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
      item_count: mergedItems.length,
    })
  } catch (err) {
    await connection.rollback()
    console.error('[POST /api/orders/checkout]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างออเดอร์' })
  } finally {
    connection.release()
  }
})

router.post('/:order_id/postpone', async (req, res) => {
  const { order_id } = req.params
  const { new_deadline, reason, contact_phone, details } = req.body || {}

  if (!new_deadline) {
    return res.status(400).json({ error: 'กรุณาเลือกวันที่ต้องการเลื่อน' })
  }
  if (!String(reason || '').trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลการขอเลื่อน' })
  }

  const connection = await getDB(req).getConnection()
  try {
    await connection.beginTransaction()

    const [orderRows] = await connection.query(
      'SELECT order_id, status FROM orders WHERE order_id = ? LIMIT 1',
      [order_id],
    )
    if (orderRows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }

    if (
      String(orderRows[0].status || '')
        .trim()
        .toLowerCase() === 'cancelled'
    ) {
      // ยังอนุญาตให้ขอเลื่อนได้ เพื่อให้แอดมิน approve และ reopen ออเดอร์
    }

    const deadlineColumn = await getPostponeDeadlineColumn(connection)
    const insertColumns = ['order_id', 'post_detail', 'request_reason', 'contact_phone', 'status']
    const insertValues = [
      order_id,
      details || null,
      String(reason || '').trim(),
      contact_phone || null,
      'Pending',
    ]

    if (deadlineColumn) {
      insertColumns.splice(1, 0, deadlineColumn)
      insertValues.splice(1, 0, new_deadline)
    }

    const [insertResult] = await connection.query(
      `INSERT INTO postpone (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertValues,
    )

    await connection.commit()
    res.status(201).json({ success: true, post_id: insertResult.insertId })
  } catch (err) {
    await connection.rollback()
    console.error('[POST /api/orders/:order_id/postpone]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกคำขอเลื่อน' })
  } finally {
    connection.release()
  }
})

// ─────────────────────────────────────────────
// GET /api/orders/:order_id/postpone/latest
// ดึงคำขอเลื่อนล่าสุด (post_id สูงสุด) ของออเดอร์นี้
// ─────────────────────────────────────────────
router.get('/:order_id/postpone/latest', async (req, res) => {
  const { order_id } = req.params
  try {
    const db = getDB(req)
    const deadlineColumn = await getPostponeDeadlineColumn(db)
    const deadlineSelect = deadlineColumn
      ? `
      ${deadlineColumn} AS new_deadline,`
      : 'NULL AS new_deadline,'
    const [rows] = await db.query(
      `SELECT post_id, order_id,${deadlineSelect} request_reason, contact_phone, post_detail, status, Post_date
       FROM postpone
       WHERE order_id = ?
       ORDER BY post_id DESC
       LIMIT 1`,
      [order_id],
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบคำขอเลื่อนสำหรับออเดอร์นี้' })
    }
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/:order_id/postpone/latest]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำขอเลื่อน' })
  }
})

router.get('/postpones', async (req, res) => {
  const { status } = req.query

  try {
    const db = getDB(req)
    const deadlineColumn = await getPostponeDeadlineColumn(db)
    const deadlineSelect = deadlineColumn
      ? `p.${deadlineColumn} AS new_deadline,`
      : 'NULL AS new_deadline,'
    const conditions = []
    const params = []

    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      conditions.push('p.status = ?')
      params.push(status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const [rows] = await db.query(
      `SELECT
         p.post_id,
         p.order_id,
         ${deadlineSelect}
         p.request_reason,
         p.contact_phone,
         p.post_detail,
         p.status,
         p.Post_date,
         o.status AS order_status
       FROM postpone p
       LEFT JOIN orders o ON o.order_id = p.order_id
       ${whereClause}
       ORDER BY p.Post_date DESC`,
      params,
    )

    res.json(rows)
  } catch (err) {
    console.error('[GET /api/orders/postpones]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการคำขอเลื่อน' })
  }
})

router.patch('/postpones/:post_id/status', async (req, res) => {
  const { post_id } = req.params
  const { status } = req.body || {}
  const allowedStatuses = ['Pending', 'Approved', 'Rejected']

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `status ต้องเป็นหนึ่งใน: ${allowedStatuses.join(', ')}` })
  }

  const connection = await getDB(req).getConnection()
  try {
    await connection.beginTransaction()

    const deadlineColumn = await getPostponeDeadlineColumn(connection)

    const [rows] = await connection.query(
      `SELECT order_id, ${deadlineColumn ? `${deadlineColumn} AS new_deadline,` : 'NULL AS new_deadline,'} status AS current_status
       FROM postpone WHERE post_id = ? LIMIT 1`,
      [post_id],
    )
    if (rows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบคำขอเลื่อน' })
    }

    const postponeRow = rows[0]
    await connection.query('UPDATE postpone SET status = ? WHERE post_id = ?', [status, post_id])

    if (status === 'Approved' && postponeRow.order_id) {
      const [orderRows] = await connection.query(
        `SELECT status, Order_type, import_fee_total
         FROM orders
         WHERE order_id = ?
         LIMIT 1`,
        [postponeRow.order_id],
      )

      const reopenedStatus =
        orderRows.length > 0 &&
        String(orderRows[0].status || '')
          .trim()
          .toLowerCase() === 'cancelled'
          ? resolveReopenedOrderStatus(orderRows[0])
          : null

      if (postponeRow.new_deadline) {
        await connection.query(
          `UPDATE orders
           SET deadline = ?,
               status = CASE
                 WHEN status = 'Cancelled' THEN ?
                 ELSE status
               END
           WHERE order_id = ?`,
          [postponeRow.new_deadline, reopenedStatus, postponeRow.order_id],
        )
      } else if (reopenedStatus) {
        await connection.query(
          `UPDATE orders
           SET status = CASE
             WHEN status = 'Cancelled' THEN ?
             ELSE status
           END
           WHERE order_id = ?`,
          [reopenedStatus, postponeRow.order_id],
        )
      }
    }

    await connection.commit()
    res.json({ success: true, post_id: Number(post_id), status })
  } catch (err) {
    await connection.rollback()
    console.error('[PATCH /api/orders/postpones/:post_id/status]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะคำขอเลื่อน' })
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
      `SELECT order_id, user_id, total_amount, import_fee_total, status, deadline, Order_type, Order_date,
              COALESCE((
                SELECT SUM(GREATEST(od_refund.qty - COALESCE(od_refund.received_qty, 0), 0) * od_refund.Price)
                FROM order_details od_refund
                WHERE od_refund.order_id = orders.order_id
                  AND LOWER(COALESCE(od_refund.arrival_status, '')) = 'missing'
              ), 0) AS refund_amount,
              COALESCE((
                SELECT COUNT(*)
                FROM order_details od_refund_count
                WHERE od_refund_count.order_id = orders.order_id
                  AND LOWER(COALESCE(od_refund_count.arrival_status, '')) = 'missing'
              ), 0) AS refund_item_count
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
    await maybeExpireOrder(db, order_id)

    const [orderRows] = await db.query(
      `SELECT o.order_id, o.user_id, o.total_amount, o.status, o.deadline, o.Order_type, o.Order_date, o.import_fee_total, a.username,
              (SELECT LOWER(pr.status)
               FROM preorder_rounds pr
               JOIN order_details od_round ON od_round.preorder_round_id = pr.round_id
               WHERE od_round.order_id = o.order_id
               ORDER BY pr.round_id DESC
               LIMIT 1) AS preorder_round_status,
              s.name AS shipping_name, s.phone AS shipping_phone, s.address AS shipping_address, s.notes AS shipping_notes, s.Shipping_Carrier
       FROM orders o
       LEFT JOIN accounts a ON o.user_id = a.user_id
       LEFT JOIN shipping s ON o.order_id = s.order_id
       WHERE o.order_id = ?
       ORDER BY s.ship_id DESC LIMIT 1`,
      [order_id],
    )

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลออเดอร์' })
    }

    const order = orderRows[0]

    // ดึง slip แยกตาม type เพื่อให้ frontend เลือกแสดงได้ถูกต้อง
    // Order_fee = สลิปรอบแรก, Import_Fee = สลิปรอบค่านำเข้า
    const [paymentRows] = await db.query(
      `SELECT slip_img, payment_method, status, type
       FROM payment
       WHERE order_id = ?
       ORDER BY pay_id DESC`,
      [order_id],
    )

    const orderFeePayment = paymentRows.find(
      (p) => p.type === 'Order_fee' || p.type === 'Ready pay',
    )
    const importFeePayment = paymentRows.find(
      (p) => p.type === 'Import_Fee' || p.type === 'import_fee',
    )
    // payment_method และ status ล่าสุด (pay_id DESC อยู่แล้ว)
    const latestPayment = paymentRows[0] || null

    const savedShipping = {
      name: order.shipping_name || null,
      phone: order.shipping_phone || null,
      address: order.shipping_address || null,
      notes: order.shipping_notes || null,
      carrier: order.Shipping_Carrier || null,
      // slip แยกตาม type ให้ frontend ใช้ตัดสินใจเอง
      slip_url: orderFeePayment?.slip_img || null, // สลิปรอบแรก (Order_fee)
      import_fee_slip_url: importFeePayment?.slip_img || null, // สลิปรอบค่านำเข้า
      payment_method: latestPayment?.payment_method || null,
      payment_status: latestPayment?.status || null,
    }

    const [detailRows] = await db.query(
      `SELECT od.detail_id, od.prod_id, od.flavor, od.Price AS unit_price, od.qty, od.received_qty, od.arrival_status, od.Import_fee AS import_fee, od.item_type, od.preorder_round_id, p.prod_name AS name, c.cat_name AS category_name,
COALESCE(
         (
           SELECT pi.image_url
           FROM product_images pi
           WHERE pi.prod_id = p.prod_id
             AND (
               (od.flavor IS NOT NULL AND od.flavor != '' AND pi.flavor = od.flavor)
               OR (pi.flavor IS NULL OR pi.flavor = '')
             )
           ORDER BY
             CASE
               WHEN od.flavor IS NOT NULL AND od.flavor != '' AND pi.flavor = od.flavor THEN 1
               ELSE 2
             END ASC,
             pi.sort_order ASC,
             pi.img_id ASC
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

    const missingAmount = detailRows.reduce((sum, item) => {
      const orderedQty = Number(item.qty || 0)
      const receivedQty = item.received_qty != null ? Number(item.received_qty) : orderedQty
      return sum + Math.max(orderedQty - receivedQty, 0) * Number(item.unit_price || 0)
    }, 0)

    const missingItems = detailRows.reduce((sum, item) => {
      const orderedQty = Number(item.qty || 0)
      const receivedQty = item.received_qty != null ? Number(item.received_qty) : orderedQty
      return sum + (orderedQty > receivedQty ? 1 : 0)
    }, 0)

    const receivedAmount = detailRows.reduce((sum, item) => {
      const receivedQty =
        item.received_qty != null ? Number(item.received_qty) : Number(item.qty || 0)
      return sum + receivedQty * Number(item.unit_price || 0)
    }, 0)

    // Use import_fee_total from orders table (already set by admin)
    res.json({
      ...order,
      items: detailRows,
      import_fee_total: order.import_fee_total !== undefined ? Number(order.import_fee_total) : 0,
      missing_amount: missingAmount,
      missing_items: missingItems,
      received_amount: receivedAmount,
      saved_shipping: savedShipping,
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

    // Verify this is a preorder order in the correct state
    const [orderRows] = await connection.query(
      `SELECT order_id, status, Order_type FROM orders WHERE order_id = ? LIMIT 1`,
      [order_id],
    )
    if (orderRows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบออเดอร์' })
    }

    // Get all preorder items in this order
    const [detailRows] = await connection.query(
      `SELECT detail_id, qty FROM order_details
       WHERE order_id = ? AND item_type = 'preorder'
       ORDER BY detail_id ASC`,
      [order_id],
    )
    if (detailRows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบรายการพรีออเดอร์ในออเดอร์นี้' })
    }

    // Distribute the total fee by ordered quantity, not by line count.
    const totalOrderedQty = detailRows.reduce((sum, row) => sum + Math.max(Number(row.qty) || 0, 0), 0)
    let allocatedFee = 0
    for (const [index, row] of detailRows.entries()) {
      const isLast = index === detailRows.length - 1
      const perItemFee = isLast
        ? Math.max(Math.round((importFee - allocatedFee) * 100) / 100, 0)
        : Math.round((importFee * (Math.max(Number(row.qty) || 0, 0) / (totalOrderedQty || 1))) * 100) / 100
      allocatedFee += isLast ? 0 : perItemFee
      await connection.query('UPDATE order_details SET Import_fee = ? WHERE detail_id = ?', [
        perItemFee,
        row.detail_id,
      ])
    }

    // Save import_fee_total on the order so user can see the amount due in round 2.
    // Do NOT change total_amount or order status — that happens only on round-2 approval.
    await connection.query('UPDATE orders SET import_fee_total = ? WHERE order_id = ?', [
      importFee,
      order_id,
    ])

    await connection.commit()
    res.json({ success: true, order_id: Number(order_id), import_fee_total: importFee })
  } catch (err) {
    await connection.rollback()
    console.error('[PATCH /api/orders/:order_id/import-fee]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกค่านำเข้า' })
  } finally {
    connection.release()
  }
})

// ─────────────────────────────────────────────
// PATCH /api/orders/:order_id/status
// อัปเดตสถานะออเดอร์ (ใช้เมื่อแอดมินปฏิเสธสลิป → Invalid slip)
// ─────────────────────────────────────────────
router.patch('/:order_id/status', async (req, res) => {
  const { order_id } = req.params
  const { status } = req.body || {}

  const ALLOWED_STATUSES = [
    'Pending',
    'Slip_submitted',
    'Paid',
    'Wait_for_Import_Fee',
    'Pending_import_fee',
    'Import_slip_submitted',
    'Ready_to_Ship',
    'Cancelled',
    'Invalid slip',
    'Invalid_Slip',
    'Invalid import slip',
  ]

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status ต้องเป็นหนึ่งใน: ${ALLOWED_STATUSES.join(', ')}`,
    })
  }

  try {
    const db = getDB(req)
    // ดึงประเภทออเดอร์ก่อน
    const [orderRows] = await db.query('SELECT Order_type FROM orders WHERE order_id = ? LIMIT 1', [
      order_id,
    ])
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }
    const orderType = String(orderRows[0].Order_type || '').toLowerCase()

    // เฉพาะ Preorder เท่านั้นที่อนุญาต Wait_for_Import_Fee, Paid (2 รอบ)
    if (
      [
        'Wait_for_Import_Fee',
        'Pending_import_fee',
        'Import_slip_submitted',
        'Slip_submitted',
        'Paid',
      ].includes(status) &&
      orderType !== 'preorder'
    ) {
      return res
        .status(400)
        .json({ error: 'อนุญาตเฉพาะออเดอร์ประเภท Preorder เท่านั้นสำหรับสถานะนี้' })
    }

    // อื่นๆ (Ready, ฯลฯ) อนุญาตเฉพาะ Pending, Ready_to_Ship, Cancelled, Invalid slip
    if (
      orderType !== 'preorder' &&
      [
        'Wait_for_Import_Fee',
        'Pending_import_fee',
        'Import_slip_submitted',
        'Slip_submitted',
        'Paid',
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          'เฉพาะ Preorder เท่านั้นที่เปลี่ยนสถานะเป็น Wait_for_Import_Fee, Pending_import_fee, Slip_submitted, Import_slip_submitted หรือ Paid ได้',
      })
    }

    const [result] = await db.query('UPDATE orders SET status = ? WHERE order_id = ?', [
      status,
      order_id,
    ])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }

    res.json({ success: true, order_id: Number(order_id), status })
  } catch (err) {
    console.error('[PATCH /api/orders/:order_id/status]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะออเดอร์' })
  }
})

// ─────────────────────────────────────────────
// PATCH /api/orders/:order_id/reject-slip
// แอดมินปฏิเสธสลิป — ระบบตรวจสอบ order status เอง
// ถ้าเป็นรอบค่านำเข้า (Import_slip_submitted / Pending_import_fee)
//   → Invalid import slip
// ถ้าเป็นรอบแรก (Slip_submitted / Pending ฯลฯ)
//   → Invalid slip
// ─────────────────────────────────────────────
router.patch('/:order_id/reject-slip', async (req, res) => {
  const { order_id } = req.params

  try {
    const db = getDB(req)
    const [rows] = await db.query('SELECT status FROM orders WHERE order_id = ? LIMIT 1', [
      order_id,
    ])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }

    const currentStatus = String(rows[0].status || '').trim()
    const isImportFeeRound = ['Pending_import_fee', 'Import_slip_submitted'].includes(currentStatus)
    const nextStatus = isImportFeeRound ? 'Invalid import slip' : 'Invalid slip'

    await db.query('UPDATE orders SET status = ? WHERE order_id = ?', [nextStatus, order_id])

    res.json({ success: true, order_id: Number(order_id), status: nextStatus })
  } catch (err) {
    console.error('[PATCH /api/orders/:order_id/reject-slip]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' })
  }
})

export default router
