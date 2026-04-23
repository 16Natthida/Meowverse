// routes/cart.js
// Express router สำหรับ Cart API
// ตาราง: cart (cart_id, user_id, prod_id, qty)
//
// วิธีใช้ใน app.js / server.js:
//   import cartRouter from './cart.js'
//   app.use('/api/cart', cartRouter)

import express from 'express'
const router = express.Router()

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

function getFallbackItemType(productRow) {
  if (Number(productRow?.readyToShipEnabled) === 1) {
    return 'ready-to-ship'
  }

  if (Number(productRow?.preorderEnabled) === 1) {
    return 'preorder'
  }

  return ''
}

function parseFlavorList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }

  const text = String(value || '').trim()
  if (!text) {
    return []
  }

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // Fall back to line/comma separated input.
  }

  return text
    .split(/\r?\n|,/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeFlavor(value) {
  return String(value || '').trim()
}

async function getProductById(db, prodId) {
  const [rows] = await db.query(
    `SELECT
       p.prod_id AS prod_id,
       p.prod_name AS name,
       p.stock_qty AS stock,
       p.flavors AS flavors,
       p.preorder_enabled AS preorderEnabled,
       p.ready_to_ship_enabled AS readyToShipEnabled
     FROM products p
     WHERE p.prod_id = ?
     LIMIT 1`,
    [prodId],
  )

  return rows[0] || null
}

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
         c.flavor,
         COALESCE(c.item_type, CASE
           WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship'
           WHEN p.preorder_enabled = 1 THEN 'preorder'
           ELSE NULL
         END) AS item_type,
         p.prod_name AS name,
         p.base_price AS price,
         COALESCE(
           (
             SELECT pi.image_url
             FROM product_images pi
             WHERE pi.prod_id = p.prod_id
             ORDER BY pi.sort_order ASC, pi.img_id ASC
             LIMIT 1
           ),
           ''
         ) AS image,
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
  const { user_id, prod_id, qty = 1, item_type, flavor = '' } = req.body

  if (!user_id) return res.status(400).json({ error: 'user_id is required' })
  if (!prod_id) {
    return res.status(400).json({ error: 'prod_id is required' })
  }

  try {
    const db = getDB(req)
    const product = await getProductById(db, prod_id)

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const requestedType = normalizeItemType(item_type) || getFallbackItemType(product)
    const flavorList = parseFlavorList(product.flavors)
    const requestedFlavor = normalizeFlavor(flavor)
    const effectiveFlavor =
      flavorList.length > 0 ? requestedFlavor || flavorList[0] : requestedFlavor

    if (!requestedType) {
      return res.status(400).json({ error: 'Product is not available for cart' })
    }

    if (flavorList.length > 0 && !flavorList.includes(effectiveFlavor)) {
      return res.status(400).json({ error: 'Invalid flavor selection' })
    }

    if (requestedType === 'ready-to-ship' && Number(product.readyToShipEnabled) !== 1) {
      return res.status(400).json({ error: 'Product is not available for ready-to-ship' })
    }

    if (requestedType === 'preorder' && Number(product.preorderEnabled) !== 1) {
      return res.status(400).json({ error: 'Product is not available for preorder' })
    }

    if (requestedType === 'ready-to-ship' && Number(product.stock) < Number(qty)) {
      return res.status(400).json({ error: 'Not enough stock available' })
    }

    // เช็คว่ามีในตะกร้าแล้วหรือยัง
    const [existing] = await db.query(
      `SELECT cart_id, qty, item_type, flavor FROM cart
       WHERE user_id = ? AND prod_id = ? AND COALESCE(flavor, '') = COALESCE(?, '')
       LIMIT 1`,
      [user_id, prod_id, effectiveFlavor],
    )

    if (existing.length > 0) {
      // มีอยู่แล้ว → เพิ่ม qty
      const newQty = existing[0].qty + Number(qty)
      if (requestedType === 'ready-to-ship' && newQty > Number(product.stock)) {
        return res.status(400).json({ error: 'Not enough stock available' })
      }

      await db.query('UPDATE cart SET qty = ?, item_type = ?, flavor = ? WHERE cart_id = ?', [
        newQty,
        existing[0].item_type || requestedType,
        effectiveFlavor || null,
        existing[0].cart_id,
      ])
      return res.json({ message: 'Updated qty', cart_id: existing[0].cart_id, qty: newQty })
    }

    // ไม่มี → insert ใหม่
    const [result] = await db.query(
      'INSERT INTO cart (user_id, prod_id, qty, item_type, flavor) VALUES (?, ?, ?, ?, ?)',
      [user_id, prod_id, Number(qty), requestedType, effectiveFlavor || null],
    )

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
    const [cartRows] = await db.query(
      `SELECT
         c.cart_id,
         c.qty,
         c.item_type,
        c.flavor,
         p.stock_qty AS stock,
        p.flavors AS flavors,
         p.preorder_enabled AS preorderEnabled,
         p.ready_to_ship_enabled AS readyToShipEnabled
       FROM cart c
       LEFT JOIN products p ON p.prod_id = c.prod_id
       WHERE c.cart_id = ?
       LIMIT 1`,
      [cart_id],
    )

    const cartRow = cartRows[0]
    if (!cartRow) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    const effectiveType = normalizeItemType(cartRow.item_type) || getFallbackItemType(cartRow)
    const flavorList = parseFlavorList(cartRow.flavors)
    const currentFlavor = normalizeFlavor(cartRow.flavor)
    if (flavorList.length > 0 && currentFlavor && !flavorList.includes(currentFlavor)) {
      return res.status(400).json({ error: 'Invalid flavor selection' })
    }

    if (effectiveType === 'ready-to-ship' && Number(qty) > Number(cartRow.stock)) {
      return res.status(400).json({ error: 'Not enough stock available' })
    }

    if (effectiveType === 'preorder' && Number(cartRow.preorderEnabled) !== 1) {
      return res.status(400).json({ error: 'Product is not available for preorder' })
    }

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
