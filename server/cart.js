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

async function findActivePreorderRoundForProduct(db, prodId) {
  const [rows] = await db.query(
    `SELECT prp.round_id
     FROM preorder_round_products prp
     JOIN preorder_rounds r ON r.round_id = prp.round_id
     WHERE prp.prod_id = ?
       AND LOWER(r.status) IN ('active', 'open')
     ORDER BY r.start_date DESC, prp.round_id DESC
     LIMIT 1`,
    [prodId],
  )

  return rows[0]?.round_id || null
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

    // JOIN กับ products และ preorder_round_products เพื่อดึงชื่อ ราคา รูปภาพ
    const [rows] = await db.query(
      `SELECT
         c.cart_id,
         c.user_id,
         c.prod_id,
         c.qty,
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
         COALESCE(NULLIF(c.item_type, ''), CASE
           WHEN c.preorder_round_id IS NOT NULL THEN 'preorder'
           WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship'
           WHEN p.preorder_enabled = 1 THEN 'preorder'
           ELSE NULL
         END) AS item_type,
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
       LEFT JOIN preorder_round_products prp ON prp.round_id = c.preorder_round_id AND prp.prod_id = c.prod_id
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
// Body: { user_id, prod_id, qty, item_type, flavor, preorder_round_id }
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { user_id, prod_id, qty = 1, item_type, flavor = '', preorder_round_id } = req.body

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

    const requestedType = normalizeItemType(item_type)
    const fallbackType = requestedType || getFallbackItemType(product)
    const effectiveItemType = fallbackType || null
    const flavorList = parseFlavorList(product.flavors)
    const requestedFlavor = normalizeFlavor(flavor)
    const effectiveFlavor =
      flavorList.length > 0 ? requestedFlavor || flavorList[0] : requestedFlavor

    let resolvedPreorderRoundId = preorder_round_id || null
    if (requestedType === 'preorder') {
      if (!resolvedPreorderRoundId) {
        resolvedPreorderRoundId = await findActivePreorderRoundForProduct(db, prod_id)
      }

      if (!resolvedPreorderRoundId) {
        return res.status(400).json({ error: 'ไม่พบรอบพรีออเดอร์สำหรับสินค้านี้' })
      }

      await db.query(
        `UPDATE cart
         SET preorder_round_id = ?
         WHERE user_id = ?
           AND prod_id = ?
           AND item_type = 'preorder'
           AND COALESCE(flavor, '') = COALESCE(?, '')
           AND preorder_round_id IS NULL`,
        [resolvedPreorderRoundId, user_id, prod_id, effectiveFlavor || ''],
      )
    }

    // เช็คว่ามีในตะกร้าแล้วหรือยัง
    const [existing] = await db.query(
      `SELECT cart_id, qty, item_type, flavor FROM cart
       WHERE user_id = ?
         AND prod_id = ?
         AND COALESCE(NULLIF(item_type, ''), ?) = ?
         AND COALESCE(flavor, '') = COALESCE(?, '')
         AND COALESCE(preorder_round_id, 0) = COALESCE(?, 0)
       LIMIT 1`,
      [user_id, prod_id, effectiveItemType, effectiveItemType, effectiveFlavor, resolvedPreorderRoundId],
    )

    if (existing.length > 0) {
      // มีอยู่แล้ว → เพิ่ม qty
      const newQty = existing[0].qty + Number(qty)
      if (requestedType === 'ready-to-ship' && newQty > Number(product.stock)) {
        return res.status(400).json({ error: 'Not enough stock available' })
      }

      await db.query('UPDATE cart SET qty = ?, item_type = ?, flavor = ?, preorder_round_id = ? WHERE cart_id = ?', [
        newQty,
        existing[0].item_type || effectiveItemType,
        effectiveFlavor || null,
        resolvedPreorderRoundId,
        existing[0].cart_id,
      ])
      return res.json({ message: 'Updated qty', cart_id: existing[0].cart_id, qty: newQty })
    }

    // ไม่มี → insert ใหม่
    const [result] = await db.query(
      'INSERT INTO cart (user_id, prod_id, qty, item_type, flavor, preorder_round_id) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, prod_id, Number(qty), effectiveItemType, effectiveFlavor || null, resolvedPreorderRoundId],
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
