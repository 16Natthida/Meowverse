// routes/cart.js
// Express router สำหรับ Cart API
// ตาราง: cart (cart_id, user_id, prod_id, qty)
//
// วิธีใช้ใน app.js / server.js:
//   import cartRouter from './cart.js'
//   app.use('/api/cart', cartRouter)

import express from 'express'
const router = express.Router()

// ── ดึง db connection จาก app locals (หรือ import ตรงก็ได้) ──
// สมมติใช้ mysql2/promise pool ชื่อ `db` ที่ set ไว้ใน app.locals
// ถ้าใช้วิธีอื่นให้แก้ส่วนนี้ตามโปรเจกต์
function getDB(req) {
  return req.app.locals.db
}

// ─────────────────────────────────────────────
// GET /api/cart?user_id=xxx
// ดึงรายการตะกร้าของ user พร้อม join ข้อมูลสินค้า
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { user_id } = req.query
  if (!user_id) return res.status(400).json({ error: 'user_id is required' })

  try {
    const db = getDB(req)

    // JOIN กับ products เพื่อดึงชื่อ ราคา รูปภาพ
    const [rows] = await db.query(
      `SELECT
         c.cart_id,
         c.user_id,
         c.prod_id,
         c.qty,
         p.prod_name AS name,
         p.base_price AS price,
         p.image_url AS image,
         p.stock_qty AS stock
       FROM cart c
       LEFT JOIN products p ON c.prod_id = p.prod_id
       WHERE c.user_id = ?
       ORDER BY c.cart_id DESC`,
      [user_id],
    )

    res.json(rows)
  } catch (err) {
    console.error('[GET /api/cart]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────
// POST /api/cart
// เพิ่มสินค้าลงตะกร้า (ถ้ามีอยู่แล้วให้ +qty)
// Body: { user_id, prod_id, qty }
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { user_id, prod_id, qty = 1 } = req.body

  if (!user_id) return res.status(400).json({ error: 'user_id is required' })
  if (!prod_id) {
    return res.status(400).json({ error: 'prod_id is required' })
  }

  try {
    const db = getDB(req)

    // เช็คว่ามีในตะกร้าแล้วหรือยัง
    const [existing] = await db.query(
      `SELECT cart_id, qty FROM cart
       WHERE user_id = ? AND prod_id = ?
       LIMIT 1`,
      [user_id, prod_id],
    )

    if (existing.length > 0) {
      // มีอยู่แล้ว → เพิ่ม qty
      const newQty = existing[0].qty + Number(qty)
      await db.query('UPDATE cart SET qty = ? WHERE cart_id = ?', [newQty, existing[0].cart_id])
      return res.json({ message: 'Updated qty', cart_id: existing[0].cart_id, qty: newQty })
    }

    // ไม่มี → insert ใหม่
    const [result] = await db.query('INSERT INTO cart (user_id, prod_id, qty) VALUES (?, ?, ?)', [
      user_id,
      prod_id,
      Number(qty),
    ])

    res.status(201).json({ message: 'Added to cart', cart_id: result.insertId })
  } catch (err) {
    console.error('[POST /api/cart]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────
// PUT /api/cart/:cart_id
// อัปเดตจำนวนสินค้า
// Body: { qty }
// ─────────────────────────────────────────────
router.put('/:cart_id', async (req, res) => {
  const { cart_id } = req.params
  const { qty } = req.body

  if (!qty || Number(qty) < 1) {
    return res.status(400).json({ error: 'qty must be >= 1' })
  }

  try {
    const db = getDB(req)
    const [result] = await db.query('UPDATE cart SET qty = ? WHERE cart_id = ?', [
      Number(qty),
      cart_id,
    ])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    res.json({ message: 'Updated', cart_id: Number(cart_id), qty: Number(qty) })
  } catch (err) {
    console.error('[PUT /api/cart/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────
// DELETE /api/cart/:cart_id
// ลบสินค้าออกจากตะกร้า
// ─────────────────────────────────────────────
router.delete('/:cart_id', async (req, res) => {
  const { cart_id } = req.params

  try {
    const db = getDB(req)
    const [result] = await db.query('DELETE FROM cart WHERE cart_id = ?', [cart_id])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    res.json({ message: 'Deleted', cart_id: Number(cart_id) })
  } catch (err) {
    console.error('[DELETE /api/cart/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
