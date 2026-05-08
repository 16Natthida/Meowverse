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
        c.round_id AS round_id,
         -- prefer locked round_price in cart; otherwise compute from active round or preorder/base price
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
         p.stock_qty AS stock,
         -- calculate remaining preorder pool for the round (if any): quantity_available - reserved_in_carts
         COALESCE(
           (
             SELECT prp.quantity_available - COALESCE((
               SELECT SUM(c2.qty) FROM cart c2 WHERE c2.prod_id = p.prod_id AND c2.item_type = 'preorder' AND c2.round_id = prp.round_id
             ),0)
             FROM preorder_round_products prp
             WHERE prp.prod_id = p.prod_id
               AND prp.round_id = COALESCE(c.round_id, (
                 SELECT r.round_id FROM preorder_rounds r WHERE LOWER(r.status) = 'active' LIMIT 1
               ))
             LIMIT 1
           ),
           NULL
         ) AS preorder_remaining
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
  const {
    user_id,
    prod_id,
    qty = 1,
    item_type,
    flavor = '',
    round_id = null,
    round_price = null,
  } = req.body

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

    // เช็ค/ปรับยอดในทรานแซคชันเมื่อเป็น preorder ที่มีข้อจำกัด
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      // ค้นหาเฉพาะรายการที่มีชนิดเดียวกัน (item_type) เพื่อให้สามารถมีแถวแยกกัน
      // ระหว่าง 'preorder' และ 'ready-to-ship' สำหรับสินค้าชิ้นเดียวได้
      // หากเป็น preorder และมี round_id ให้จับคู่เฉพาะกับแถวที่มี round_id เดียวกัน
      let existingQuery
      let existingParams
      if (requestedType === 'preorder' && round_id) {
        existingQuery = `SELECT cart_id, qty, item_type, flavor, round_id FROM cart WHERE user_id = ? AND prod_id = ? AND COALESCE(flavor, '') = COALESCE(?, '') AND item_type = ? AND round_id = ? LIMIT 1`
        existingParams = [user_id, prod_id, effectiveFlavor, requestedType, round_id]
      } else {
        existingQuery = `SELECT cart_id, qty, item_type, flavor, round_id FROM cart WHERE user_id = ? AND prod_id = ? AND COALESCE(flavor, '') = COALESCE(?, '') AND item_type = ? LIMIT 1`
        existingParams = [user_id, prod_id, effectiveFlavor, requestedType]
      }

      const [existing] = await connection.query(existingQuery, existingParams)

      // Helper to resolve effective round id/price for preorder
      let effectiveRoundId = round_id || null
      let effectiveRoundPrice = round_price != null ? Number(round_price) : null
      if (requestedType === 'preorder' && !effectiveRoundPrice) {
        const [roundRows] = await connection.query(
          `SELECT prp.round_id AS round_id, prp.round_price AS round_price
           FROM preorder_round_products prp
           JOIN preorder_rounds r ON prp.round_id = r.round_id
           WHERE prp.prod_id = ? AND r.status = 'active'
           ORDER BY prp.link_id DESC
           LIMIT 1`,
          [prod_id],
        )

        if (roundRows.length > 0) {
          effectiveRoundId = effectiveRoundId || roundRows[0].round_id
          effectiveRoundPrice = effectiveRoundPrice || Number(roundRows[0].round_price)
        }
      }

      if (existing.length > 0) {
        // มีอยู่แล้ว → เพิ่ม qty
        const newQty = existing[0].qty + Number(qty)
        if (requestedType === 'ready-to-ship' && newQty > Number(product.stock)) {
          await connection.rollback()
          connection.release()
          return res.status(400).json({ error: 'Not enough stock available' })
        }

        // If preorder and limited pool, lock pool row and validate
        if (requestedType === 'preorder' && effectiveRoundId) {
          const [prpRows] = await connection.query(
            'SELECT link_id, quantity_available FROM preorder_round_products WHERE prod_id = ? AND round_id = ? LIMIT 1 FOR UPDATE',
            [prod_id, effectiveRoundId],
          )

          if (prpRows.length > 0 && prpRows[0].quantity_available != null) {
            const avail = Number(prpRows[0].quantity_available) || 0
            const [reservedRows] = await connection.query(
              'SELECT COALESCE(SUM(qty),0) AS reserved FROM cart WHERE prod_id = ? AND item_type = ? AND round_id = ?',
              [prod_id, 'preorder', effectiveRoundId],
            )
            const reserved = Number(reservedRows[0].reserved) || 0
            const reservedExcludingExisting = Math.max(0, reserved - Number(existing[0].qty))
            if (reservedExcludingExisting + newQty > avail) {
              await connection.rollback()
              connection.release()
              return res.status(400).json({
                error: `ไม่สามารถเพิ่มพรีออเดอร์ได้ (เหลือ ${Math.max(0, avail - reservedExcludingExisting)} ชิ้น)`,
              })
            }
          }
        }

        await connection.query(
          'UPDATE cart SET qty = ?, item_type = ?, flavor = ?, round_id = ?, round_price = ? WHERE cart_id = ?',
          [
            newQty,
            requestedType,
            effectiveFlavor || null,
            round_id || existing[0].round_id || null,
            round_price != null ? round_price : existing[0].round_price || null,
            existing[0].cart_id,
          ],
        )

        await connection.commit()
        connection.release()
        return res.json({ message: 'Updated qty', cart_id: existing[0].cart_id, qty: newQty })
      }

      // ไม่มี → insert ใหม่
      if (requestedType === 'preorder' && effectiveRoundId) {
        const [prpRows] = await connection.query(
          'SELECT link_id, quantity_available FROM preorder_round_products WHERE prod_id = ? AND round_id = ? LIMIT 1 FOR UPDATE',
          [prod_id, effectiveRoundId],
        )

        if (prpRows.length > 0 && prpRows[0].quantity_available != null) {
          const avail = Number(prpRows[0].quantity_available) || 0
          const [reservedRows] = await connection.query(
            'SELECT COALESCE(SUM(qty),0) AS reserved FROM cart WHERE prod_id = ? AND item_type = ? AND round_id = ?',
            [prod_id, 'preorder', effectiveRoundId],
          )
          const reserved = Number(reservedRows[0].reserved) || 0
          if (reserved + Number(qty) > avail) {
            await connection.rollback()
            connection.release()
            return res.status(400).json({
              error: `ไม่สามารถเพิ่มพรีออเดอร์ได้ (เหลือ ${Math.max(0, avail - reserved)} ชิ้น)`,
            })
          }
        }
      }

      const [result] = await connection.query(
        'INSERT INTO cart (user_id, prod_id, qty, item_type, flavor, round_id, round_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          user_id,
          prod_id,
          Number(qty),
          requestedType,
          effectiveFlavor || null,
          effectiveRoundId,
          effectiveRoundPrice,
        ],
      )

      await connection.commit()
      connection.release()

      res.status(201).json({ message: 'Added to cart', cart_id: result.insertId })
    } catch (txErr) {
      try {
        await connection.rollback()
      } catch (e) {
        console.warn('rollback failed', e && e.message ? e.message : e)
      }
      connection.release()
      throw txErr
    }
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

    // For preorder items with limited pool, validate inside a transaction
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      if (effectiveType === 'preorder') {
        // resolve round id for this cart row (attempt to use cart's round or active round)
        const [prpRound] = await connection.query(
          `SELECT prp.round_id FROM preorder_round_products prp WHERE prp.prod_id = ? AND prp.round_id = (
             SELECT COALESCE(c.round_id, (SELECT r.round_id FROM preorder_rounds r WHERE LOWER(r.status) = 'active' LIMIT 1)) FROM cart c WHERE c.cart_id = ? LIMIT 1
          ) LIMIT 1`,
          [cartRow.prod_id, cart_id],
        )

        const roundId = prpRound.length > 0 ? prpRound[0].round_id : cartRow.round_id || null

        if (roundId) {
          const [prpRows] = await connection.query(
            'SELECT link_id, quantity_available FROM preorder_round_products WHERE prod_id = ? AND round_id = ? LIMIT 1 FOR UPDATE',
            [cartRow.prod_id, roundId],
          )

          if (prpRows.length > 0 && prpRows[0].quantity_available != null) {
            const avail = Number(prpRows[0].quantity_available) || 0
            const [reservedRows] = await connection.query(
              'SELECT COALESCE(SUM(qty),0) AS reserved FROM cart WHERE prod_id = ? AND item_type = ? AND round_id = ? AND cart_id != ?',
              [cartRow.prod_id, 'preorder', roundId, cart_id],
            )
            const reserved = Number(reservedRows[0].reserved) || 0
            if (reserved + Number(qty) > avail) {
              await connection.rollback()
              connection.release()
              return res.status(400).json({
                error: `ไม่สามารถอัปเดตจำนวนได้ (เหลือ ${Math.max(0, avail - reserved)} ชิ้น)`,
              })
            }
          }
        }
      }

      const [result] = await connection.query('UPDATE cart SET qty = ? WHERE cart_id = ?', [
        Number(qty),
        cart_id,
      ])

      if (result.affectedRows === 0) {
        await connection.rollback()
        connection.release()
        return res.status(404).json({ error: 'Cart item not found' })
      }

      await connection.commit()
      connection.release()

      res.json({ message: 'Updated', cart_id: Number(cart_id), qty: Number(qty) })
    } catch (txErr) {
      try {
        await connection.rollback()
      } catch (e) {
        console.warn('rollback failed', e && e.message ? e.message : e)
      }
      connection.release()
      throw txErr
    }
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
