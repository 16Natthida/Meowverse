import express from 'express'

const router = express.Router()

function requireAdmin(req, res, next) {
  const role = String(req.headers['x-user-role'] || '').trim().toLowerCase()
  if (!role) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin only' })
  next()
}

router.use(requireAdmin)

function normalizeProviderPayload(body = {}) {
  return {
    provider_code: String(body.provider_code || '').trim().toLowerCase(),
    provider_name: String(body.provider_name || '').trim(),
    tracking_url_template: String(body.tracking_url_template || '').trim() || null,
    is_active: body.is_active === false || body.is_active === 0 ? 0 : 1,
  }
}

// GET /api/admin/shipping-providers
router.get('/shipping-providers', async (req, res) => {
  const pool = req.app.locals.db
  try {
    const [rows] = await pool.query(
      `SELECT provider_id, provider_code, provider_name, tracking_url_template, is_active
       FROM shipping_providers
       ORDER BY is_active DESC, provider_name ASC`,
    )
    res.json(rows)
  } catch (error) {
    console.error('Shipping providers API Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/shipping-providers
router.post('/shipping-providers', async (req, res) => {
  const pool = req.app.locals.db
  const provider = normalizeProviderPayload(req.body)
  if (!provider.provider_code || !provider.provider_name) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสและชื่อบริษัทขนส่ง' })
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO shipping_providers
        (provider_code, provider_name, tracking_url_template, is_active)
       VALUES (?, ?, ?, ?)`,
      [provider.provider_code, provider.provider_name, provider.tracking_url_template, provider.is_active],
    )
    const [rows] = await pool.query(
      `SELECT provider_id, provider_code, provider_name, tracking_url_template, is_active
       FROM shipping_providers WHERE provider_id = ?`,
      [result.insertId],
    )
    res.status(201).json(rows[0])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'มีรหัสบริษัทขนส่งนี้อยู่แล้ว' })
    }
    console.error('Create shipping provider error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/admin/shipping-providers/:providerId
router.patch('/shipping-providers/:providerId', async (req, res) => {
  const pool = req.app.locals.db
  const providerId = Number(req.params.providerId)
  const provider = normalizeProviderPayload(req.body)
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return res.status(400).json({ error: 'รหัสบริษัทขนส่งไม่ถูกต้อง' })
  }
  if (!provider.provider_code || !provider.provider_name) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสและชื่อบริษัทขนส่ง' })
  }

  try {
    const [result] = await pool.query(
      `UPDATE shipping_providers
       SET provider_code = ?, provider_name = ?, tracking_url_template = ?, is_active = ?
       WHERE provider_id = ?`,
      [
        provider.provider_code,
        provider.provider_name,
        provider.tracking_url_template,
        provider.is_active,
        providerId,
      ],
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'ไม่พบบริษัทขนส่ง' })
    res.json({ success: true })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'มีรหัสบริษัทขนส่งนี้อยู่แล้ว' })
    }
    console.error('Update shipping provider error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/shipping/shipping-orders
// ดึงรายการออเดอร์ที่พร้อมจัดส่ง / กำลังจัดส่ง / นำจ่ายแล้ว (Paid / Ready_to_Ship / Shipped / Delivered)
// ─────────────────────────────────────────────
router.get('/shipping-orders', async (req, res) => {
  const pool = req.app.locals.db
  try {
    const sql = `
      SELECT 
        o.order_id, o.Order_type, o.Order_date, o.total_amount, o.status,
        s.name, s.phone, s.notes, s.address, s.Shipping_Carrier,
        s.provider_id, sp.provider_code, sp.provider_name, s.tracking_number,
        s.tracking_url, s.shipping_status, s.shipped_at,
        od.detail_id, od.flavor, od.qty, od.received_qty, od.arrival_status,
        p.prod_name
      FROM orders o
      JOIN shipping s ON o.order_id = s.order_id
      JOIN order_details od ON o.order_id = od.order_id
       LEFT JOIN products p ON od.prod_id = p.prod_id
       LEFT JOIN shipping_providers sp ON s.provider_id = sp.provider_id
       WHERE o.status IN ('Paid', 'Ready_to_Ship', 'Shipped', 'Delivered')
        AND od.qty > 0
        AND LOWER(COALESCE(od.arrival_status, '')) NOT IN ('delayed', 'missing')
        AND s.ship_id = (
          SELECT MAX(ship_id)
          FROM shipping s2
          WHERE s2.order_id = o.order_id
        )
      ORDER BY o.Order_date DESC
    `

    const [rows] = await pool.query(sql)

    // จัดกลุ่ม details เป็น array ซ้อนอยู่ใน order
    const formattedOrders = rows.reduce((acc, row) => {
      let order = acc.find((o) => o.order_id === row.order_id)
      if (!order) {
        order = {
          order_id: row.order_id,
          Order_type: row.Order_type,
          Order_date: row.Order_date,
          total_amount: row.total_amount,
          status: row.status,
          name: row.name,
          phone: row.phone,
          notes: row.notes,
          address: row.address,
          Shipping_Carrier: row.Shipping_Carrier,
          provider_id: row.provider_id,
          provider_code: row.provider_code,
          provider_name: row.provider_name,
          tracking_number: row.tracking_number,
          tracking_url: row.tracking_url,
          shipping_status: row.shipping_status,
          shipped_at: row.shipped_at,
          details: [],
        }
        acc.push(order)
      }
      order.details.push({
        detail_id: row.detail_id,
        prod_name: row.prod_name,
        flavor: row.flavor,
        qty: row.qty,
        received_qty: row.received_qty,
        arrival_status: row.arrival_status,
      })
      return acc
    }, [])

    res.json(formattedOrders)
  } catch (error) {
    console.error('Shipping API Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/admin/orders/:orderId/shipment
// บันทึกเลขพัสดุและสถานะการจัดส่งที่แอดมินเป็นผู้กรอก
router.patch('/orders/:orderId/shipment', async (req, res) => {
  const pool = req.app.locals.db
  const orderId = Number(req.params.orderId)
  const providerId = Number(req.body.provider_id)
  const trackingNumber = String(req.body.tracking_number || '').trim()
  const requestedStatus = String(req.body.shipping_status || '').trim().toLowerCase()

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' })
  }
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return res.status(400).json({ error: 'กรุณาเลือกบริษัทขนส่ง' })
  }
  if (!trackingNumber) {
    return res.status(400).json({ error: 'กรุณาระบุเลขพัสดุ' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [providerRows] = await connection.query(
      `SELECT provider_id, provider_name
       FROM shipping_providers WHERE provider_id = ? AND is_active = 1`,
      [providerId],
    )
    if (providerRows.length === 0) throw new Error('ไม่พบบริษัทขนส่งที่เปิดใช้งาน')
    const provider = providerRows[0]

    const [orderRows] = await connection.query(
      `SELECT order_id, status FROM orders WHERE order_id = ? FOR UPDATE`,
      [orderId],
    )
    if (orderRows.length === 0) throw new Error('ไม่พบคำสั่งซื้อ')
    if (String(orderRows[0].status || '').toLowerCase() === 'cancelled') {
      await connection.rollback()
      return res.status(400).json({ error: 'ไม่สามารถอัปเดตการจัดส่งของออเดอร์ที่ยกเลิกแล้ว' })
    }

    const [shippingRows] = await connection.query(
      `SELECT ship_id, provider_id, Shipping_Carrier
       FROM shipping WHERE order_id = ? ORDER BY ship_id DESC LIMIT 1 FOR UPDATE`,
      [orderId],
    )
    const currentShipping = shippingRows[0] || {}
    const finalProviderId = provider?.provider_id || currentShipping.provider_id || null
    const finalCarrier = provider?.provider_name || currentShipping.Shipping_Carrier || null
    const shippingStatus = requestedStatus === 'delivered' ? 'delivered' : 'shipped'
    const orderStatus = shippingStatus === 'delivered' ? 'Delivered' : 'Shipped'
    const shippedAt = shippingStatus === 'shipped' ? new Date() : null
    const deliveredAt = shippingStatus === 'delivered' ? new Date() : null
    const updatedBy = Number(req.headers['x-user-id']) || null

    if (shippingRows.length > 0) {
      await connection.query(
        `UPDATE shipping
         SET provider_id = ?, Shipping_Carrier = ?, tracking_number = ?, tracking_url = NULL,
             shipping_status = ?, shipped_at = COALESCE(shipped_at, ?), delivered_at = ?,
             updated_by = ?, updated_at = NOW()
         WHERE ship_id = ?`,
        [
          finalProviderId,
          finalCarrier,
          trackingNumber,
          shippingStatus,
          shippedAt,
          deliveredAt,
          updatedBy,
          shippingRows[0].ship_id,
        ],
      )
    } else {
      await connection.query(
        `INSERT INTO shipping
          (order_id, provider_id, Shipping_Carrier, tracking_number,
           shipping_status, shipped_at, delivered_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          orderId,
          finalProviderId,
          finalCarrier,
          trackingNumber,
          shippingStatus,
          shippedAt,
          deliveredAt,
          updatedBy,
        ],
      )
    }

    await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [orderStatus, orderId])
    await connection.commit()
    res.json({
      success: true,
      order_id: orderId,
      shipping_status: shippingStatus,
      tracking_number: trackingNumber,
    })
  } catch (error) {
    await connection.rollback()
    console.error('Update shipment error:', error)
    res.status(500).json({ error: error.message })
  } finally {
    connection.release()
  }
})

// ─────────────────────────────────────────────
// PATCH /api/shipping/orders/:orderId/status
// อัปเดตสถานะออเดอร์ (เช่น Ready_to_Ship)
// ─────────────────────────────────────────────
router.patch('/orders/:orderId/status', async (req, res) => {
  const pool = req.app.locals.db
  const { orderId } = req.params
  const { status } = req.body

  try {
    const [result] = await pool.query('UPDATE orders SET status = ? WHERE order_id = ?', [
      status,
      orderId,
    ])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบรหัสคำสั่งซื้อนี้' })
    }

    res.json({ message: 'อัปเดตสถานะสำเร็จ', order_id: orderId })
  } catch (error) {
    console.error('Update Status Error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router