import express from 'express'

const router = express.Router()

// ─────────────────────────────────────────────
// GET /api/shipping/shipping-orders
// ดึงรายการออเดอร์ที่พร้อมจัดส่ง (Paid / Ready_to_Ship)
// ─────────────────────────────────────────────
router.get('/shipping-orders', async (req, res) => {
  const pool = req.app.locals.db
  try {
    const sql = `
      SELECT 
        o.order_id, o.Order_type, o.Order_date, o.total_amount, o.status,
        s.name, s.phone, s.notes, s.address, s.Shipping_Carrier,
        od.detail_id, od.flavor, od.qty,
        p.prod_name
      FROM orders o
      JOIN shipping s ON o.order_id = s.order_id
      JOIN order_details od ON o.order_id = od.order_id
      LEFT JOIN products p ON od.prod_id = p.prod_id
      WHERE o.status IN ('Paid', 'Ready_to_Ship')
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
          details: [],
        }
        acc.push(order)
      }
      order.details.push({
        detail_id: row.detail_id,
        prod_name: row.prod_name,
        flavor: row.flavor,
        qty: row.qty,
      })
      return acc
    }, [])

    res.json(formattedOrders)
  } catch (error) {
    console.error('Shipping API Error:', error)
    res.status(500).json({ error: error.message })
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