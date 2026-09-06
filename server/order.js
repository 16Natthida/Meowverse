// routes/order.js
// Clean order router for checkout, listing, details, and import-fee updates.

import express from 'express'

const router = express.Router()

const SHIPPING_FEES = Object.freeze({
  preorder: 65,
  ready: 49,
})
const READY_PAYMENT_RESERVATION_MS = 15 * 60 * 1000

function getShippingFee(items) {
  const hasPreorder = items.some(isPreorderItem)

  return hasPreorder ? SHIPPING_FEES.preorder : SHIPPING_FEES.ready
}

function isPreorderItem(item) {
  const itemType = String(item.item_type || '').toLowerCase()
  if (itemType === 'preorder' || item.preorder_round_id) return true

  return Number(item.preorderEnabled) === 1 && Number(item.readyToShipEnabled) !== 1
}

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
    'SELECT order_id, status, deadline, Order_type FROM orders WHERE order_id = ? LIMIT 1 FOR UPDATE',
    [orderId],
  )
  if (rows.length === 0) return null

  const order = rows[0]
  if (!order.deadline) return order

  const deadlineTime = new Date(order.deadline).getTime()
  if (Number.isNaN(deadlineTime)) return order

  const cancellableStatuses = ['Pending']
  if (
    deadlineTime <= Date.now() &&
    String(order.Order_type || '').toLowerCase() === 'ready'
  ) {
    if (cancellableStatuses.includes(order.status)) {
      await restoreReadyOrderStock(connection, order.order_id)
    }
    if (['Pending', 'Cancelled'].includes(order.status)) {
      await deleteOrder(connection, orderId)
      return null
    }
  }

  return order
}

async function deleteOrder(connection, orderId) {
  await connection.query('DELETE FROM payment WHERE order_id = ?', [orderId])
  await connection.query('DELETE FROM shipping WHERE order_id = ?', [orderId])
  await connection.query('DELETE FROM order_details WHERE order_id = ?', [orderId])
  await connection.query('DELETE FROM orders WHERE order_id = ?', [orderId])
}

function parseFlavorStockMap(value) {
  if (!value) return {}

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).map(([flavor, qty]) => [
        String(flavor || '').trim(),
        Number(qty) || 0,
      ]),
    )
  } catch {
    return {}
  }
}

function getFlavorList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)

  const text = String(value || '').trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {
    // Fall back to line/comma separated input.
  }

  return text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

async function adjustReadyStock(connection, item, deltaQty) {
  const [rows] = await connection.query(
    'SELECT stock_qty, flavor_stock FROM products WHERE prod_id = ? LIMIT 1 FOR UPDATE',
    [item.prod_id],
  )
  if (rows.length === 0) return false

  const flavorKey = String(item.flavor || '').trim()
  const flavorStock = parseFlavorStockMap(rows[0].flavor_stock)
  if (flavorKey && Object.prototype.hasOwnProperty.call(flavorStock, flavorKey)) {
    flavorStock[flavorKey] = Math.max(0, (Number(flavorStock[flavorKey]) || 0) + deltaQty)
    const totalStock = Object.values(flavorStock).reduce((sum, qty) => sum + (Number(qty) || 0), 0)
    await connection.query(
      'UPDATE products SET stock_qty = ?, flavor_stock = ? WHERE prod_id = ?',
      [totalStock, JSON.stringify(flavorStock), item.prod_id],
    )
    return true
  }

  const nextStock = Math.max(0, (Number(rows[0].stock_qty) || 0) + deltaQty)
  await connection.query('UPDATE products SET stock_qty = ? WHERE prod_id = ?', [
    nextStock,
    item.prod_id,
  ])
  return true
}

export async function restoreReadyOrderStock(connection, orderId) {
  const [details] = await connection.query(
    `SELECT prod_id, qty, flavor
     FROM order_details
     WHERE order_id = ? AND LOWER(COALESCE(item_type, '')) = 'ready-to-ship'`,
    [orderId],
  )

  for (const item of details) {
    await adjustReadyStock(connection, item, Number(item.qty) || 0)
  }
}

export async function expirePendingReadyOrders(db) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query(
      `SELECT order_id, status
       FROM orders
       WHERE LOWER(Order_type) = 'ready'
         AND status IN ('Pending', 'Cancelled')
         AND deadline IS NOT NULL
         AND deadline <= NOW()
       FOR UPDATE`,
    )

    for (const order of orders) {
      if (order.status === 'Pending') {
        await restoreReadyOrderStock(connection, order.order_id)
      }
      await deleteOrder(connection, order.order_id)
    }

    await connection.commit()
    return orders.length
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
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
         COALESCE(prp.china_shipping_fee_thb, 0) AS china_shipping_fee_thb,
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
       LEFT JOIN preorder_rounds r ON r.round_id = c.preorder_round_id
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
    const subtotalAmount = cartItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * Number(item.qty || 0),
      0,
    )
    const hasPreorder = cartItems.some(
      isPreorderItem,
    )
    const orderType = hasPreorder ? 'Preorder' : 'Ready'
    const chinaShippingTotalThb = cartItems.reduce(
      (sum, item) => sum + (Number(item.china_shipping_fee_thb) || 0) * Number(item.qty || 0),
      0,
    )
    const shippingFee = getShippingFee(cartItems)
    const totalAmount = subtotalAmount + (hasPreorder ? chinaShippingTotalThb : shippingFee)

    await connection.commit()

    res.status(201).json({
      message: 'วาลิเดตออเดอร์สำเร็จ',
      cart_items: cartItems,
      order_type: orderType,
      subtotal_amount: subtotalAmount,
      shipping_fee: shippingFee,
      total_amount: totalAmount,
      china_shipping_total_thb: chinaShippingTotalThb,
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
    } catch {
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
         COALESCE(prp.china_shipping_fee_thb, 0) AS china_shipping_fee_thb,
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
       LEFT JOIN preorder_rounds r ON r.round_id = c.preorder_round_id
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

    // Reserve ready-to-ship stock while the payment page is open.
    for (const item of mergedItems) {
      if (String(item.item_type || '').toLowerCase() !== 'ready-to-ship') continue

      const [productRows] = await connection.query(
        `SELECT stock_qty, flavors, flavor_stock
         FROM products
         WHERE prod_id = ?
         LIMIT 1
         FOR UPDATE`,
        [item.prod_id],
      )
      const product = productRows[0]
      if (!product) {
        await connection.rollback()
        return res.status(400).json({ error: `ไม่พบสินค้า "${item.name}"` })
      }

      const flavor = String(item.flavor || '').trim()
      const flavorStock = parseFlavorStockMap(product.flavor_stock)
      const hasFlavorStock = flavor && Object.prototype.hasOwnProperty.call(flavorStock, flavor)
      const availableQty = hasFlavorStock
        ? Number(flavorStock[flavor]) || 0
        : Number(product.stock_qty) || 0

      if (Number(item.qty) > availableQty) {
        await connection.rollback()
        return res.status(400).json({
          error: hasFlavorStock
            ? `ขออภัย รสชาติ "${flavor}" มีสต็อกเหลือเพียง ${availableQty} ชิ้น`
            : `สินค้า "${item.name}" มีสต็อกไม่เพียงพอ (เหลือ ${availableQty} ชิ้น)`,
        })
      }

      await adjustReadyStock(connection, item, -Number(item.qty))
    }

    // ใช้ราคาจาก query (calculated price) ของรายการที่รวมแล้ว
    const subtotalAmount = mergedItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * Number(item.qty || 0),
      0,
    )
    const hasPreorder = mergedItems.some(
      isPreorderItem,
    )
    const chinaShippingTotalThb = mergedItems.reduce(
      (sum, item) => sum + (Number(item.china_shipping_fee_thb) || 0) * Number(item.qty || 0),
      0,
    )
    // ถ้าเป็นการชำระรอบ 2 (import fee) ให้ตั้ง orderType = 'Pending_import'
    let orderType = hasPreorder ? 'Preorder' : 'Ready'
    // ตรวจสอบว่ามี import_fee_total > 0 และสถานะออเดอร์เป็น Wait_for_Import_Fee (รอบ 2)
    // (สมมติว่ามี logic ตรวจสอบจากฝั่ง client หรือส่ง flag มาด้วย)
    if (hasPreorder && req.body.is_import_fee_round) {
      orderType = 'Pending_import'
    }

    const shippingFee = getShippingFee(mergedItems)
    const totalAmount = subtotalAmount + (hasPreorder ? chinaShippingTotalThb : shippingFee)
    const deadline = !hasPreorder
      ? new Date(Date.now() + READY_PAYMENT_RESERVATION_MS)
      : null

    const [orderResult] = await connection.query(
      `INSERT INTO orders
         (user_id, total_amount, shipping_fee, status, Order_type,
          deadline, china_shipping_total_thb)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        totalAmount,
        shippingFee,
        'Pending',
        orderType,
        deadline,
        chinaShippingTotalThb,
      ],
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

      columns.push('china_shipping_fee_thb')
      values.push(Number(item.china_shipping_fee_thb) || 0)

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
      subtotal_amount: subtotalAmount,
      shipping_fee: shippingFee,
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

  const normalizedPhone = String(contact_phone || '').replace(/\D/g, '')
  if (!normalizedPhone || !/^0\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'กรุณากรอกเบอร์ติดต่อให้ครบ 10 หลัก (ตัวเลขเท่านั้น)' })
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
      normalizedPhone,
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
         p.Post_date AS created_at,
         o.total_amount,
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
      `SELECT order_id, user_id, total_amount, shipping_fee, import_fee_total,
              china_shipping_total_thb, status, deadline, Order_type, Order_date,
              (
                SELECT COALESCE(sp.provider_name, s.Shipping_Carrier)
                FROM shipping s
                LEFT JOIN shipping_providers sp ON sp.provider_id = s.provider_id
                WHERE s.order_id = orders.order_id
                ORDER BY s.ship_id DESC
                LIMIT 1
              ) AS shipping_provider_name,
              (
                SELECT s.tracking_number
                FROM shipping s
                WHERE s.order_id = orders.order_id
                ORDER BY s.ship_id DESC
                LIMIT 1
              ) AS tracking_number,
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

// PATCH /api/orders/:order_id/confirm-receipt
// ลูกค้ายืนยันว่าได้รับสินค้าแล้ว ระบบจะเปลี่ยนสถานะเป็น Delivered
router.patch('/:order_id/confirm-receipt', async (req, res) => {
  const { order_id } = req.params
  const userId = Number(req.body?.user_id)

  if (!userId) {
    return res.status(400).json({ error: 'ไม่พบผู้ใช้ที่ยืนยันการรับสินค้า' })
  }

  const connection = await getDB(req).getConnection()
  try {
    await connection.beginTransaction()

    const [rows] = await connection.query(
      `SELECT o.order_id, o.user_id, o.status, s.ship_id
       FROM orders o
       LEFT JOIN shipping s ON s.order_id = o.order_id
       WHERE o.order_id = ?
       ORDER BY s.ship_id DESC
       LIMIT 1`,
      [order_id],
    )

    if (rows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }

    const order = rows[0]
    if (Number(order.user_id) !== userId) {
      await connection.rollback()
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยืนยันออเดอร์นี้' })
    }

    if (String(order.status || '').trim().toLowerCase() !== 'shipped') {
      await connection.rollback()
      return res.status(409).json({ error: 'ออเดอร์นี้ยังไม่อยู่ในสถานะจัดส่งแล้ว' })
    }

    if (!order.ship_id) {
      await connection.rollback()
      return res.status(409).json({ error: 'ยังไม่พบข้อมูลการจัดส่งของออเดอร์นี้' })
    }

    await connection.query(
      `UPDATE shipping
       SET shipping_status = 'delivered',
           delivered_at = COALESCE(delivered_at, NOW()),
           customer_confirmed_at = NOW(),
           customer_confirmed_by = ?
       WHERE ship_id = ?`,
      [userId, order.ship_id],
    )
    await connection.query(
      `UPDATE orders
       SET status = 'Delivered'
       WHERE order_id = ? AND status = 'Shipped'`,
      [order_id],
    )

    await connection.commit()
    res.json({ success: true, order_id: Number(order_id), status: 'Delivered' })
  } catch (err) {
    await connection.rollback()
    console.error('[PATCH /api/orders/:order_id/confirm-receipt]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการยืนยันการรับสินค้า' })
  } finally {
    connection.release()
  }
})

router.get('/:order_id', async (req, res) => {
  const { order_id } = req.params

  try {
    const db = getDB(req)
    const expiryConnection = await db.getConnection()
    try {
      await expiryConnection.beginTransaction()
      await maybeExpireOrder(expiryConnection, order_id)
      await expiryConnection.commit()
    } catch (expiryError) {
      await expiryConnection.rollback()
      throw expiryError
    } finally {
      expiryConnection.release()
    }

    const [orderRows] = await db.query(
      `SELECT o.order_id, o.user_id, o.total_amount, o.shipping_fee, o.status, o.deadline, o.Order_type, o.Order_date, o.import_fee_total,
              o.china_shipping_total_thb, a.username,
              (SELECT LOWER(pr.status)
               FROM preorder_rounds pr
               JOIN order_details od_round ON od_round.preorder_round_id = pr.round_id
               WHERE od_round.order_id = o.order_id
               ORDER BY pr.round_id DESC
               LIMIT 1) AS preorder_round_status,
              s.name AS shipping_name, s.phone AS shipping_phone, s.address AS shipping_address, s.notes AS shipping_notes, s.Shipping_Carrier,
              s.provider_id, sp.provider_code, sp.provider_name, s.tracking_number, s.tracking_url,
              s.shipping_status, s.shipped_at, s.delivered_at,
              o.split_parent_order_id
       FROM orders o
       LEFT JOIN accounts a ON o.user_id = a.user_id
       LEFT JOIN shipping s ON o.order_id = s.order_id
       LEFT JOIN shipping_providers sp ON s.provider_id = sp.provider_id
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
      provider_id: order.provider_id || null,
      provider_code: order.provider_code || null,
      provider_name: order.provider_name || null,
      tracking_number: order.tracking_number || null,
      tracking_url: order.tracking_url || null,
      shipping_status: order.shipping_status || 'pending',
      shipped_at: order.shipped_at || null,
      delivered_at: order.delivered_at || null,
      // slip แยกตาม type ให้ frontend ใช้ตัดสินใจเอง
      slip_url: orderFeePayment?.slip_img || null, // สลิปรอบแรก (Order_fee)
      import_fee_slip_url: importFeePayment?.slip_img || null, // สลิปรอบค่านำเข้า
      payment_method: latestPayment?.payment_method || null,
      payment_status: latestPayment?.status || null,
    }

    const [detailRows] = await db.query(
      `SELECT od.detail_id, od.prod_id, od.flavor, od.Price AS unit_price, od.qty, od.received_qty, od.arrival_status,
       od.Import_fee AS import_fee, od.china_shipping_fee_thb,
       od.item_type, od.preorder_round_id, p.prod_name AS name, c.cat_name AS category_name,
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
         AND od.qty > 0
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
        : Math.round(
            (importFee * (Math.max(Number(row.qty) || 0, 0) / (totalOrderedQty || 1))) * 100,
          ) / 100
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
// PATCH /api/orders/:order_id/cancel
// ผู้ใช้กดยกเลิกออเดอร์เอง (ก่อนชำระเงินสำเร็จ)
// คืนสินค้าเข้าสต็อกและลบออเดอร์แบบเดียวกับตอนออเดอร์หมดเวลา (maybeExpireOrder)
// ─────────────────────────────────────────────
router.patch('/:order_id/cancel', async (req, res) => {
  const { order_id } = req.params
  const db = getDB(req)
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const [orderRows] = await connection.query(
      'SELECT order_id, status, Order_type FROM orders WHERE order_id = ? LIMIT 1 FOR UPDATE',
      [order_id],
    )
    if (orderRows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'ไม่พบออเดอร์ที่ระบุ' })
    }

    const order = orderRows[0]
    const normalizedStatus = String(order.status || '')
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, ' ')
    // อนุญาตให้ยกเลิกได้เฉพาะก่อนที่แอดมินจะยืนยันการชำระเงิน
    const cancellableStatuses = ['pending', 'slip submitted', 'invalid slip']

    if (!cancellableStatuses.includes(normalizedStatus)) {
      await connection.rollback()
      return res.status(400).json({
        error: 'ไม่สามารถยกเลิกออเดอร์นี้ได้ เนื่องจากออเดอร์ถูกดำเนินการไปแล้ว',
      })
    }

    // คืนสต็อกเฉพาะรายการพร้อมส่ง (ready-to-ship) เหมือนตอนหมดเวลาการจอง
    if (String(order.Order_type || '').toLowerCase() === 'ready') {
      await restoreReadyOrderStock(connection, order.order_id)
    }

    await deleteOrder(connection, order.order_id)

    await connection.commit()
    res.json({ success: true, order_id: Number(order_id), status: 'Cancelled' })
  } catch (err) {
    await connection.rollback()
    console.error('[PATCH /api/orders/:order_id/cancel]', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการยกเลิกออเดอร์' })
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