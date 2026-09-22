// routes/cart.js
// Express router สำหรับ Cart API
// ตาราง: cart (cart_id, user_id, prod_id, qty)
// Fixed: Flavor stock boundary validation. Added fallback to main product stock.

import express from 'express'
import { getFlavorPrice } from './productPricing.js'
import { getBelowMinimumCartIds } from './preorderCartEligibility.js'
import { requireOwnership } from './auth.js'
const router = express.Router()

// user แก้/ลบได้เฉพาะรายการในตะกร้าของตัวเอง (สิทธิ์ระดับเส้นอยู่ใน server/auth.js)
router.param('cart_id', requireOwnership('cart', 'cart_id', 'ไม่พบสินค้าในตะกร้า'))

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

function parseFlavorStockMap(value) {
  if (!value) {
    return {}
  }

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

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

async function getProductById(db, prodId) {
  const [rows] = await db.query(
    `SELECT
       p.prod_id AS prod_id,
       p.prod_name AS name,
       p.stock_qty AS stock,
       p.flavor_stock AS flavorStock,
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

async function getProductByIdForUpdate(connection, prodId) {
  const [rows] = await connection.query(
    `SELECT
       p.prod_id AS prod_id,
       p.prod_name AS name,
       p.stock_qty AS stock,
       p.flavor_stock AS flavorStock,
       p.flavors AS flavors,
       p.preorder_enabled AS preorderEnabled,
       p.ready_to_ship_enabled AS readyToShipEnabled
     FROM products p
     WHERE p.prod_id = ?
     LIMIT 1
     FOR UPDATE`,
    [prodId],
  )

  return rows[0] || null
}

function getDB(req) {
  return req.app.locals.db
}

async function isPreorderRoundOpen(db, roundId) {
  if (!roundId) return false

  const [rows] = await db.query(
    `SELECT round_id
     FROM preorder_rounds
     WHERE round_id = ?
       AND LOWER(status) = 'active'
       AND start_date <= NOW()
       AND end_date >= NOW()
     LIMIT 1`,
    [roundId],
  )

  return rows.length > 0
}

// ─────────────────────────────────────────────
// GET /api/cart?user_id=xxx
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { user_id } = req.query
  if (!user_id) return res.status(400).json({ error: 'user_id is required' })

  try {
    const db = getDB(req)

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
         (SELECT LOWER(r.status)
          FROM preorder_rounds r
          WHERE r.round_id = c.preorder_round_id
          LIMIT 1) AS preorder_round_status,
         COALESCE(c.round_price,
         CASE
           WHEN COALESCE(c.item_type, CASE WHEN p.ready_to_ship_enabled = 1 THEN 'ready-to-ship' WHEN p.preorder_enabled = 1 THEN 'preorder' ELSE NULL END) = 'preorder'
             THEN COALESCE(
               (
                 SELECT prp.round_price
                 FROM preorder_round_products prp
                 JOIN preorder_rounds r ON prp.round_id = r.round_id
                 WHERE prp.prod_id = p.prod_id
                   AND LOWER(r.status) IN ('active', 'scheduled')
                   AND r.start_date <= NOW()
                   AND r.end_date >= NOW()
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
             AND (
               (c.flavor IS NOT NULL AND c.flavor != '' AND pi.flavor = c.flavor)
               OR (pi.flavor IS NULL OR pi.flavor = '')
             )
           ORDER BY
             CASE
               WHEN c.flavor IS NOT NULL AND c.flavor != '' AND pi.flavor = c.flavor THEN 1
               ELSE 2
             END ASC,
             pi.sort_order ASC,
             pi.img_id ASC
           LIMIT 1
         ),
         ''
       ) AS image,
       p.stock_qty AS stock,
       p.flavor_prices AS flavorPrices,
       COALESCE((
         SELECT prp.minimum_order_qty
         FROM preorder_round_products prp
         WHERE prp.round_id = c.preorder_round_id
           AND prp.prod_id = c.prod_id
         LIMIT 1
       ), 0) AS preorder_minimum_qty,
       COALESCE((
         SELECT SUM(reserved.qty)
         FROM cart reserved
         WHERE reserved.preorder_round_id = c.preorder_round_id
           AND reserved.prod_id = c.prod_id
           AND reserved.item_type = 'preorder'
       ), 0) + COALESCE((
         SELECT SUM(od.qty)
         FROM order_details od
         WHERE od.preorder_round_id = c.preorder_round_id
           AND od.prod_id = c.prod_id
           AND od.item_type = 'preorder'
       ), 0) AS preorder_quantity_reserved,
       NULL AS preorder_remaining
       FROM cart c
       LEFT JOIN products p ON c.prod_id = p.prod_id
       WHERE c.user_id = ?
       ORDER BY c.cart_id DESC`,
      [user_id],
    )

    const belowMinimumIds = await getBelowMinimumCartIds(db, rows.map((row) => row.cart_id))
    res.json(
      rows.map((row) => ({
        ...row,
        preorder_minimum_qty: Number(row.preorder_minimum_qty) || 0,
        preorder_quantity_reserved: Number(row.preorder_quantity_reserved) || 0,
        preorder_minimum_status:
          normalizeItemType(row.item_type) === 'preorder' && Number(row.preorder_minimum_qty) > 0
            ? Number(row.preorder_quantity_reserved) >= Number(row.preorder_minimum_qty)
              ? 'reached'
              : 'not-reached'
            : 'no-minimum',
        preorder_unavailable_reason: belowMinimumIds.has(Number(row.cart_id))
          ? 'minimum_not_reached' : null,
        price: getFlavorPrice(
          row.flavorPrices,
          row.flavor,
          normalizeItemType(row.item_type),
          row.price,
        ),
      })),
    )
  } catch (err) {
    console.error('[GET /api/cart]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────
// POST /api/cart
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
  if (!prod_id) return res.status(400).json({ error: 'prod_id is required' })

  try {
    const db = getDB(req)
    const product = await getProductById(db, prod_id)

    if (!product) return res.status(404).json({ error: 'Product not found' })

    const requestedQty = Number(qty)
    if (!Number.isInteger(requestedQty) || requestedQty < 1) {
      return res.status(400).json({ error: 'qty must be a positive integer' })
    }

    const requestedType = normalizeItemType(item_type) || getFallbackItemType(product)
    const flavorList = parseFlavorList(product.flavors)
    const requestedFlavor = normalizeFlavor(flavor)
    const effectiveFlavor = flavorList.length > 0 ? requestedFlavor || flavorList[0] : requestedFlavor
    const flavorStockMap = parseFlavorStockMap(product.flavorStock)

    if (!requestedType) return res.status(400).json({ error: 'Product is not available for cart' })
    if (flavorList.length > 0 && !flavorList.includes(effectiveFlavor)) return res.status(400).json({ error: 'Invalid flavor selection' })

    if (requestedType === 'ready-to-ship' && Number(product.readyToShipEnabled) !== 1) return res.status(400).json({ error: 'Product is not available for ready-to-ship' })
    if (requestedType === 'preorder' && Number(product.preorderEnabled) !== 1) return res.status(400).json({ error: 'Product is not available for preorder' })

    // 💡 แก้ไขจุดเช็คสต็อก: ตรวจสอบว่ามีคีย์รสชาตินี้ในตารางสต็อกย่อยไหม ถ้าไม่มีให้หลบไปใช้สต็อกหลักสินค้าอัตโนมัติ
    if (requestedType === 'ready-to-ship') {
      if (flavorList.length > 0 && effectiveFlavor && (effectiveFlavor in flavorStockMap)) {
        const flavorAvailable = Number(flavorStockMap[effectiveFlavor]) || 0
        if (flavorAvailable < requestedQty) return res.status(400).json({ error: `ขออภัย รสชาติ "${effectiveFlavor}" มีสต็อกเหลือเพียง ${flavorAvailable} ชิ้น` })
      } else if (Number(product.stock || 0) < requestedQty) {
        return res.status(400).json({ error: 'สินค้ามีสต็อกไม่เพียงพอ' })
      }
    }

    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      const lockedProduct = await getProductByIdForUpdate(connection, prod_id)
      if (!lockedProduct) {
        await connection.rollback()
        connection.release()
        return res.status(404).json({ error: 'Product not found' })
      }

      const lockedFlavorStockMap = parseFlavorStockMap(lockedProduct.flavorStock)
      const hasFlavorStock =
        flavorList.length > 0 && effectiveFlavor && (effectiveFlavor in lockedFlavorStockMap)
      const availableQty = hasFlavorStock
        ? Number(lockedFlavorStockMap[effectiveFlavor]) || 0
        : Number(lockedProduct.stock) || 0
      
      if (requestedType === 'ready-to-ship' && requestedQty > availableQty) {
        await connection.rollback()
        connection.release()
        return res.status(400).json({
          error: hasFlavorStock
            ? `ขออภัย รสชาติ "${effectiveFlavor}" มีสต็อกเหลือเพียง ${availableQty} ชิ้น`
            : `สต็อกสินค้ามีไม่เพียงพอ (เหลือ ${availableQty} ชิ้น)`,
        })
      }

      let existingQuery, existingParams
      if (requestedType === 'preorder' && round_id) {
        existingQuery = `SELECT cart_id, qty, item_type, flavor, round_id, preorder_round_id FROM cart WHERE user_id = ? AND prod_id = ? AND COALESCE(flavor, '') = COALESCE(?, '') AND item_type = ? AND round_id = ? LIMIT 1`
        existingParams = [user_id, prod_id, effectiveFlavor, requestedType, round_id]
      } else {
        existingQuery = `SELECT cart_id, qty, item_type, flavor, round_id, preorder_round_id FROM cart WHERE user_id = ? AND prod_id = ? AND COALESCE(flavor, '') = COALESCE(?, '') AND item_type = ? LIMIT 1`
        existingParams = [user_id, prod_id, effectiveFlavor, requestedType]
      }

      const [existing] = await connection.query(existingQuery, existingParams)

      let effectiveRoundId = round_id || null
      let effectiveRoundPrice = round_price != null ? Number(round_price) : null
      if (requestedType === 'preorder' && !effectiveRoundPrice) {
        const [roundRows] = await connection.query(
          `SELECT prp.round_id AS round_id, prp.round_price AS round_price
           FROM preorder_round_products prp
           JOIN preorder_rounds r ON prp.round_id = r.round_id
           WHERE prp.prod_id = ?
             AND LOWER(r.status) IN ('active', 'scheduled')
             AND r.start_date <= NOW()
             AND r.end_date >= NOW()
           ORDER BY prp.link_id DESC LIMIT 1`, [prod_id]
        )
        if (roundRows.length > 0) {
          effectiveRoundId = effectiveRoundId || roundRows[0].round_id
          effectiveRoundPrice = effectiveRoundPrice || Number(roundRows[0].round_price)
        }
      }

      if (requestedType === 'preorder' && !(await isPreorderRoundOpen(connection, effectiveRoundId))) {
        await connection.rollback()
        connection.release()
        return res.status(409).json({ error: 'รอบพรีออเดอร์นี้ปิดรับออเดอร์แล้ว' })
      }

      if (existing.length > 0) {
        const newQty = Number(existing[0].qty) + requestedQty
        if (requestedType === 'ready-to-ship' && newQty > availableQty) {
          await connection.rollback()
          connection.release()
          return res.status(400).json({
            error: hasFlavorStock
              ? `ขออภัย รสชาติ "${effectiveFlavor}" มีสต็อกเหลือเพียง ${availableQty} ชิ้น`
              : `สต็อกสินค้ามีไม่เพียงพอ (เหลือ ${availableQty} ชิ้น)`,
          })
        }

        await connection.query(
          'UPDATE cart SET qty = ?, item_type = ?, flavor = ?, round_id = ?, preorder_round_id = ?, round_price = ? WHERE cart_id = ?',
          [
            newQty,
            requestedType,
            effectiveFlavor || null,
            round_id || existing[0].round_id || null,
            requestedType === 'preorder' ? round_id || existing[0].round_id || null : null,
            round_price != null ? round_price : existing[0].round_price || null,
            existing[0].cart_id,
          ],
        )

        await connection.commit()
        connection.release()
        return res.json({ message: 'Updated qty', cart_id: existing[0].cart_id, qty: newQty })
      }

      const [result] = await connection.query(
        'INSERT INTO cart (user_id, prod_id, qty, item_type, flavor, round_id, preorder_round_id, round_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user_id, prod_id, requestedQty, requestedType, effectiveFlavor || null, effectiveRoundId, requestedType === 'preorder' ? effectiveRoundId : null, effectiveRoundPrice],
      )

      await connection.commit()
      connection.release()
      res.status(201).json({ message: 'Added to cart', cart_id: result.insertId })
    } catch (txErr) {
      try { await connection.rollback() } catch (e) { console.warn('rollback failed', e.message || e) }
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
       c.cart_id, c.qty, c.item_type, c.flavor,
       c.preorder_round_id,
       p.stock_qty AS stock, p.flavors AS flavors, p.flavor_stock AS flavorStock,
       p.flavor_prices AS flavorPrices,
         p.preorder_enabled AS preorderEnabled, p.ready_to_ship_enabled AS readyToShipEnabled
       FROM cart c
       LEFT JOIN products p ON p.prod_id = c.prod_id
       WHERE c.cart_id = ? LIMIT 1`, [cart_id]
    )

    const cartRow = cartRows[0]
    if (!cartRow) return res.status(404).json({ error: 'Cart item not found' })

    const effectiveType = normalizeItemType(cartRow.item_type) || getFallbackItemType(cartRow)
    const flavorList = parseFlavorList(cartRow.flavors)
    const currentFlavor = normalizeFlavor(cartRow.flavor)
    const flavorStockMap = parseFlavorStockMap(cartRow.flavorStock)

    if (flavorList.length > 0 && currentFlavor && !flavorList.includes(currentFlavor)) {
      return res.status(400).json({ error: 'Invalid flavor selection' })
    }

    // 💡 แก้ไขจุดเช็คสต็อกขณะกดบวกลบจำนวนชิ้นฟรอนต์เอนด์ ป้องกันบั๊กค่าพัง
    if (effectiveType === 'ready-to-ship') {
      const requestedQty = Number(qty)
      if (flavorList.length > 0 && currentFlavor && (currentFlavor in flavorStockMap)) {
        const flavorAvailable = Number(flavorStockMap[currentFlavor]) || 0
        if (flavorAvailable < requestedQty) {
          return res.status(400).json({ error: `ขออภัย รสชาติ "${currentFlavor}" มีสต็อกเหลือเพียง ${flavorAvailable} ชิ้น` })
        }
      } else if (requestedQty > Number(cartRow.stock || 0)) {
        return res.status(400).json({ error: `สต็อกสินค้ามีไม่เพียงพอ (เหลือ ${Number(cartRow.stock || 0)} ชิ้น)` })
      }
    }

    if (effectiveType === 'preorder' && Number(cartRow.preorderEnabled) !== 1) {
      return res.status(400).json({ error: 'Product is not available for preorder' })
    }

    if (effectiveType === 'preorder' && !(await isPreorderRoundOpen(db, cartRow.preorder_round_id))) {
      return res.status(409).json({ error: 'รอบพรีออเดอร์นี้ปิดรับออเดอร์แล้ว' })
    }

    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      const [result] = await connection.query('UPDATE cart SET qty = ? WHERE cart_id = ?', [Number(qty), cart_id])
      if (result.affectedRows === 0) {
        await connection.rollback()
        connection.release()
        return res.status(404).json({ error: 'Cart item not found' })
      }

      await connection.commit()
      connection.release()
      res.json({ message: 'Updated', cart_id: Number(cart_id), qty: Number(qty) })
    } catch (txErr) {
      try { await connection.rollback() } catch (e) { console.warn('rollback failed', e.message || e) }
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
// ─────────────────────────────────────────────
router.delete('/:cart_id', async (req, res) => {
  const { cart_id } = req.params
  const userId = Number(req.query.user_id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'user_id is required' })
  }
  try {
    const db = getDB(req)
    const [cartRows] = await db.query(
      'SELECT cart_id, item_type, preorder_round_id FROM cart WHERE cart_id = ? AND user_id = ? LIMIT 1',
      [cart_id, userId],
    )
    const cartRow = cartRows[0]
    if (!cartRow) return res.status(404).json({ error: 'Cart item not found' })

    if (
      normalizeItemType(cartRow.item_type) === 'preorder' &&
      !(await isPreorderRoundOpen(db, cartRow.preorder_round_id))
    ) {
      const belowMinimumIds = await getBelowMinimumCartIds(db, [cart_id])
      if (!belowMinimumIds.has(Number(cart_id))) {
        return res.status(409).json({ error: 'รอบพรีออเดอร์นี้ปิดรับออเดอร์แล้ว' })
      }
    }

    const [result] = await db.query('DELETE FROM cart WHERE cart_id = ? AND user_id = ?', [cart_id, userId])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cart item not found' })
    res.json({ message: 'Deleted', cart_id: Number(cart_id) })
  } catch (err) {
    console.error('[DELETE /api/cart/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
