/* eslint-disable no-undef */
import cors from 'cors'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import mysql from 'mysql2/promise'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import cartRouter from './cart.js'
import orderRouter from './order.js'
import shippingRouter from './shipping.js'

dotenv.config()

const app = express()

const port = Number(process.env.API_PORT) || 3001

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const LOCAL_DEV_ORIGINS = [
  frontendOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]
const CATEGORY_NAME_MAX_LENGTH = 100
const CATEGORY_DETAIL_MAX_LENGTH = 255
const CATEGORY_MIN_COUNT = 4
const CATEGORY_MAX_COUNT = 5
const DEFAULT_BANNER_IMAGE_URL = '/images/cat.jpg'
const DEFAULT_BRAND_LOGO_URL = ''
const DEFAULT_THEME_PRIMARY = '#b673ee'
const DEFAULT_THEME_ACCENT = '#ff93b8'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, 'uploads')

mkdirSync(uploadsDir, { recursive: true })

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'meowverse',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

app.locals.db = pool

let hasPreorderQuantitySoldColumn = null
async function ensurePreorderQuantitySoldColumn() {
  if (hasPreorderQuantitySoldColumn !== null) {
    return hasPreorderQuantitySoldColumn
  }

  try {
    const [columns] = await pool.query(
      `SHOW COLUMNS FROM preorder_round_products LIKE 'quantity_sold'`,
    )
    if (columns.length === 0) {
      await pool.query(
        `ALTER TABLE preorder_round_products ADD COLUMN quantity_sold INT NOT NULL DEFAULT 0`,
      )
    }
    hasPreorderQuantitySoldColumn = true
  } catch (error) {
    console.error('Failed to ensure preorder_round_products.quantity_sold column:', error.message)
    hasPreorderQuantitySoldColumn = false
  }

  return hasPreorderQuantitySoldColumn
}

function resolveIntakeStatus(orderedQty, receivedQty) {
  const ordered = Math.max(Number(orderedQty) || 0, 0)
  const received = Math.max(Number(receivedQty) || 0, 0)

  if (ordered <= 0) {
    return 'Pending'
  }

  if (received <= 0) {
    return 'missing'
  }

  if (received >= ordered) {
    return 'ready_to_ship'
  }

  return 'partially_received'
}

const PREORDER_PAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000

async function createPreorderOrdersForClosedRound(connection, roundId) {
  const [cartRows] = await connection.query(
    `SELECT
       c.cart_id,
       c.user_id,
       c.prod_id,
       c.qty,
       c.flavor,
       c.item_type,
       c.preorder_round_id,
       COALESCE(
         NULLIF(c.round_price, 0),
         NULLIF(prp.round_price, 0),
         NULLIF(p.preorder_price, 0),
         NULLIF(p.base_price, 0)
       ) AS price,
       p.prod_name AS name
     FROM cart c
     LEFT JOIN products p ON p.prod_id = c.prod_id
     LEFT JOIN preorder_round_products prp
       ON prp.round_id = c.preorder_round_id AND prp.prod_id = c.prod_id
     WHERE c.item_type = 'preorder'
       AND c.preorder_round_id = ?
     ORDER BY c.user_id, c.cart_id`,
    [roundId],
  )

  const autoOrderSummary = { created: 0, skipped: 0, errors: [] }

  if (cartRows.length === 0) {
    return autoOrderSummary
  }

  const byUser = new Map()
  for (const row of cartRows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
    byUser.get(row.user_id).push(row)
  }

  for (const [userId, items] of byUser.entries()) {
    try {
      const totalAmount = items.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * Number(item.qty || 0),
        0,
      )

      const deadline = new Date(Date.now() + PREORDER_PAYMENT_WINDOW_MS)
      const [orderResult] = await connection.query(
        `INSERT INTO orders (user_id, total_amount, status, Order_type, deadline) VALUES (?, ?, 'Pending', 'Preorder', ?)`,
        [userId, totalAmount, deadline],
      )
      const orderId = orderResult.insertId

      for (const item of items) {
        await connection.query(
          `INSERT INTO order_details
             (order_id, prod_id, flavor, Price, qty, received_qty, arrival_status, Import_fee, item_type, preorder_round_id)
           VALUES (?, ?, ?, ?, ?, 0, 'Pending', 0, 'preorder', ?)`,
          [
            orderId,
            item.prod_id,
            item.flavor || null,
            item.price,
            item.qty,
            item.preorder_round_id,
          ],
        )

        await connection.query(
          `UPDATE preorder_round_products
           SET quantity_sold = COALESCE(quantity_sold, 0) + ?
           WHERE round_id = ? AND prod_id = ?`,
          [item.qty, item.preorder_round_id, item.prod_id],
        )
      }

      const cartIds = items.map((item) => item.cart_id)
      await connection.query(
        `DELETE FROM cart WHERE cart_id IN (${cartIds.map(() => '?').join(',')})`,
        cartIds,
      )

      autoOrderSummary.created++
    } catch (userErr) {
      console.error(`[auto-order] user_id=${userId} round_id=${roundId}`, userErr.message)
      autoOrderSummary.errors.push({ user_id: userId, error: userErr.message })
      autoOrderSummary.skipped++
    }
  }

  return autoOrderSummary
}

async function autoCloseExpiredPreorderRounds() {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [roundRows] = await connection.query(
      `SELECT round_id
       FROM preorder_rounds
       WHERE LOWER(status) IN ('active', 'open')
         AND end_date <= NOW()`,
    )

    for (const row of roundRows) {
      const roundId = Number(row.round_id)
      if (!roundId) continue

      await connection.query('UPDATE preorder_rounds SET status = ? WHERE round_id = ?', [
        'closed',
        roundId,
      ])

      await createPreorderOrdersForClosedRound(connection, roundId)
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    console.error('[auto-close] failed to close expired preorder rounds:', error.message)
  } finally {
    connection.release()
  }
}

function normalizeIntakeQuantity(value, fallback = 0) {
  // Ensure we return a non-negative integer.
  // Accept numbers or numeric strings (with commas or other chars) and clamp to >= 0.
  if (value === undefined || value === null || value === '') {
    return Math.max(0, Number(fallback) || 0)
  }

  // If it's already a number, coerce and truncate
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  // Try parsing strings: remove non-numeric characters except dot and minus
  const cleaned = String(value).replace(/[^0-9.-]+/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return Math.max(0, Number(fallback) || 0)
  }

  return Math.max(0, Math.trunc(parsed))
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir)
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname) || '.jpg'
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
    callback(null, safeName)
  },
})

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
})

// CORS: allow requests from LOCAL_DEV_ORIGINS and enable credentials for cookies/auth
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || LOCAL_DEV_ORIGINS.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(uploadsDir))
app.use('/api/cart', cartRouter)
app.use('/api/orders', orderRouter)
app.use('/api/admin', shippingRouter)

function authenticateToken(req, res, next) {
  const roleHeader = String(req.headers['x-user-role'] || '')
    .trim()
    .toLowerCase()
  const userIdHeader = String(req.headers['x-user-id'] || '').trim()

  if (!roleHeader) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = {
    role: roleHeader,
    id: userIdHeader ? Number(userIdHeader) : null,
  }

  next()
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' })
  }

  next()
}

async function handleLoginRequest(req, res) {
  const { username, password } = req.body || {}

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
    })
  }

  try {
    const [rows] = await pool.query(
      'SELECT user_id, username, role, full_name, password FROM accounts WHERE username = ? LIMIT 1',
      [String(username).trim()],
    )

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      })
    }

    const account = rows[0]
    const storedPassword = String(account.password || '')
    const isHashedPassword = /^\$2[aby]\$/.test(storedPassword)

    const isValidPassword = isHashedPassword
      ? await bcrypt.compare(String(password), storedPassword)
      : storedPassword === String(password)

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      })
    }

    return res.json({
      success: true,
      user: {
        user_id: account.user_id,
        username: account.username,
        role: account.role,
        full_name: account.full_name,
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}

app.post('/login', handleLoginRequest)
app.post('/api/login', handleLoginRequest)

app.post('/register', async (req, res) => {
  const { username, password, full_name } = req.body || {}

  if (!username || !password || !full_name) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' })
  }

  try {
    const hashedPassword = await bcrypt.hash(String(password), 10)
    await pool.query(
      'INSERT INTO accounts (username, password, full_name, role) VALUES (?, ?, ?, "User")',
      [String(username).trim(), hashedPassword, String(full_name).trim()],
    )

    return res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/register', async (req, res) => {
  const { username, password, full_name } = req.body || {}

  if (!username || !password || !full_name) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' })
  }

  try {
    const hashedPassword = await bcrypt.hash(String(password), 10)
    await pool.query(
      'INSERT INTO accounts (username, password, full_name, role) VALUES (?, ?, ?, "User")',
      [String(username).trim(), hashedPassword, String(full_name).trim()],
    )

    return res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role, full_name, phone_number, line_id, notes } = req.body || {}

  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Username, password, and full_name required' })
  }

  const safeRole = String(role || '')
    .trim()
    .toLowerCase()
  if (!['user', 'admin'].includes(safeRole)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  try {
    const hashedPassword = await bcrypt.hash(String(password), 10)

    await pool.query(
      'INSERT INTO accounts (username, password, role, full_name, phone_number, line_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        String(username).trim(),
        hashedPassword,
        safeRole,
        String(full_name).trim(),
        phone_number || null,
        line_id || null,
        notes || null,
      ],
    )

    return res.json({ message: 'User added successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user?.id)
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const [rows] = await pool.query(
      'SELECT user_id, username, full_name, phone_number, line_id, notes FROM accounts WHERE user_id = ? LIMIT 1',
      [userId],
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = rows[0]
    return res.json({
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      phone_number: user.phone_number || '',
      line_id: user.line_id || '',
      notes: user.notes || '',
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user?.id)
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const { full_name, phone_number, line_id, notes } = req.body || {}

    if (!full_name) {
      return res.status(400).json({ error: 'Full name is required' })
    }

    const [result] = await pool.query(
      'UPDATE accounts SET full_name = ?, phone_number = ?, line_id = ?, notes = ? WHERE user_id = ?',
      [String(full_name).trim(), phone_number || null, line_id || null, notes || null, userId],
    )

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ message: 'Profile updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id)
  const { username, password, full_name, phone_number, line_id } = req.body || {}

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  if (!username || !full_name) {
    return res.status(400).json({ error: 'Username and full_name are required' })
  }

  try {
    const connection = await pool.getConnection()

    // Check if username already exists (excluding current user)
    const [existing] = await connection.query(
      'SELECT user_id FROM accounts WHERE username = ? AND user_id != ?',
      [username, targetUserId],
    )

    if (existing.length > 0) {
      connection.release()
      return res.status(400).json({ error: 'Username already exists' })
    }

    // Build update query
    let updateFields = ['username = ?', 'full_name = ?']
    let updateValues = [username, full_name]

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10)
      updateFields.push('password = ?')
      updateValues.push(hashedPassword)
    }

    if (phone_number !== undefined) {
      updateFields.push('phone_number = ?')
      updateValues.push(phone_number || null)
    }

    if (line_id !== undefined) {
      updateFields.push('line_id = ?')
      updateValues.push(line_id || null)
    }

    updateValues.push(targetUserId)

    const updateQuery = `UPDATE accounts SET ${updateFields.join(', ')} WHERE user_id = ?`
    const [result] = await connection.query(updateQuery, updateValues)

    connection.release()

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ message: 'User updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id)

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  if (req.user?.id && Number(req.user.id) === targetUserId) {
    return res.status(400).json({ error: 'You cannot delete your own account' })
  }

  try {
    const [result] = await pool.query('DELETE FROM accounts WHERE user_id = ?', [targetUserId])

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ message: 'User deleted successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

function toBooleanNumber(value) {
  return value ? 1 : 0
}

function mapProductRow(row, imageUrlMap) {
  // Parse flavor_stock JSON (e.g., {"Lavender 6L": 1, "Apple 6L": 1})
  let flavorStockMap = {}
  try {
    if (row.flavorStock) {
      flavorStockMap =
        typeof row.flavorStock === 'string' ? JSON.parse(row.flavorStock) : row.flavorStock
    }
  } catch (error) {
    console.warn('Failed to parse flavorStock for product', row.id, error)
    flavorStockMap = {}
  }

  return {
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    categoryId: row.categoryId,
    categoryName: row.categoryName || '',
    stock: Number(row.stock) || 0,
    flavorStock: flavorStockMap,
    basePrice: Number(row.basePrice) || 0,
    preorderPrice: Number(row.preorderPrice) || 0,
    price: Number(row.price ?? row.basePrice) || 0,
    preorderRoundId: row.preorderRoundId ? Number(row.preorderRoundId) : null,
    description: row.description || '',
    flavors: parseFlavorList(row.flavors),
    imageUrls: imageUrlMap.get(row.id) || [],
    preorderEnabled: Boolean(row.preorderEnabled),
    readyToShipEnabled: Boolean(row.readyToShipEnabled),
  }
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

function serializeFlavorList(value) {
  const flavors = parseFlavorList(value)
  return flavors.length > 0 ? JSON.stringify(flavors) : null
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

function getFlavorStockTotal(flavorStockMap) {
  return Object.values(flavorStockMap || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0)
}

async function adjustProductStock(connection, productId, deltaQty, flavor = '') {
  const [rows] = await connection.query(
    'SELECT stock_qty, flavor_stock FROM products WHERE prod_id = ? LIMIT 1 FOR UPDATE',
    [productId],
  )

  if (rows.length === 0) {
    return false
  }

  const currentStock = Number(rows[0].stock_qty) || 0
  const flavorKey = String(flavor || '').trim()
  const flavorStockMap = parseFlavorStockMap(rows[0].flavor_stock)

  if (flavorKey && Object.keys(flavorStockMap).length > 0 && flavorKey in flavorStockMap) {
    const nextFlavorQty = Math.max(0, (Number(flavorStockMap[flavorKey]) || 0) + Number(deltaQty))
    flavorStockMap[flavorKey] = nextFlavorQty
    const nextTotal = getFlavorStockTotal(flavorStockMap)

    await connection.query(
      'UPDATE products SET stock_qty = ?, flavor_stock = ? WHERE prod_id = ?',
      [nextTotal, JSON.stringify(flavorStockMap), productId],
    )

    return true
  }

  const nextStock = Math.max(0, currentStock + Number(deltaQty))
  await connection.query('UPDATE products SET stock_qty = ? WHERE prod_id = ?', [
    nextStock,
    productId,
  ])
  return true
}

async function queryProductsByIds(productIds, connection = pool) {
  if (productIds.length === 0) {
    return []
  }

  const [productRows] = await connection.query(
    `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.description AS description,
        p.flavors AS flavors,
        p.flavor_stock AS flavorStock,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        (
          SELECT prp.round_price
          FROM preorder_round_products prp
          JOIN preorder_rounds r ON r.round_id = prp.round_id
          WHERE prp.prod_id = p.prod_id
            AND LOWER(r.status) IN ('active', 'open')
          ORDER BY r.start_date DESC, r.round_id DESC
          LIMIT 1
        ) AS price,
        (
          SELECT prp.round_id
          FROM preorder_round_products prp
          JOIN preorder_rounds r ON r.round_id = prp.round_id
          WHERE prp.prod_id = p.prod_id
            AND LOWER(r.status) IN ('active', 'open')
          ORDER BY r.start_date DESC, r.round_id DESC
          LIMIT 1
        ) AS preorderRoundId,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.prod_id IN (?)
      ORDER BY p.prod_id DESC
    `,
    [productIds],
  )

  // ในฟังก์ชัน queryProductsByIds หาบรรทัดที่ SELECT จาก product_images ให้เปลี่ยนเป็น:
  const [imageRows] = await connection.query(
    `
      SELECT prod_id AS productId, image_url AS imageUrl, flavor
      FROM product_images
      WHERE prod_id IN (?)
      ORDER BY sort_order ASC, img_id ASC
    `,
    [productIds],
  )

  const imageUrlMap = new Map()
  const fullImageMap = new Map() // แผนที่ใหม่สำหรับเก็บทั้ง url และ flavor
  for (const row of imageRows) {
    const list = imageUrlMap.get(row.productId) || []
    list.push(row.imageUrl)
    imageUrlMap.set(row.productId, list)

    const fullList = fullImageMap.get(row.productId) || []
    fullList.push({ url: row.imageUrl, flavor: row.flavor || '' })
    fullImageMap.set(row.productId, fullList)
  }

  return productRows.map((row) => {
    const mapped = mapProductRow(row, imageUrlMap)
    mapped.images = fullImageMap.get(row.id) || [] // ส่ง array แบบมี flavor ไปให้แอดมิน
    return mapped
  })
}

async function queryAllProducts(connection = pool) {
  const [idRows] = await connection.query(
    'SELECT prod_id AS id FROM products ORDER BY prod_id DESC',
  )
  const productIds = idRows.map((row) => row.id)
  return queryProductsByIds(productIds, connection)
}

async function upsertProductImages(connection, productId, images = []) {
  await connection.query('DELETE FROM product_images WHERE prod_id = ?', [productId])

  if (!Array.isArray(images) || images.length === 0) {
    return
  }

  // รองรับทั้งแบบ object {url, flavor} และแบบ string เดิม
  const values = images
    .filter((img) => {
      const url = typeof img === 'string' ? img : img.url
      return typeof url === 'string' && url.trim() !== ''
    })
    .map((img, index) => {
      const url = typeof img === 'string' ? img.trim() : img.url.trim()
      const flavor = typeof img === 'object' && img.flavor ? String(img.flavor).trim() : null
      return [productId, url, flavor, index]
    })

  if (values.length > 0) {
    await connection.query(
      'INSERT INTO product_images (prod_id, image_url, flavor, sort_order) VALUES ?',
      [values],
    )
  }
}

async function ensureAdminSchema() {
  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS flavors TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS sku VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS preorder_enabled TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ready_to_ship_enabled TINYINT(1) NOT NULL DEFAULT 1
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      img_id INT NOT NULL AUTO_INCREMENT,
      prod_id INT NOT NULL,
      flavor VARCHAR(255) DEFAULT NULL,
      image_url VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (img_id),
      KEY idx_product_images_prod_id (prod_id),
      CONSTRAINT fk_product_images_prod
        FOREIGN KEY (prod_id) REFERENCES products (prod_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    ALTER TABLE product_images
    ADD COLUMN IF NOT EXISTS flavor VARCHAR(255) DEFAULT NULL
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart (
      cart_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      prod_id INT NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      item_type VARCHAR(20) DEFAULT NULL,
      flavor VARCHAR(120) DEFAULT NULL,
      round_id INT DEFAULT NULL,
      round_price DECIMAL(10,2) NULL,
      preorder_round_id INT DEFAULT NULL,
      PRIMARY KEY (cart_id),
      KEY idx_cart_user_id (user_id),
      KEY idx_cart_round_id (round_id),
      KEY idx_cart_preorder_round_id (preorder_round_id),
      CONSTRAINT fk_cart_user
        FOREIGN KEY (user_id) REFERENCES accounts (id)
        ON DELETE CASCADE,
      CONSTRAINT fk_cart_prod
        FOREIGN KEY (prod_id) REFERENCES products (prod_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS preorder_rounds (
      round_id INT NOT NULL AUTO_INCREMENT,
      round_name VARCHAR(255) NOT NULL,
      round_description VARCHAR(255) NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      status ENUM('active', 'closed', 'archived') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (round_id),
      KEY idx_preorder_rounds_status (status),
      KEY idx_preorder_rounds_dates (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      setting_key VARCHAR(100) NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS preorder_round_products (
      link_id INT NOT NULL AUTO_INCREMENT,
      round_id INT NOT NULL,
      prod_id INT NOT NULL,
      quantity_available INT NOT NULL DEFAULT 0,
      quantity_sold INT NOT NULL DEFAULT 0,
      round_price DECIMAL(10, 2) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (link_id),
      UNIQUE KEY unique_round_product (round_id, prod_id),
      KEY idx_round_products_round_id (round_id),
      KEY idx_round_products_prod_id (prod_id),
      CONSTRAINT fk_preorder_round_products_round
        FOREIGN KEY (round_id) REFERENCES preorder_rounds (round_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_preorder_round_products_product

        FOREIGN KEY (prod_id) REFERENCES products (prod_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_intake_sessions (
      intake_id INT NOT NULL AUTO_INCREMENT,
      order_id INT NOT NULL,
      admin_user_id INT NULL,
      expected_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      received_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Completed',
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (intake_id),
      KEY idx_inventory_intake_sessions_order_id (order_id),
      KEY idx_inventory_intake_sessions_admin_user_id (admin_user_id),
      CONSTRAINT fk_inventory_intake_sessions_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_inventory_intake_sessions_admin
        FOREIGN KEY (admin_user_id) REFERENCES accounts (user_id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_intake_session_items (
      item_id INT NOT NULL AUTO_INCREMENT,
      intake_id INT NOT NULL,
      detail_id INT NOT NULL,
      prod_id INT NOT NULL,
      ordered_qty INT NOT NULL DEFAULT 0,
      received_qty INT NOT NULL DEFAULT 0,
      missing_qty INT NOT NULL DEFAULT 0,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      arrival_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id),
      KEY idx_inventory_intake_session_items_intake_id (intake_id),
      KEY idx_inventory_intake_session_items_detail_id (detail_id),
      KEY idx_inventory_intake_session_items_prod_id (prod_id),
      CONSTRAINT fk_inventory_intake_session_items_session
        FOREIGN KEY (intake_id) REFERENCES inventory_intake_sessions (intake_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_inventory_intake_session_items_detail
        FOREIGN KEY (detail_id) REFERENCES order_details (detail_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_inventory_intake_session_items_product
        FOREIGN KEY (prod_id) REFERENCES products (prod_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)

  await pool.query(`
    ALTER TABLE inventory_intake_session_items
    ADD COLUMN IF NOT EXISTS excess_qty INT NOT NULL DEFAULT 0
  `)

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS preorder_price DECIMAL(10,2) NULL AFTER base_price
  `)

  await ensurePreorderQuantitySoldColumn()
  await pool.query(`
    ALTER TABLE preorder_round_products
    ADD COLUMN IF NOT EXISTS quantity_sold INT NOT NULL DEFAULT 0
  `)

  await pool.query(`
    ALTER TABLE preorder_round_products
    ADD COLUMN IF NOT EXISTS import_fee_per_products DECIMAL(10,2) NOT NULL DEFAULT 0
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS flavor VARCHAR(120) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS round_id INT NULL
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS round_price DECIMAL(10,2) NULL
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS preorder_round_id INT DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE order_details
    ADD COLUMN IF NOT EXISTS flavor VARCHAR(120) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE order_details
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE order_details
    ADD COLUMN IF NOT EXISTS preorder_round_id INT DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS deadline DATETIME NULL
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS postpone (
      post_id INT NOT NULL AUTO_INCREMENT,
      order_id INT DEFAULT NULL,
      new_deadline DATETIME DEFAULT NULL,
      post_detail VARCHAR(500) DEFAULT NULL,
      request_reason VARCHAR(255) DEFAULT NULL,
      contact_phone VARCHAR(50) DEFAULT NULL,
      status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
      Post_date DATETIME DEFAULT CURRENT_TIMESTAMP(),
      PRIMARY KEY (post_id),
      KEY order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `)

  await pool.query(`
    ALTER TABLE postpone
    ADD COLUMN IF NOT EXISTS request_reason VARCHAR(255) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE postpone
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE postpone
    ADD COLUMN IF NOT EXISTS post_detail VARCHAR(500) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE postpone
    ADD COLUMN IF NOT EXISTS status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending'
  `)

  await pool.query(`
    ALTER TABLE postpone
    ADD COLUMN IF NOT EXISTS Post_date DATETIME DEFAULT CURRENT_TIMESTAMP()
  `)

  await pool.query(`
    ALTER TABLE preorder_rounds
    ADD COLUMN IF NOT EXISTS round_description VARCHAR(255) NULL AFTER round_name
  `)

  // Orders and order_details tables already exist in the database
  // No need to create them here
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT cat_id AS id, cat_name AS name, cat_detail AS detail FROM categories ORDER BY cat_name ASC',
    )

    res.json(rows)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/categories', async (req, res) => {
  const payload = req.body || {}
  const name = String(payload.name || '').trim()
  const detailText = String(payload.detail || '').trim()
  const detail = detailText || null

  if (!name) {
    res.status(400).json({ message: 'Category name is required.' })
    return
  }

  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    res
      .status(400)
      .json({ message: `Category name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters.` })
    return
  }

  if (detail && detail.length > CATEGORY_DETAIL_MAX_LENGTH) {
    res.status(400).json({
      message: `Category detail must be at most ${CATEGORY_DETAIL_MAX_LENGTH} characters.`,
    })
    return
  }

  try {
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM categories')
    const totalCategories = Number(countRows?.[0]?.total) || 0

    if (totalCategories >= CATEGORY_MAX_COUNT) {
      res.status(400).json({
        message: `You can create up to ${CATEGORY_MAX_COUNT} categories only.`,
      })
      return
    }

    const [existingRows] = await pool.query(
      'SELECT cat_id AS id FROM categories WHERE cat_name = ? LIMIT 1',
      [name],
    )

    if (existingRows.length > 0) {
      res.status(409).json({ message: 'Category already exists.' })
      return
    }

    const [insertResult] = await pool.query(
      'INSERT INTO categories (cat_name, cat_detail) VALUES (?, ?)',
      [name, detail],
    )

    res.status(201).json({
      id: insertResult.insertId,
      name,
      detail,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/categories/:id', async (req, res) => {
  const categoryId = Number(req.params.id)
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: 'Valid category id is required.' })
    return
  }

  try {
    const [categoryRows] = await pool.query(
      'SELECT cat_id AS id FROM categories WHERE cat_id = ? LIMIT 1',
      [categoryId],
    )

    if (categoryRows.length === 0) {
      res.status(404).json({ message: 'Category not found.' })
      return
    }

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM categories')
    const totalCategories = Number(countRows?.[0]?.total) || 0
    if (totalCategories <= CATEGORY_MIN_COUNT) {
      res.status(400).json({
        message: `At least ${CATEGORY_MIN_COUNT} categories are required.`,
      })
      return
    }

    const [productRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM products WHERE cat_id = ?',
      [categoryId],
    )
    const totalProducts = Number(productRows?.[0]?.total) || 0
    if (totalProducts > 0) {
      res.status(409).json({
        message: 'Cannot delete category because products still exist in this category.',
      })
      return
    }

    await pool.query('DELETE FROM categories WHERE cat_id = ?', [categoryId])
    res.status(204).send()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/products', async (_req, res) => {
  try {
    const rows = await queryAllProducts()
    res.json(rows)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/uploads/images', upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'Image file is required.' })
    return
  }

  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
  })
})

app.get('/api/site-settings/banner', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT setting_value AS imageUrl FROM site_settings WHERE setting_key = ? LIMIT 1',
      ['homepage_banner_image'],
    )

    res.json({
      imageUrl: rows[0]?.imageUrl || DEFAULT_BANNER_IMAGE_URL,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/site-settings/logo', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT setting_value AS imageUrl FROM site_settings WHERE setting_key = ? LIMIT 1',
      ['brand_logo_image'],
    )

    res.json({
      imageUrl: rows[0]?.imageUrl || DEFAULT_BRAND_LOGO_URL,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/site-settings/theme', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT setting_key, setting_value
        FROM site_settings
        WHERE setting_key IN (?, ?)
      `,
      ['theme_primary', 'theme_accent'],
    )

    const settingsMap = new Map(rows.map((row) => [row.setting_key, row.setting_value]))

    res.json({
      primary: settingsMap.get('theme_primary') || DEFAULT_THEME_PRIMARY,
      accent: settingsMap.get('theme_accent') || DEFAULT_THEME_ACCENT,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/site-settings/banner', authenticateToken, requireAdmin, async (req, res) => {
  const imageUrl = String(req.body?.imageUrl || '').trim()

  if (!imageUrl) {
    res.status(400).json({ message: 'imageUrl is required.' })
    return
  }

  try {
    await pool.query(
      `
        INSERT INTO site_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = CURRENT_TIMESTAMP
      `,
      ['homepage_banner_image', imageUrl, imageUrl],
    )

    res.json({ imageUrl })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/site-settings/logo', authenticateToken, requireAdmin, async (req, res) => {
  const imageUrl = String(req.body?.imageUrl || '').trim()

  try {
    await pool.query(
      `
        INSERT INTO site_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = CURRENT_TIMESTAMP
      `,
      ['brand_logo_image', imageUrl, imageUrl],
    )

    res.json({ imageUrl })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/site-settings/theme', authenticateToken, requireAdmin, async (req, res) => {
  const primary = String(req.body?.primary || '').trim()
  const accent = String(req.body?.accent || '').trim()
  const hexColorPattern = /^#([0-9a-fA-F]{6})$/

  if (!hexColorPattern.test(primary) || !hexColorPattern.test(accent)) {
    res.status(400).json({ message: 'primary and accent must be 6-digit hex colors.' })
    return
  }

  try {
    await pool.query(
      `
        INSERT INTO site_settings (setting_key, setting_value)
        VALUES (?, ?), (?, ?)
        AS new_val(setting_key, setting_value)
        ON DUPLICATE KEY UPDATE setting_value = new_val.setting_value, updated_at = CURRENT_TIMESTAMP
      `,
      ['theme_primary', primary, 'theme_accent', accent],
    )

    res.json({ primary, accent })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/products', async (req, res) => {
  const payload = req.body || {}

  if (!payload.name || !payload.categoryId) {
    res.status(400).json({ message: 'name and categoryId are required.' })
    return
  }

  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [insertResult] = await connection.query(
      `
        INSERT INTO products
          (cat_id, prod_name, description, flavors, flavor_stock, stock_qty, base_price, preorder_price, sku, preorder_enabled, ready_to_ship_enabled)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(payload.categoryId),
        String(payload.name).trim(),
        payload.description ? String(payload.description).trim() : null,
        serializeFlavorList(payload.flavors),
        payload.flavorStock ? JSON.stringify(payload.flavorStock) : '{}',
        Number(payload.stock) || 0,
        Number(payload.basePrice) || 0,
        payload.preorderPrice == null || payload.preorderPrice === ''
          ? Number(payload.basePrice) || 0
          : Number(payload.preorderPrice) || 0,
        payload.sku ? String(payload.sku).trim() : null,
        toBooleanNumber(payload.preorderEnabled),
        toBooleanNumber(payload.readyToShipEnabled ?? true),
      ],
    )

    const productId = insertResult.insertId

    await upsertProductImages(connection, productId, payload.images)

    await connection.commit()

    const [createdProduct] = await queryProductsByIds([productId], connection)
    res.status(201).json(createdProduct)
  } catch (error) {
    await connection.rollback()
    res.status(500).json({ message: error.message })
  } finally {
    connection.release()
  }
})

app.put('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id)
  const payload = req.body || {}

  if (!payload.name || !payload.categoryId) {
    res.status(400).json({ message: 'name and categoryId are required.' })
    return
  }

  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [result] = await connection.query(
      `
        UPDATE products
        SET
          cat_id = ?,
          prod_name = ?,
          description = ?,
          flavors = ?,
          flavor_stock = ?,
          stock_qty = ?,
          base_price = ?,
          preorder_price = ?,
          sku = ?,
          preorder_enabled = ?,
          ready_to_ship_enabled = ?
        WHERE prod_id = ?
      `,
      [
        Number(payload.categoryId),
        String(payload.name).trim(),
        payload.description ? String(payload.description).trim() : null,
        serializeFlavorList(payload.flavors),
        payload.flavorStock ? JSON.stringify(payload.flavorStock) : '{}',
        Number(payload.stock) || 0,
        Number(payload.basePrice) || 0,
        payload.preorderPrice == null || payload.preorderPrice === ''
          ? Number(payload.basePrice) || 0
          : Number(payload.preorderPrice) || 0,
        payload.sku ? String(payload.sku).trim() : null,
        toBooleanNumber(payload.preorderEnabled),
        toBooleanNumber(payload.readyToShipEnabled ?? true),
        productId,
      ],
    )

    if (result.affectedRows === 0) {
      await connection.rollback()
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    await upsertProductImages(connection, productId, payload.images)

    await connection.commit()

    const [updatedProduct] = await queryProductsByIds([productId], connection)
    res.json(updatedProduct)
  } catch (error) {
    await connection.rollback()
    res.status(500).json({ message: error.message })
  } finally {
    connection.release()
  }
})

app.patch('/api/products/:id/status', async (req, res) => {
  const productId = Number(req.params.id)
  const { key, value } = req.body || {}

  const statusColumnMap = {
    preorderEnabled: 'preorder_enabled',
    readyToShipEnabled: 'ready_to_ship_enabled',
  }

  const column = statusColumnMap[key]
  if (!column) {
    res.status(400).json({ message: 'Invalid status key.' })
    return
  }

  try {
    const [result] = await pool.query(`UPDATE products SET ${column} = ? WHERE prod_id = ?`, [
      toBooleanNumber(value),
      productId,
    ])

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    const [updatedProduct] = await queryProductsByIds([productId])
    res.json(updatedProduct)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/products/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM products WHERE prod_id = ?', [
      Number(req.params.id),
    ])

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    res.status(204).send()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Public API: Get all products for users to browse
app.get('/api/products/public', async (req, res) => {
  try {
    const categoryId = req.query.categoryId
    let sql = `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.description AS description,
        p.flavors AS flavors,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE (p.ready_to_ship_enabled = 1 OR p.preorder_enabled = 1)
    `
    const params = []

    if (categoryId) {
      sql += ' AND p.cat_id = ?'
      params.push(Number(categoryId))
    }

    sql += ' ORDER BY p.prod_id DESC'

    const [productRows] = await pool.query(sql, params)

    // Get product IDs and fetch images
    const productIds = productRows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const products = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      flavors: parseFlavorList(row.flavors),
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      preorderPrice: Number(row.preorderPrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
    }))

    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get ready-to-ship products for users
app.get('/api/products/ready-to-ship', async (req, res) => {
  try {
    const categoryId = req.query.categoryId
    let sql = `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.description AS description,
        p.flavors AS flavors,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.ready_to_ship_enabled = 1
    `
    const params = []

    if (categoryId) {
      sql += ' AND p.cat_id = ?'
      params.push(Number(categoryId))
    }

    sql += ' ORDER BY p.prod_id DESC'

    const [productRows] = await pool.query(sql, params)

    // Get product IDs and fetch images
    const productIds = productRows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const products = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      flavors: parseFlavorList(row.flavors),
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      preorderPrice: Number(row.preorderPrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
    }))

    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get preorder products for users
app.get('/api/products/preorder', async (req, res) => {
  try {
    const categoryId = req.query.categoryId
    let sql = `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.description AS description,
        p.flavors AS flavors,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.preorder_enabled = 1
    `
    const params = []

    if (categoryId) {
      sql += ' AND p.cat_id = ?'
      params.push(Number(categoryId))
    }

    sql += ' ORDER BY p.prod_id DESC'

    const [productRows] = await pool.query(sql, params)

    // Get product IDs and fetch images
    const productIds = productRows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const products = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      flavors: parseFlavorList(row.flavors),
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      preorderPrice: Number(row.preorderPrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
    }))

    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Public API: Get preorder products in open rounds grouped for users
app.get('/api/products/preorder', async (req, res) => {
  try {
    const categoryId = req.query.categoryId
    let sql = `
      SELECT DISTINCT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        COALESCE(prp.round_price, p.base_price) AS price,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM preorder_round_products prp
      JOIN preorder_rounds r ON r.round_id = prp.round_id
      JOIN products p ON p.prod_id = prp.prod_id
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE LOWER(r.status) IN ('active', 'open')
    `
    const params = []

    if (categoryId) {
      sql += ' AND p.cat_id = ?'
      params.push(Number(categoryId))
    }

    sql += ' ORDER BY c.cat_name ASC, p.prod_name ASC'

    const [productRows] = await pool.query(sql, params)

    const productIds = productRows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const products = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      preorderPrice: Number(row.preorderPrice) || 0,
      price: Number(row.price) || Number(row.basePrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
    }))

    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update product stock
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const productId = Number(req.params.id)
    const payload = req.body || {}
    const quantity = Number(payload.quantity) || 0
    const _type = String(payload.type || '').trim() // 'preorder' or 'ready-to-ship'

    // Get current stock
    const [rows] = await pool.query('SELECT stock_qty FROM products WHERE prod_id = ?', [productId])

    if (rows.length === 0) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    const currentStock = Number(rows[0].stock_qty) || 0
    const newStock = Math.max(0, currentStock - quantity) // Decrease stock

    // Update stock
    await pool.query('UPDATE products SET stock_qty = ? WHERE prod_id = ?', [newStock, productId])

    // Get updated product
    const [productRows] = await pool.query(
      `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.prod_id = ?
    `,
      [productId],
    )

    if (productRows.length === 0) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    const productRow = productRows[0]

    // Get images
    const [imageRows] = await pool.query(
      `
      SELECT image_url AS imageUrl
      FROM product_images
      WHERE prod_id = ?
      ORDER BY sort_order ASC, img_id ASC
    `,
      [productId],
    )

    const updatedProduct = {
      id: productRow.id,
      name: productRow.name,
      sku: productRow.sku || '',
      categoryId: productRow.categoryId,
      categoryName: productRow.categoryName || '',
      stock: Number(productRow.stock) || 0,
      basePrice: Number(productRow.basePrice) || 0,
      imageUrls: imageRows.map((row) => row.imageUrl),
      preorderEnabled: Boolean(productRow.preorderEnabled),
      readyToShipEnabled: Boolean(productRow.readyToShipEnabled),
    }

    res.json(updatedProduct)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get low stock alerts
app.get('/api/products/alerts/low-stock', async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 3

    const [rows] = await pool.query(
      `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.stock_qty <= ? AND (p.ready_to_ship_enabled = 1 OR p.preorder_enabled = 1)
      ORDER BY p.stock_qty ASC
    `,
      [threshold],
    )

    // Get product IDs and fetch images
    const productIds = rows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const alerts = rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
      message: `เธกเธตเน€เธซเธฅเธทเธญเน€เธเธตเธขเธ ${row.stock} เธเธดเนเธ`,
    }))

    res.json(alerts)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// ============== Preorder Rounds Management ==============

// Admin API: Get ALL preorder rounds (ทุกสถานะ)
app.get('/api/preorder-rounds', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [rounds] = await pool.query(`
      SELECT
        round_id          AS id,
        round_name        AS name,
        round_description AS description,
        start_date        AS startDate,
        end_date          AS endDate,
        status,
        created_at        AS createdAt,
        updated_at        AS updatedAt
      FROM preorder_rounds
      ORDER BY round_id DESC
    `)

    res.json(rounds)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Public API: Get active preorder rounds for users
app.get('/api/preorder-rounds/active', async (_req, res) => {
  try {
    const [rounds] = await pool.query(`
      SELECT
        round_id,
        round_name,
        round_description,
        start_date,
        end_date,
        status
      FROM preorder_rounds
      WHERE status = 'active'
      ORDER BY end_date ASC
    `)

    res.json(rounds)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get single preorder round with products
app.get('/api/preorder-rounds/:id', authenticateToken, requireAdmin, async (req, res) => {
  const roundId = Number(req.params.id)

  try {
    const [roundRows] = await pool.query(
      `
      SELECT
        round_id AS id,
        round_name AS name,
        round_description AS description,
        start_date AS startDate,
        end_date AS endDate,
        status
      FROM preorder_rounds
      WHERE round_id = ?
    `,
      [roundId],
    )

    if (roundRows.length === 0) {
      res.status(404).json({ message: 'Preorder round not found' })
      return
    }

    const round = roundRows[0]

    const hasQuantitySold = await ensurePreorderQuantitySoldColumn()
    const productQuery = hasQuantitySold
      ? `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        prp.quantity_available AS quantityAvailable,
        COALESCE(prp.quantity_sold, 0) AS quantitySold,
        (prp.quantity_available - COALESCE(prp.quantity_sold, 0)) AS quantityRemaining,
        prp.round_price AS roundPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM preorder_round_products prp
      JOIN products p ON p.prod_id = prp.prod_id
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE prp.round_id = ?
      ORDER BY p.prod_id DESC
    `
      : `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        prp.quantity_available AS quantityAvailable,
        0 AS quantitySold,
        prp.quantity_available AS quantityRemaining,
        prp.round_price AS roundPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM preorder_round_products prp
      JOIN products p ON p.prod_id = prp.prod_id
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE prp.round_id = ?
      ORDER BY p.prod_id DESC
    `

    const [productRows] = await pool.query(productQuery, [roundId])

    // Get images for all products
    const productIds = productRows.map((row) => row.id)
    let imageUrlMap = new Map()

    if (productIds.length > 0) {
      const [imageRows] = await pool.query(
        `
        SELECT prod_id AS productId, image_url AS imageUrl
        FROM product_images
        WHERE prod_id IN (?)
        ORDER BY sort_order ASC, img_id ASC
      `,
        [productIds],
      )

      for (const row of imageRows) {
        const list = imageUrlMap.get(row.productId) || []
        list.push(row.imageUrl)
        imageUrlMap.set(row.productId, list)
      }
    }

    const products = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      quantityAvailable: Number(row.quantityAvailable) || 0,
      quantitySold: Number(row.quantitySold) || 0,
      quantityRemaining: Number(row.quantityRemaining) || 0,
      roundPrice: row.roundPrice ? Number(row.roundPrice) : Number(row.basePrice) || 0,
      imageUrls: imageUrlMap.get(row.id) || [],
      preorderEnabled: Boolean(row.preorderEnabled),
      readyToShipEnabled: Boolean(row.readyToShipEnabled),
    }))

    res.json({
      ...round,
      products,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Create new preorder round
app.post('/api/preorder-rounds', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, startDate, endDate, status } = req.body || {}

  if (!name || !startDate || !endDate) {
    res.status(400).json({ message: 'name, startDate, and endDate are required' })
    return
  }

  const statusValue =
    status && String(status).trim() ? String(status).trim().toLowerCase() : 'active'
  const normalizedStatus =
    statusValue === 'open'
      ? 'active'
      : ['active', 'closed', 'archived'].includes(statusValue)
        ? statusValue
        : 'active'

  try {
    const [result] = await pool.query(
      `
      INSERT INTO preorder_rounds (round_name, round_description, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?)
    `,
      [
        String(name).trim(),
        description ? String(description).trim() : null,
        new Date(startDate),
        new Date(endDate),
        normalizedStatus,
      ],
    )

    const newRound = {
      id: result.insertId,
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: normalizedStatus,
      products: [],
    }

    res.status(201).json(newRound)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update preorder round
app.put('/api/preorder-rounds/:id', authenticateToken, requireAdmin, async (req, res) => {
  const roundId = Number(req.params.id)
  const { name, description, startDate, endDate, status } = req.body || {}

  if (!name || !startDate || !endDate) {
    res.status(400).json({ message: 'name, startDate, and endDate are required' })
    return
  }

  const statusValue =
    status && String(status).trim() ? String(status).trim().toLowerCase() : 'active'
  const normalizedStatus =
    statusValue === 'open'
      ? 'active'
      : ['active', 'closed', 'archived'].includes(statusValue)
        ? statusValue
        : 'active'

  try {
    const [existingRoundRows] = await pool.query(
      'SELECT status FROM preorder_rounds WHERE round_id = ? LIMIT 1',
      [roundId],
    )
    const previousStatus = String(existingRoundRows[0]?.status || '')
      .trim()
      .toLowerCase()

    const [result] = await pool.query(
      `
      UPDATE preorder_rounds
      SET
        round_name = ?,
        round_description = ?,
        start_date = ?,
        end_date = ?,
        status = ?
      WHERE round_id = ?
    `,
      [
        String(name).trim(),
        description ? String(description).trim() : null,
        new Date(startDate),
        new Date(endDate),
        normalizedStatus,
        roundId,
      ],
    )

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Preorder round not found' })
      return
    }

    const [updatedRound] = await pool.query(
      `
      SELECT
        round_id AS id,
        round_name AS name,
        round_description AS description,
        start_date AS startDate,
        end_date AS endDate,
        status
      FROM preorder_rounds
      WHERE round_id = ?
    `,
      [roundId],
    )

    // ✅ Auto-create orders เมื่อรอบถูกปิด
    // สร้าง order แยกต่อ user จากสินค้า item_type = 'preorder' ของรอบนี้เท่านั้น
    let autoOrderSummary = { created: 0, skipped: 0, errors: [] }
    if (normalizedStatus === 'closed' && previousStatus !== 'closed') {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        autoOrderSummary = await createPreorderOrdersForClosedRound(connection, roundId)

        await connection.commit()
      } catch (autoErr) {
        await connection.rollback()
        console.error('[auto-order] rollback round_id=', roundId, autoErr.message)
      } finally {
        connection.release()
      }
    }

    res.json({ ...updatedRound[0], autoOrderSummary })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete preorder round
app.delete('/api/preorder-rounds/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM preorder_rounds WHERE round_id = ?', [
      Number(req.params.id),
    ])

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Preorder round not found' })
      return
    }

    res.status(204).send()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Add product to preorder round
app.post('/api/preorder-rounds/:id/products', authenticateToken, requireAdmin, async (req, res) => {
  const roundId = Number(req.params.id)
  const { productIds, quantities, roundPrices } = req.body || {}

  if (!Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ message: 'productIds array is required' })
    return
  }

  try {
    const [roundRows] = await pool.query(
      'SELECT round_id FROM preorder_rounds WHERE round_id = ? LIMIT 1',
      [roundId],
    )

    if (roundRows.length === 0) {
      res.status(404).json({ message: 'Preorder round not found' })
      return
    }

    const resolvedRoundId = Number(roundRows[0].round_id)
    if (!Number.isFinite(resolvedRoundId) || resolvedRoundId <= 0) {
      res.status(400).json({ message: 'Invalid preorder round id' })
      return
    }

    const [productRows] = await pool.query(
      'SELECT prod_id AS prodId, base_price AS basePrice FROM products WHERE prod_id IN (?)',
      [productIds.map((pid) => Number(pid))],
    )

    const productPriceMap = new Map(
      productRows.map((row) => [String(row.prodId), Number(row.basePrice) || 0]),
    )

    const [preorderPriceRows] = await pool.query(
      'SELECT prod_id AS prodId, preorder_price AS preorderPrice FROM products WHERE prod_id IN (?)',
      [productIds.map((pid) => Number(pid))],
    )

    const preorderPriceMap = new Map(
      preorderPriceRows.map((row) => [String(row.prodId), Number(row.preorderPrice) || 0]),
    )

    for (const [index, pid] of productIds.entries()) {
      const quantityValue =
        quantities && quantities[index] !== undefined ? Number(quantities[index]) : 0
      const roundPriceValue =
        roundPrices && roundPrices[index] !== undefined && roundPrices[index] !== null
          ? Number(roundPrices[index])
          : (preorderPriceMap.get(String(pid)) ?? productPriceMap.get(String(pid)) ?? 0)

      await pool.query(
        `
        INSERT INTO preorder_round_products (round_id, prod_id, quantity_available, round_price)
        SELECT ?, ?, ?, ?
        FROM preorder_rounds
        WHERE round_id = ?
        ON DUPLICATE KEY UPDATE
          quantity_available = VALUES(quantity_available),
          round_price = COALESCE(VALUES(round_price), round_price)
      `,
        [resolvedRoundId, Number(pid), quantityValue, roundPriceValue, resolvedRoundId],
      )
    }

    await pool.query(`UPDATE products SET preorder_enabled = 1 WHERE prod_id IN (?)`, [
      productIds.map((pid) => Number(pid)),
    ])

    res.json({ message: 'Products added to round successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Remove product from preorder round
app.delete(
  '/api/preorder-rounds/:id/products/:productId',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [result] = await pool.query(
        `
      DELETE FROM preorder_round_products
      WHERE round_id = ? AND prod_id = ?
    `,
        [Number(req.params.id), Number(req.params.productId)],
      )

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Product not found in this round' })
        return
      }

      res.status(204).send()
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  },
)

// Update product quantity and/or price in preorder round
app.put(
  '/api/preorder-rounds/:id/products/:productId',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const roundId = Number(req.params.id)
    const productId = Number(req.params.productId)
    const { quantity, price } = req.body || {}

    if (quantity === undefined && price === undefined) {
      res.status(400).json({ message: 'quantity and/or price must be provided' })
      return
    }

    if (quantity !== undefined && quantity !== null && Number(quantity) < 0) {
      res.status(400).json({ message: 'quantity must be null or a non-negative number' })
      return
    }

    if (price !== undefined && price !== null && Number(price) < 0) {
      res.status(400).json({ message: 'price must be null or a non-negative number' })
      return
    }

    try {
      const updateFields = []
      const values = []

      if (quantity !== undefined) {
        updateFields.push('quantity_available = ?')
        values.push(quantity === null ? null : Number(quantity))
      }

      if (price !== undefined) {
        updateFields.push('round_price = ?')
        values.push(price === null ? null : Number(price))
      }

      const [result] = await pool.query(
        `
      UPDATE preorder_round_products
      SET ${updateFields.join(', ')}
      WHERE round_id = ? AND prod_id = ?
    `,
        [...values, roundId, productId],
      )

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Product not found in this round' })
        return
      }

      res.json({ message: 'Product updated successfully' })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  },
)

// Get stock information for a preorder round
app.get(
  '/api/preorder-rounds/:id/stock-info',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const roundId = Number(req.params.id)

    try {
      const [stockInfo] = await pool.query(
        `
      SELECT
        prod_id,
        quantity_available,
        COALESCE(quantity_sold, 0) AS quantity_sold,
        (quantity_available - COALESCE(quantity_sold, 0)) AS quantity_remaining
      FROM preorder_round_products
      WHERE round_id = ?
      ORDER BY prod_id
    `,
        [roundId],
      )

      res.json(stockInfo)
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  },
)

// ========== Preorder Import Fee Management ========== //

// 1A. GET /api/admin/preorder-import-fee/rounds
app.get(
  '/api/admin/preorder-import-fee/rounds',
  authenticateToken,
  requireAdmin,
  async (_req, res) => {
    try {
      const [rows] = await pool.query(`
      SELECT
        pr.round_id,
        pr.round_name,
        pr.status AS round_status,
        pr.start_date,
        pr.end_date,
        od.prod_id,
        p.prod_name AS product_name,
        od.flavor,
        SUM(od.qty) AS total_sold_qty,
        SUM(COALESCE(od.received_qty, 0)) AS total_received_qty,
        od.Price AS unit_price,
        COALESCE(prp.import_fee_per_products, 0) AS import_fee
      FROM preorder_rounds pr
      JOIN order_details od ON od.preorder_round_id = pr.round_id
      JOIN orders o ON o.order_id = od.order_id
      LEFT JOIN products p ON p.prod_id = od.prod_id
      LEFT JOIN preorder_round_products prp
        ON prp.round_id = pr.round_id
       AND prp.prod_id = od.prod_id
      WHERE LOWER(o.Order_type) = 'preorder'
      GROUP BY
        pr.round_id,
        pr.round_name,
        pr.status,
        pr.start_date,
        pr.end_date,
        od.prod_id,
        p.prod_name,
        od.flavor,
        od.Price,
        prp.import_fee_per_products
      ORDER BY pr.round_id DESC, od.prod_id ASC, od.flavor ASC
    `)

      // Group by round
      const roundMap = new Map()
      for (const row of rows) {
        if (!roundMap.has(row.round_id)) {
          roundMap.set(row.round_id, {
            round_id: row.round_id,
            round_name: row.round_name,
            round_status: row.round_status,
            start_date: row.start_date,
            end_date: row.end_date,
            products: [],
          })
        }
        roundMap.get(row.round_id).products.push({
          prod_id: row.prod_id,
          product_name: row.product_name,
          flavor: row.flavor,
          total_sold_qty: Number(row.total_sold_qty) || 0,
          total_received_qty: Number(row.total_received_qty) || 0,
          unit_price: Number(row.unit_price) || 0,
          current_import_fee: Number(row.import_fee) || 0,
        })
      }
      res.json(Array.from(roundMap.values()))
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  },
)

// 1B. PUT /api/admin/preorder-import-fee/:roundId
app.put(
  '/api/admin/preorder-import-fee/:roundId',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const roundId = Number(req.params.roundId)
    const { fees } = req.body || {}
    if (!Array.isArray(fees) || fees.length === 0) {
      return res.status(400).json({ success: false, message: 'fees array is required' })
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      // Update import fee values per product in this round
      const feeByProduct = new Map()
      for (const item of fees) {
        const prodId = Number(item.prod_id)
        if (!Number.isFinite(prodId)) continue
        const feeValue = Number(item.import_fee)
        feeByProduct.set(prodId, Number.isNaN(feeValue) ? 0 : feeValue)
      }

      for (const [prodId, feeValue] of feeByProduct.entries()) {
        await connection.query(
          `UPDATE preorder_round_products
           SET import_fee_per_products = ?
           WHERE round_id = ? AND prod_id = ?`,
          [feeValue, roundId, prodId],
        )
      }

      // ดึง order_details ที่เป็น preorder ของรอบนี้ พร้อม import_fee_per_products ล่าสุด
      const [detailRows] = await connection.query(
        `SELECT od.detail_id, od.order_id, od.prod_id, od.qty,
          COALESCE(od.received_qty, 0) AS received_qty,
                COALESCE(prp.import_fee_per_products, 0) AS import_fee_per_products,
                COALESCE(prp.quantity_sold, 1) AS quantity_sold
         FROM order_details od
         JOIN preorder_round_products prp
           ON prp.round_id = ?
          AND prp.prod_id = od.prod_id
         WHERE od.preorder_round_id = ?
           AND od.item_type = 'preorder'`,
        [roundId, roundId],
      )

      // คำนวณ qty ที่รับจริงรวมต่อ prod_id ก่อน เพื่อไม่ให้นับของที่ขาดในค่านำเข้า
      const totalReceivedQtyByProd = {}
      for (const row of detailRows) {
        const pid = row.prod_id
        const receivedQty = Math.max(Number(row.received_qty) || 0, 0)
        totalReceivedQtyByProd[pid] = (totalReceivedQtyByProd[pid] || 0) + receivedQty
      }

      const orderTotals = {}
      for (const row of detailRows) {
        const receivedQty = Math.max(Number(row.received_qty) || 0, 0)
        const totalReceivedQty = totalReceivedQtyByProd[row.prod_id] || 0
        const importFeeTotal = Number(row.import_fee_per_products)
        // ค่านำเข้าของ line นี้ = ค่านำเข้ารวม × (qty ที่รับจริงของแถวนี้ / qty ที่รับจริงรวมทั้งหมด)
        const detailImportFee =
          totalReceivedQty > 0 ? importFeeTotal * (receivedQty / totalReceivedQty) : 0

        await connection.query('UPDATE order_details SET Import_fee = ? WHERE detail_id = ?', [
          Math.round(detailImportFee * 100) / 100,
          row.detail_id,
        ])

        orderTotals[row.order_id] = (orderTotals[row.order_id] || 0) + detailImportFee
      }

      await connection.query(
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS import_fee_total DECIMAL(10,2) DEFAULT 0`,
      )

      let updatedOrders = 0
      const orderIds = []
      for (const [orderId, amount] of Object.entries(orderTotals)) {
        await connection.query(`UPDATE orders SET import_fee_total = ? WHERE order_id = ?`, [
          Math.round(amount * 100) / 100,
          Number(orderId),
        ])
        orderIds.push(Number(orderId))
        updatedOrders++
      }

      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => '?').join(',')
        const deadline48h = new Date(Date.now() + 48 * 60 * 60 * 1000)

        // เปลี่ยนสถานะและตั้ง deadline เฉพาะออเดอร์ที่แอดมินอนุมัติสลิปรอบแรกแล้ว (Wait_for_Import_Fee) เท่านั้น
        await connection.query(
          `UPDATE orders
           SET status = 'Pending_import_fee',
               deadline = ?
           WHERE order_id IN (${placeholders})
             AND Order_type = 'Preorder'
             AND status = 'Wait_for_Import_Fee'`,
          [deadline48h, ...orderIds],
        )
      }

      await connection.commit()
      res.json({
        success: true,
        message: 'บันทึกค่านำเข้าเรียบร้อย',
        updated_orders: updatedOrders,
      })
    } catch (error) {
      await connection.rollback()
      res.status(500).json({ success: false, message: error.message })
    } finally {
      connection.release()
    }
  },
)

// POST /api/orders/:order_id/payment
app.post('/api/orders/:order_id/payment', upload.single('slip'), async (req, res) => {
  const { order_id } = req.params
  const { payment_method, shipping_name, shipping_phone, shipping_address, notes } = req.body
  const { shipping_carrier } = req.body
  const slip_url = req.file ? `/uploads/${req.file.filename}` : null

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // 1. ตรวจสอบข้อมูล Order เดิมเพื่อยอดเงินและประเภท พร้อมสถานะ
    const [orderRows] = await connection.query(
      'SELECT total_amount, import_fee_total, Order_type, status FROM orders WHERE order_id = ?',
      [order_id],
    )

    if (orderRows.length === 0) {
      throw new Error('ไม่พบข้อมูลออเดอร์')
    }

    const orderData = orderRows[0]

    // 2. Determine payment type and amount based on order status
    let paymentType, paymentAmount
    if (orderData.Order_type === 'Ready') {
      paymentType = 'Ready pay'
      paymentAmount = orderData.total_amount
    } else if (
      orderData.Order_type === 'Preorder' &&
      [
        'Wait_for_Import_Fee',
        'Pending_import_fee',
        'Import_slip_submitted',
        'Invalid import slip',
      ].includes(orderData.status)
    ) {
      // Round 2: user is paying the import fee
      paymentType = 'Import_Fee'
      paymentAmount = Number(orderData.import_fee_total) || 0
    } else if (orderData.Order_type === 'Preorder') {
      // Round 1: user is paying the initial order amount
      paymentType = 'Order_fee'
      paymentAmount = orderData.total_amount
    } else if (orderData.Order_type === 'Pending_import') {
      // กรณี retry รอบ 2
      paymentType = 'Import_Fee'
      paymentAmount = Number(orderData.import_fee_total) || 0
    } else {
      return res.status(400).json({ error: 'ไม่รองรับประเภทออเดอร์นี้' })
    }
    await connection.query(
      `INSERT INTO payment (order_id, type, amount, slip_img, Slip_date, status, payment_method)
       VALUES (?, ?, ?, ?, NOW(), 'Pending', ?)`,
      [order_id, paymentType, paymentAmount, slip_url, payment_method || null],
    )
    // ถ้าเป็นรอบ 2 ของ preorder หรือ retry รอบ 2 ให้เปลี่ยน Order_type เป็น Pending_import
    // แก้ไขใน index.js (ฟังก์ชันส่งสลิปโอนเงิน)
    if (paymentType === 'Import_Fee') {
      // เปลี่ยนเป็น Import_slip_submitted เพื่อให้แอดมินรู้ว่า user แนบสลิปค่านำเข้ามาแล้ว
      await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [
        'Import_slip_submitted',
        order_id,
      ])
    }

    // 3. บันทึกที่อยู่ลงตาราง shipping
    await connection.query(
      `INSERT INTO shipping (order_id, name, phone, address, notes, Shipping_Carrier) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        order_id,
        shipping_name || null,
        shipping_phone || null,
        shipping_address || null,
        notes || null,
        shipping_carrier || null,
      ],
    )

    // 4-8. เฉพาะรอบแรกเท่านั้น (orderData.status !== 'Wait_for_Import_Fee' && orderData.status !== 'Pending_import_fee')
    // Round 1: reset to Pending so admin can see it for approval
    // Round 2: keep import-fee status — do NOT overwrite; admin needs to see it
    if (
      ![
        'Wait_for_Import_Fee',
        'Pending_import_fee',
        'Import_slip_submitted',
        'Invalid import slip',
      ].includes(orderData.status)
    ) {
      // 4. ดึงรายละเอียดออเดอร์เพื่อเคลียร์ตะกร้าและปรับสต็อกหลังชำระเงินจริง
      const [detailRows] = await connection.query(
        `SELECT od.prod_id, od.qty, od.Price AS unit_price, od.flavor
         FROM order_details od
         WHERE od.order_id = ?`,
        [order_id],
      )

      // 5. ลบรายการในตะกร้าที่ถูกยืนยันชำระแล้ว
      if (detailRows.length > 0) {
        for (const detail of detailRows) {
          await connection.query(
            `DELETE FROM cart
             WHERE prod_id = ?
               AND user_id = (SELECT user_id FROM orders WHERE order_id = ?)
               AND qty = ?
               AND COALESCE(flavor, '') = COALESCE(?, '')
               AND COALESCE(round_price, 0) = COALESCE(?, 0)
             LIMIT 1`,
            [detail.prod_id, order_id, detail.qty, detail.flavor || '', detail.unit_price || 0],
          )
        }
      }

      // 6. ลดสต็อกสำหรับสินค้าที่พร้อมส่งเมื่อชำระเงินสำเร็จ
      if (String(orderData.Order_type || '').toLowerCase() === 'ready') {
        for (const detail of detailRows) {
          await adjustProductStock(
            connection,
            detail.prod_id,
            -Number(detail.qty) || 0,
            detail.flavor,
          )
        }
      }

      // 7. อัปเดตสถานะในตาราง orders เป็น 'Slip_submitted' เพื่อให้แอดมินรู้ว่า user แนบสลิปมาแล้ว
      await connection.query(`UPDATE orders SET status = 'Slip_submitted' WHERE order_id = ?`, [
        order_id,
      ])

      // 8. ลบรายการในตะกร้าหลังชำระเงินสำเร็จ
      const [userIdRows] = await connection.query('SELECT user_id FROM orders WHERE order_id = ?', [
        order_id,
      ])
      if (userIdRows.length > 0) {
        const userId = userIdRows[0].user_id
        await connection.query('DELETE FROM cart WHERE user_id = ?', [userId])
      }
    }

    await connection.commit()
    res.json({ success: true, message: 'ส่งหลักฐานและบันทึกที่อยู่เรียบร้อยแล้ว' })
  } catch (error) {
    await connection.rollback()
    console.error('Database Error:', error)
    res.status(500).json({ error: error.message })
  } finally {
    connection.release()
  }
})

// POST /api/orders/:order_id/shipping
app.post('/api/orders/:order_id/shipping', async (req, res) => {
  const { order_id } = req.params
  const { shipping_name, shipping_phone, shipping_address, shipping_carrier, notes } = req.body

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [orderRows] = await connection.query('SELECT order_id FROM orders WHERE order_id = ?', [
      order_id,
    ])
    if (orderRows.length === 0) {
      throw new Error('ไม่พบข้อมูลออเดอร์')
    }

    await connection.query(
      `INSERT INTO shipping (order_id, name, phone, address, notes, Shipping_Carrier)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        order_id,
        shipping_name || null,
        shipping_phone || null,
        shipping_address || null,
        notes || null,
        shipping_carrier || null,
      ],
    )

    await connection.commit()
    res.json({ success: true, message: 'บันทึกข้อมูลจัดส่งเรียบร้อยแล้ว' })
  } catch (error) {
    await connection.rollback()
    console.error('Database Error:', error)
    res.status(500).json({ error: error.message })
  } finally {
    connection.release()
  }
})

// ─────────────────────────────────────────────
// GET /api/payments
// ดึงรายการ payment ทั้งหมด (admin)
// ─────────────────────────────────────────────
app.get('/api/payments', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, o.user_id, o.Order_type, a.username
       FROM payment p
       LEFT JOIN orders o ON p.order_id = o.order_id
       LEFT JOIN accounts a ON o.user_id = a.user_id
       ORDER BY p.Slip_date DESC`,
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────
// PATCH /api/payments/:pay_id/status
// อัปเดตสถานะสลิป (admin)
// ─────────────────────────────────────────────
app.patch('/api/payments/:pay_id/status', async (req, res) => {
  const { pay_id } = req.params
  const { status } = req.body

  if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' })
  }

  try {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query('UPDATE payment SET status = ? WHERE pay_id = ?', [status, pay_id])

      if (status === 'Approved') {
        // Use payment type to determine correct order status for preorder 2-round payment
        const [payRows] = await connection.query(
          `SELECT p.order_id, p.type AS pay_type, o.Order_type, o.import_fee_total
           FROM payment p
           LEFT JOIN orders o ON p.order_id = o.order_id
           WHERE p.pay_id = ? LIMIT 1`,
          [pay_id],
        )

        if (payRows.length > 0) {
          const { order_id, pay_type, Order_type } = payRows[0]

          if (Order_type === 'Preorder' || Order_type === 'Pending_import') {
            if (pay_type === 'Import_Fee') {
              // Round 2 approved: mark Paid and set Order_type back to Preorder
              await connection.query(
                'UPDATE orders SET status = ?, Order_type = ? WHERE order_id = ?',
                ['Paid', 'Preorder', order_id],
              )
            } else {
              // Round 1 (Order_fee) approved: เช็กก่อนว่ามีค่านำเข้าหรือยัง
              const importFeeTotal = Number(payRows[0].import_fee_total || 0)

              if (importFeeTotal > 0) {
                // ถ้าแอดมินเคยใส่ค่านำเข้ารอไว้แล้วตอนสถานะ Pending ให้กระโดดไปรอบ 2 เลย
                const deadline48h = new Date(Date.now() + 48 * 60 * 60 * 1000)
                await connection.query(
                  'UPDATE orders SET status = ?, deadline = ? WHERE order_id = ?',
                  ['Pending_import_fee', deadline48h, order_id],
                )
              } else {
                // ถ้ายังไม่มีค่านำเข้า ก็ให้ไปรอตามปกติ
                await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [
                  'Wait_for_Import_Fee',
                  order_id,
                ])
              }
            }
          } else {
            // Ready order: straightforward approval
            await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [
              'Paid',
              order_id,
            ])
          }
        }
      }

      await connection.commit()
      res.json({ success: true })
    } catch (error) {
      await connection.rollback()
      res.status(500).json({ error: error.message })
    } finally {
      connection.release()
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/inventory-intake/orders
// ดึงรายการออเดอร์ที่รอรับสินค้าเข้า พร้อมรายละเอียดแต่ละรายการ
// ─────────────────────────────────────────────
app.get('/api/admin/inventory-intake/orders', authenticateToken, requireAdmin, async (req, res) => {
  const statusFilter = String(req.query.status || '').trim()

  try {
    let orderQuery = `
      SELECT
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status,
        o.Order_type AS order_type,
        o.Order_date AS order_date,
        a.username,
        a.full_name
      FROM orders o
      LEFT JOIN accounts a ON a.user_id = o.user_id
      WHERE LOWER(o.Order_type) = 'preorder'
    `
    const orderParams = []

    if (statusFilter) {
      orderQuery += ' AND LOWER(o.status) = ?'
      orderParams.push(statusFilter.toLowerCase())
    }

    orderQuery += ' ORDER BY o.Order_date DESC, o.order_id DESC'

    const [orderRows] = await pool.query(orderQuery, orderParams)
    const orderIds = orderRows.map((row) => Number(row.order_id))

    let detailRows = []
    if (orderIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT
           od.detail_id,
           od.order_id,
           od.prod_id,
           od.flavor,
           od.Price AS unit_price,
           od.qty AS ordered_qty,
           COALESCE(od.received_qty, 0) AS received_qty,
           COALESCE(od.arrival_status, 'Pending') AS arrival_status,
           p.prod_name AS product_name,
           p.stock_qty AS stock_qty,
           COALESCE(
         (
           SELECT pi.image_url
           FROM product_images pi
           WHERE pi.prod_id = p.prod_id
             -- ดึงรูปที่รสชาติตรงกัน หรือถ้าไม่เจอให้ดึงรูปรสชาติว่าง (รูปหลัก)
             AND (pi.flavor = od.flavor OR pi.flavor IS NULL OR pi.flavor = '')
           -- เรียงให้ความสำคัญกับรูปที่มีรสชาติตรงกันขึ้นก่อนรูปหลัก
           ORDER BY CASE WHEN pi.flavor = od.flavor THEN 1 ELSE 2 END ASC, pi.sort_order ASC, pi.img_id ASC
           LIMIT 1
         ),
         ''
       ) AS image_url
         FROM order_details od
         LEFT JOIN products p ON p.prod_id = od.prod_id
         WHERE od.order_id IN (?)
         ORDER BY od.order_id DESC, od.detail_id ASC`,
        [orderIds],
      )

      detailRows = rows
    }

    const orderMap = new Map(
      orderRows.map((order) => [Number(order.order_id), { ...order, items: [], summary: null }]),
    )

    for (const detail of detailRows) {
      const order = orderMap.get(Number(detail.order_id))
      if (!order) continue

      const orderedQty = Number(detail.ordered_qty) || 0
      const receivedQty = Number(detail.received_qty) || 0
      const missingQty = Math.max(orderedQty - receivedQty, 0)
      const unitPrice = Number(detail.unit_price) || 0
      const lineTotal = orderedQty * unitPrice
      const receivedTotal = receivedQty * unitPrice

      order.items.push({
        detail_id: Number(detail.detail_id),
        prod_id: Number(detail.prod_id),
        product_name: detail.product_name || 'สินค้า',
        flavor: detail.flavor || '',
        ordered_qty: orderedQty,
        received_qty: receivedQty,
        missing_qty: missingQty,
        arrival_status: detail.arrival_status || 'Pending',
        stock_qty: Number(detail.stock_qty) || 0,
        unit_price: unitPrice,
        line_total: lineTotal,
        received_total: receivedTotal,
        refund_amount:
          String(detail.arrival_status || 'Pending').toLowerCase() === 'missing'
            ? missingQty * unitPrice
            : 0,
        image_url: detail.image_url || '',
      })
    }

    const orders = Array.from(orderMap.values()).map((order) => {
      const items = order.items
      const orderedAmount = items.reduce((sum, item) => sum + item.line_total, 0)
      const receivedAmount = items.reduce((sum, item) => sum + item.received_total, 0)
      const missingAmount = Math.max(orderedAmount - receivedAmount, 0)
      const completedItems = items.filter((item) => item.missing_qty === 0).length

      return {
        order_id: Number(order.order_id),
        user_id: Number(order.user_id),
        username: order.username || '',
        full_name: order.full_name || '',
        status: order.status || 'Pending',
        order_type: order.order_type || 'Preorder',
        order_date: order.order_date,
        total_amount: Number(order.total_amount) || 0,
        items,
        summary: {
          total_items: items.length,
          completed_items: completedItems,
          partial_items: items.filter((item) => item.missing_qty > 0 && item.received_qty > 0)
            .length,
          missing_items: items.filter((item) => item.received_qty === 0).length,
          ordered_amount: orderedAmount,
          received_amount: receivedAmount,
          missing_amount: missingAmount,
          fully_received: items.length > 0 && items.every((item) => item.missing_qty === 0),
        },
      }
    })

    res.json(orders)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/inventory-intake/rounds
// ดึงรายการรอบพรีออเดอร์ที่รอรับสินค้าเข้า พร้อมสรุปรวมทั้งรอบ
// ─────────────────────────────────────────────
app.get('/api/admin/inventory-intake/rounds', authenticateToken, requireAdmin, async (req, res) => {
  const statusFilter = String(req.query.status || '').trim()

  try {
    let roundSql = `
      SELECT
        pr.round_id,
        pr.round_name,
        pr.status AS round_status,
        pr.start_date,
        pr.end_date
      FROM preorder_rounds pr
    `
    const roundParams = []

    if (statusFilter) {
      roundSql += ' WHERE LOWER(pr.status) = ?'
      roundParams.push(statusFilter.toLowerCase())
    } else {
      // Intake should only be done after the round is closed.
      roundSql += ' WHERE LOWER(pr.status) = ?'
      roundParams.push('closed')
    }

    roundSql += ' ORDER BY pr.round_id DESC'

    const [roundRows] = await pool.query(roundSql, roundParams)

    let detailSql = `
      SELECT
        od.preorder_round_id AS round_id,
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status AS order_status,
        o.Order_date AS order_date,
        a.username,
        a.full_name,
        od.detail_id,
        od.prod_id,
        od.flavor,
        od.Price AS unit_price,
        od.qty AS ordered_qty,
        COALESCE(od.received_qty, 0) AS received_qty,
        COALESCE(od.arrival_status, 'Pending') AS arrival_status,
        p.prod_name AS product_name,
        p.stock_qty AS stock_qty,
        COALESCE(
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.prod_id = od.prod_id
            ORDER BY pi.sort_order ASC, pi.img_id ASC
            LIMIT 1
          ),
          ''
        ) AS image_url
      FROM order_details od
      JOIN orders o ON o.order_id = od.order_id
      JOIN preorder_rounds pr ON pr.round_id = od.preorder_round_id
      LEFT JOIN accounts a ON a.user_id = o.user_id
      LEFT JOIN products p ON p.prod_id = od.prod_id
      WHERE LOWER(o.Order_type) = 'preorder'
        AND od.preorder_round_id IS NOT NULL
    `
    const detailParams = []

    if (statusFilter) {
      detailSql += ' AND LOWER(pr.status) = ?'
      detailParams.push(statusFilter.toLowerCase())
    } else {
      detailSql += ' AND LOWER(pr.status) = ?'
      detailParams.push('closed')
    }

    detailSql +=
      ' ORDER BY od.preorder_round_id DESC, o.Order_date DESC, o.order_id DESC, od.detail_id ASC'

    const [rows] = await pool.query(detailSql, detailParams)

    const roundMap = new Map()

    for (const roundRow of roundRows) {
      const roundId = Number(roundRow.round_id)
      if (!roundId) continue

      roundMap.set(roundId, {
        round_id: roundId,
        round_name: roundRow.round_name || `รอบ #${roundId}`,
        round_status: roundRow.round_status || 'active',
        start_date: roundRow.start_date || null,
        end_date: roundRow.end_date || null,
        ordersMap: new Map(),
        itemsMap: new Map(),
      })
    }

    for (const row of rows) {
      const roundId = Number(row.round_id)
      if (!roundId) continue

      if (!roundMap.has(roundId)) {
        roundMap.set(roundId, {
          round_id: roundId,
          round_name: `รอบ #${roundId}`,
          round_status: 'active',
          start_date: null,
          end_date: null,
          ordersMap: new Map(),
          itemsMap: new Map(),
        })
      }

      const round = roundMap.get(roundId)
      const orderId = Number(row.order_id)

      if (!round.ordersMap.has(orderId)) {
        round.ordersMap.set(orderId, {
          order_id: orderId,
          user_id: Number(row.user_id) || null,
          username: row.username || '',
          full_name: row.full_name || '',
          status: row.order_status || 'Pending',
          order_date: row.order_date,
          total_amount: Number(row.total_amount) || 0,
          item_count: 0,
          total_qty: 0,
        })
      }

      const orderedQty = Number(row.ordered_qty) || 0
      const receivedQty = Number(row.received_qty) || 0
      const unitPrice = Number(row.unit_price) || 0
      const lineKey = `${row.prod_id}|${String(row.flavor || '').trim()}|${unitPrice}`

      const order = round.ordersMap.get(orderId)
      order.item_count += 1
      order.total_qty += orderedQty

      if (!round.itemsMap.has(lineKey)) {
        round.itemsMap.set(lineKey, {
          detail_id: lineKey,
          line_key: lineKey,
          prod_id: Number(row.prod_id),
          product_name: row.product_name || 'สินค้า',
          flavor: row.flavor || '',
          ordered_qty: 0,
          received_qty: 0,
          arrival_status: 'Pending',
          stock_qty: Number(row.stock_qty) || 0,
          unit_price: unitPrice,
          image_url: row.image_url || '',
          detail_ids: [],
          order_ids: new Set(),
        })
      }

      const item = round.itemsMap.get(lineKey)
      item.ordered_qty += orderedQty
      item.received_qty += receivedQty
      item.detail_ids.push(Number(row.detail_id))
      item.order_ids.add(orderId)
      item.arrival_status = resolveIntakeStatus(item.ordered_qty, item.received_qty)
    }

    const rounds = Array.from(roundMap.values()).map((round) => {
      const orders = Array.from(round.ordersMap.values()).sort((a, b) => {
        const aTime = new Date(a.order_date || 0).getTime()
        const bTime = new Date(b.order_date || 0).getTime()
        if (aTime !== bTime) return bTime - aTime
        return Number(b.order_id) - Number(a.order_id)
      })

      const items = Array.from(round.itemsMap.values()).map((item) => {
        const missingQty = Math.max(item.ordered_qty - item.received_qty, 0)
        const lineTotal = item.ordered_qty * item.unit_price
        const receivedTotal = item.received_qty * item.unit_price

        return {
          ...item,
          order_count: item.order_ids.size,
          order_ids: Array.from(item.order_ids),
          missing_qty: missingQty,
          line_total: lineTotal,
          received_total: receivedTotal,
          refund_amount: missingQty * item.unit_price,
        }
      })

      const orderedAmount = items.reduce((sum, item) => sum + item.line_total, 0)
      const receivedAmount = items.reduce((sum, item) => sum + item.received_total, 0)
      const missingAmount = Math.max(orderedAmount - receivedAmount, 0)
      const totalQty = items.reduce((sum, item) => sum + (Number(item.ordered_qty) || 0), 0)

      return {
        round_id: round.round_id,
        round_name: round.round_name,
        round_status: round.round_status,
        start_date: round.start_date,
        end_date: round.end_date,
        orders,
        items,
        summary: {
          total_orders: orders.length,
          total_lines: items.length,
          total_qty: totalQty,
          ordered_amount: orderedAmount,
          received_amount: receivedAmount,
          missing_amount: missingAmount,
          fully_received: items.length > 0 && items.every((item) => item.missing_qty === 0),
        },
      }
    })

    res.json(rounds)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// POST /api/admin/inventory-intake/rounds/:round_id/process
// รับสินค้าเข้าตามรอบพรีออเดอร์ โดยรวมทุกออเดอร์ในรอบเดียวกัน
// ─────────────────────────────────────────────
app.post(
  '/api/admin/inventory-intake/rounds/:round_id/process',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const roundId = Number(req.params.round_id)
    const payload = req.body || {}
    const receivedItems = Array.isArray(payload.items) ? payload.items : []
    const note = String(payload.note || '').trim()
    const moveExcessToStock =
      payload.move_excess_to_stock !== undefined ? Boolean(payload.move_excess_to_stock) : true

    if (!roundId) {
      return res.status(400).json({ error: 'round_id is required' })
    }

    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()

      const [roundRows] = await connection.query(
        `SELECT round_id, round_name, status, start_date, end_date
         FROM preorder_rounds
         WHERE round_id = ?
         LIMIT 1`,
        [roundId],
      )

      if (roundRows.length === 0) {
        await connection.rollback()
        return res.status(404).json({ error: 'ไม่พบรอบพรีออเดอร์' })
      }

      const normalizedRoundStatus = String(roundRows[0].status || '')
        .trim()
        .toLowerCase()
      if (normalizedRoundStatus !== 'closed') {
        await connection.rollback()
        return res.status(400).json({ error: 'ยังไม่สามารถตรวจรับได้ เนื่องจากรอบนี้ยังไม่ปิด' })
      }

      const [detailRows] = await connection.query(
        `SELECT
           od.detail_id,
           od.order_id,
           od.prod_id,
           od.flavor,
           od.Price AS unit_price,
           od.qty AS ordered_qty,
           COALESCE(od.received_qty, 0) AS received_qty,
           COALESCE(od.arrival_status, 'Pending') AS arrival_status,
           o.total_amount,
           o.status AS order_status,
           o.Order_date AS order_date,
           a.username,
           a.full_name
         FROM order_details od
         JOIN orders o ON o.order_id = od.order_id
         LEFT JOIN accounts a ON a.user_id = o.user_id
         WHERE od.preorder_round_id = ?
           AND LOWER(o.Order_type) = 'preorder'
         ORDER BY o.Order_date ASC, o.order_id ASC, od.detail_id ASC`,
        [roundId],
      )

      if (detailRows.length === 0) {
        await connection.rollback()
        return res.status(400).json({ error: 'ไม่มีรายการสินค้าในรอบนี้' })
      }

      const requestMap = new Map(
        receivedItems.map((item) => [
          String(item.detail_id || item.line_key || '').trim(),
          normalizeIntakeQuantity(item.received_qty, 0),
        ]),
      )

      const lineGroups = new Map()
      for (const detail of detailRows) {
        const unitPrice = Number(detail.unit_price) || 0
        const lineKey = `${detail.prod_id}|${String(detail.flavor || '').trim()}|${unitPrice}`
        if (!lineGroups.has(lineKey)) {
          lineGroups.set(lineKey, [])
        }
        lineGroups.get(lineKey).push(detail)
      }

      const detailResults = []
      const orderSummaryMap = new Map()

      for (const [lineKey, lineDetails] of lineGroups.entries()) {
        const requestedReceived = requestMap.get(lineKey) || 0
        let remaining = requestedReceived

        for (const detail of lineDetails) {
          const orderedQty = Math.max(0, Number(detail.ordered_qty) || 0)
          const currentReceived = Math.max(0, Number(detail.received_qty) || 0)
          const availableToApply = Math.max(orderedQty - currentReceived, 0)
          const appliedToOrder = Math.min(remaining, availableToApply)
          const finalReceivedQty = currentReceived + appliedToOrder
          const excessQty = Math.max(remaining - appliedToOrder, 0)
          const missingQty = Math.max(orderedQty - finalReceivedQty, 0)
          const unitPrice = Number(detail.unit_price) || 0
          const arrivalStatus = resolveIntakeStatus(orderedQty, finalReceivedQty)

          remaining -= appliedToOrder

          await connection.query(
            `UPDATE order_details
             SET received_qty = ?, arrival_status = ?
             WHERE detail_id = ?`,
            [finalReceivedQty, arrivalStatus, detail.detail_id],
          )

          if (!orderSummaryMap.has(Number(detail.order_id))) {
            orderSummaryMap.set(Number(detail.order_id), {
              order_id: Number(detail.order_id),
              order_status: detail.order_status || 'Pending',
              order_date: detail.order_date,
              username: detail.username || '',
              full_name: detail.full_name || '',
              ordered_amount: 0,
              received_amount: 0,
              refund_amount: 0,
              items: [],
            })
          }

          const orderSummary = orderSummaryMap.get(Number(detail.order_id))
          const lineOrderedAmount = orderedQty * unitPrice
          const lineReceivedAmount = finalReceivedQty * unitPrice
          const lineRefundAmount = missingQty * unitPrice

          orderSummary.ordered_amount += lineOrderedAmount
          orderSummary.received_amount += lineReceivedAmount
          orderSummary.refund_amount += lineRefundAmount
          orderSummary.items.push({
            detail_id: Number(detail.detail_id),
            prod_id: Number(detail.prod_id),
            flavor: detail.flavor || '',
            ordered_qty: orderedQty,
            received_qty: finalReceivedQty,
            excess_qty: excessQty,
            missing_qty: missingQty,
            unit_price: unitPrice,
            arrival_status: arrivalStatus,
          })

          detailResults.push({
            detail_id: Number(detail.detail_id),
            prod_id: Number(detail.prod_id),
            ordered_qty: orderedQty,
            received_qty: finalReceivedQty,
            excess_qty: excessQty,
            missing_qty: missingQty,
            unit_price: unitPrice,
            refund_amount: lineRefundAmount,
            arrival_status: arrivalStatus,
            order_id: Number(detail.order_id),
          })
        }

        if (remaining > 0 && moveExcessToStock) {
          const firstDetail = lineDetails[0]
          await adjustProductStock(connection, firstDetail.prod_id, remaining, firstDetail.flavor)
        }
      }

      const [statusRows] = await connection.query(
        `SELECT
           od.order_id,
           COALESCE(SUM(od.qty * od.Price), 0) AS ordered_amount,
           COALESCE(SUM(COALESCE(od.received_qty, 0) * od.Price), 0) AS received_amount,
           COALESCE(SUM((od.qty - COALESCE(od.received_qty, 0)) * od.Price), 0) AS refund_amount,
           SUM(CASE WHEN COALESCE(od.received_qty, 0) = 0 THEN 1 ELSE 0 END) AS missing_items,
           SUM(CASE WHEN COALESCE(od.received_qty, 0) > 0 AND COALESCE(od.received_qty, 0) < od.qty THEN 1 ELSE 0 END) AS partial_items,
           SUM(CASE WHEN COALESCE(od.received_qty, 0) >= od.qty THEN 1 ELSE 0 END) AS completed_items,
           COUNT(*) AS total_items
         FROM order_details od
         WHERE od.preorder_round_id = ?
         GROUP BY od.order_id`,
        [roundId],
      )

      for (const row of statusRows) {
        const fullReceived = Number(row.completed_items) === Number(row.total_items)
        const allMissing = Number(row.missing_items) === Number(row.total_items)
        const newStatus = fullReceived
          ? 'Ready_to_Ship'
          : allMissing
            ? 'Missing'
            : 'Partially_Received'

        await connection.query(
          'UPDATE orders SET total_amount = ?, status = ? WHERE order_id = ?',
          [
            Math.max(Number(row.ordered_amount) - Number(row.refund_amount) + 0, 0),
            newStatus,
            row.order_id,
          ],
        )
      }

      for (const [orderId, summary] of orderSummaryMap.entries()) {
        const newStatus =
          summary.items.length > 0 && summary.items.every((item) => item.missing_qty === 0)
            ? 'Ready_to_Ship'
            : summary.items.every((item) => item.received_qty === 0)
              ? 'Missing'
              : 'Partially_Received'

        const [sessionResult] = await connection.query(
          `INSERT INTO inventory_intake_sessions
           (order_id, admin_user_id, expected_amount, received_amount, refund_amount, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            req.user?.id || null,
            summary.ordered_amount,
            summary.received_amount,
            summary.refund_amount,
            newStatus,
            note ? `ROUND #${roundId}${note ? ` · ${note}` : ''}` : `ROUND #${roundId}`,
          ],
        )

        for (const item of summary.items) {
          await connection.query(
            `INSERT INTO inventory_intake_session_items
             (intake_id, detail_id, prod_id, ordered_qty, received_qty, excess_qty, missing_qty, unit_price, refund_amount, arrival_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sessionResult.insertId,
              item.detail_id,
              item.prod_id,
              item.ordered_qty,
              item.received_qty,
              item.excess_qty,
              item.missing_qty,
              item.unit_price,
              item.missing_qty * item.unit_price,
              item.arrival_status,
            ],
          )
        }
      }

      await connection.commit()

      const orderedAmount = detailResults.reduce(
        (sum, item) => sum + item.ordered_qty * item.unit_price,
        0,
      )
      const receivedAmount = detailResults.reduce(
        (sum, item) => sum + item.received_qty * item.unit_price,
        0,
      )
      const refundAmount = detailResults.reduce((sum, item) => sum + item.refund_amount, 0)

      res.json({
        success: true,
        round_id: roundId,
        order_count: orderSummaryMap.size,
        ordered_amount: orderedAmount,
        received_amount: receivedAmount,
        refund_amount: refundAmount,
        items: detailResults,
      })
    } catch (error) {
      await connection.rollback()
      console.error('[POST /api/admin/inventory-intake/rounds/:round_id/process]', error)
      res.status(500).json({ error: error.message })
    } finally {
      connection.release()
    }
  },
)

// ─────────────────────────────────────────────
// POST /api/admin/inventory-intake/:order_id/process
// รับจำนวนสินค้าจริง, อัปเดตสต็อก, ลดยอดขาด และบันทึกผลตรวจรับ
// ─────────────────────────────────────────────
app.post(
  '/api/admin/inventory-intake/:order_id/process',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const orderId = Number(req.params.order_id)
    const payload = req.body || {}
    const receivedItems = Array.isArray(payload.items) ? payload.items : []
    const note = String(payload.note || '').trim()

    if (!orderId) {
      return res.status(400).json({ error: 'order_id is required' })
    }

    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()

      const [orderRows] = await connection.query(
        `SELECT order_id, user_id, total_amount, status, Order_type
         FROM orders
         WHERE order_id = ?
         LIMIT 1`,
        [orderId],
      )

      if (orderRows.length === 0) {
        await connection.rollback()
        return res.status(404).json({ error: 'ไม่พบออเดอร์' })
      }

      const order = orderRows[0]
      const [detailRows] = await connection.query(
        `SELECT
           od.detail_id,
           od.order_id,
           od.prod_id,
           od.flavor,
           od.Price AS unit_price,
           od.qty AS ordered_qty,
           COALESCE(od.received_qty, 0) AS received_qty,
           COALESCE(od.arrival_status, 'Pending') AS arrival_status,
           p.stock_qty AS stock_qty
         FROM order_details od
         LEFT JOIN products p ON p.prod_id = od.prod_id
         WHERE od.order_id = ?
         ORDER BY od.detail_id ASC`,
        [orderId],
      )

      if (detailRows.length === 0) {
        await connection.rollback()
        return res.status(400).json({ error: 'ไม่มีรายการสินค้าในออเดอร์นี้' })
      }

      const receivedMap = new Map(
        receivedItems.map((item) => [
          Number(item.detail_id),
          normalizeIntakeQuantity(item.received_qty, 0),
        ]),
      )

      // Flags for behavior: move excess to ready-to-ship stock; decrement preorder pool
      const moveExcessToStock =
        payload.move_excess_to_stock !== undefined ? Boolean(payload.move_excess_to_stock) : true

      const processResults = []
      let orderedAmount = 0
      let receivedAmount = 0
      let refundAmount = 0
      let allReceived = true
      let allMissing = true

      for (const detail of detailRows) {
        const orderedQty = Math.max(0, Number(detail.ordered_qty) || 0)
        const requestedReceived = receivedMap.has(Number(detail.detail_id))
          ? receivedMap.get(Number(detail.detail_id))
          : 0

        // appliedToOrder is the quantity counted toward fulfilling the order (capped to orderedQty)
        const appliedToOrder = Math.min(requestedReceived, orderedQty)
        const excessQty = Math.max(requestedReceived - appliedToOrder, 0)
        const missingQty = Math.max(orderedQty - appliedToOrder, 0)
        const unitPrice = Number(detail.unit_price) || 0
        const lineOrderedAmount = orderedQty * unitPrice
        const lineReceivedAmount = appliedToOrder * unitPrice
        const lineRefundAmount = missingQty * unitPrice
        const arrivalStatus = resolveIntakeStatus(orderedQty, appliedToOrder)

        orderedAmount += lineOrderedAmount
        receivedAmount += lineReceivedAmount
        refundAmount += lineRefundAmount

        if (appliedToOrder < orderedQty) {
          allReceived = false
        }
        if (appliedToOrder > 0) {
          allMissing = false
        }

        // Update order detail received and status (record applied amount toward the order)
        await connection.query(
          `UPDATE order_details
             SET received_qty = ?, arrival_status = ?
             WHERE detail_id = ?`,
          [appliedToOrder, arrivalStatus, detail.detail_id],
        )

        // Handle inventory movements:
        // - Preorder orders: no pool decrement (preorder is fulfilled after payment/round close)
        // - Ready orders: add appliedToOrder back into products.stock_qty (receive into warehouse)
        // - Excess (beyond ordered) can be optionally added to products.stock_qty
        const orderType = String(order.Order_type || '').toLowerCase()

        if (orderType === 'preorder') {
          // For preorder, do not add appliedToOrder into products.stock_qty (it's allocated to orders)
          if (excessQty > 0 && moveExcessToStock) {
            await adjustProductStock(connection, detail.prod_id, excessQty, detail.flavor)
          }
        } else {
          // Ready-to-ship orders: receiving increases product stock by applied amount
          if (appliedToOrder > 0) {
            await adjustProductStock(connection, detail.prod_id, appliedToOrder, detail.flavor)
          }
          if (excessQty > 0 && moveExcessToStock) {
            await adjustProductStock(connection, detail.prod_id, excessQty, detail.flavor)
          }
        }

        processResults.push({
          detail_id: Number(detail.detail_id),
          prod_id: Number(detail.prod_id),
          ordered_qty: orderedQty,
          received_qty: appliedToOrder,
          excess_qty: excessQty,
          missing_qty: missingQty,
          unit_price: unitPrice,
          refund_amount: lineRefundAmount,
          arrival_status: arrivalStatus,
        })
      }

      const newStatus = allReceived
        ? 'Ready_to_Ship'
        : allMissing
          ? 'Missing'
          : 'Partially_Received'
      const newTotalAmount = Math.max(Number(order.total_amount) - refundAmount, 0)

      await connection.query(
        `UPDATE orders
         SET total_amount = ?, status = ?
         WHERE order_id = ?`,
        [newTotalAmount, newStatus, orderId],
      )

      const [sessionResult] = await connection.query(
        `INSERT INTO inventory_intake_sessions
         (order_id, admin_user_id, expected_amount, received_amount, refund_amount, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          req.user?.id || null,
          orderedAmount,
          receivedAmount,
          refundAmount,
          newStatus,
          note || null,
        ],
      )

      const intakeId = sessionResult.insertId

      for (const result of processResults) {
        await connection.query(
          `INSERT INTO inventory_intake_session_items
           (intake_id, detail_id, prod_id, ordered_qty, received_qty, excess_qty, missing_qty, unit_price, refund_amount, arrival_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            intakeId,
            result.detail_id,
            result.prod_id,
            result.ordered_qty,
            result.received_qty,
            result.excess_qty || 0,
            result.missing_qty,
            result.unit_price,
            result.refund_amount,
            result.arrival_status,
          ],
        )
      }

      await connection.commit()

      res.json({
        success: true,
        intake_id: intakeId,
        order_id: orderId,
        status: newStatus,
        ordered_amount: orderedAmount,
        received_amount: receivedAmount,
        refund_amount: refundAmount,
        items: processResults,
      })
    } catch (error) {
      await connection.rollback()
      res.status(500).json({ error: error.message })
    } finally {
      connection.release()
    }
  },
)

// ─────────────────────────────────────────────
// PATCH /api/admin/inventory-intake/item/:detail_id
// ปรับสถานะสินค้าที่ขาดระหว่างการรับสินค้าเข้า: คืนเงินหรือรอของ
// ─────────────────────────────────────────────
app.patch(
  '/api/admin/inventory-intake/item/:detail_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const detailId = Number(req.params.detail_id)
    const action = String(req.body?.action || '')
      .trim()
      .toLowerCase()

    if (!detailId) {
      return res.status(400).json({ error: 'detail_id is required' })
    }

    if (!['refund', 'delay'].includes(action)) {
      return res.status(400).json({ error: 'action must be refund or delay' })
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const [detailRows] = await connection.query(
        `SELECT od.detail_id, od.order_id, od.qty AS ordered_qty, COALESCE(od.received_qty, 0) AS received_qty,
                od.Price AS unit_price, COALESCE(od.arrival_status, 'Pending') AS arrival_status
         FROM order_details od
         WHERE od.detail_id = ?
         LIMIT 1`,
        [detailId],
      )

      if (detailRows.length === 0) {
        await connection.rollback()
        return res.status(404).json({ error: 'ไม่พบรายการสินค้านี้' })
      }

      const detail = detailRows[0]
      const orderId = Number(detail.order_id)
      const targetStatus = action === 'refund' ? 'Missing' : 'Delayed'

      await connection.query(`UPDATE order_details SET arrival_status = ? WHERE detail_id = ?`, [
        targetStatus,
        detailId,
      ])

      const [orderDetails] = await connection.query(
        `SELECT od.qty AS ordered_qty, COALESCE(od.received_qty, 0) AS received_qty,
                COALESCE(od.arrival_status, 'Pending') AS arrival_status, od.Price AS unit_price
         FROM order_details od
         WHERE od.order_id = ?`,
        [orderId],
      )

      const orderedAmount = orderDetails.reduce(
        (sum, item) => sum + (Number(item.ordered_qty) || 0) * (Number(item.unit_price) || 0),
        0,
      )

      const refundAmount = orderDetails.reduce((sum, item) => {
        const itemMissingQty = Math.max(
          (Number(item.ordered_qty) || 0) - (Number(item.received_qty) || 0),
          0,
        )
        return (
          sum +
          (String(item.arrival_status || 'Pending').toLowerCase() === 'missing'
            ? itemMissingQty * (Number(item.unit_price) || 0)
            : 0)
        )
      }, 0)

      const allReceived = orderDetails.every(
        (item) => (Number(item.received_qty) || 0) >= (Number(item.ordered_qty) || 0),
      )
      const allMissing = orderDetails.every(
        (item) =>
          (Number(item.received_qty) || 0) === 0 &&
          String(item.arrival_status || 'Pending').toLowerCase() === 'missing',
      )
      const newStatus = allReceived
        ? 'Ready_to_Ship'
        : allMissing
          ? 'Missing'
          : 'Partially_Received'

      await connection.query(`UPDATE orders SET total_amount = ?, status = ? WHERE order_id = ?`, [
        Math.max(orderedAmount - refundAmount, 0),
        newStatus,
        orderId,
      ])

      await connection.query(
        `UPDATE inventory_intake_session_items
         SET arrival_status = ?, refund_amount = CASE WHEN ? = 'Missing' THEN missing_qty * unit_price ELSE 0 END
         WHERE detail_id = ?`,
        [targetStatus, targetStatus, detailId],
      )

      await connection.commit()

      res.json({
        success: true,
        detail_id: detailId,
        order_id: orderId,
        action: targetStatus,
        refund_amount: refundAmount,
        order_status: newStatus,
        total_amount: Math.max(orderedAmount - refundAmount, 0),
      })
    } catch (error) {
      await connection.rollback()
      res.status(500).json({ error: error.message })
    } finally {
      connection.release()
    }
  },
)

// ─────────────────────────────────────────────
// GET /api/dashboard/overview
// ส่วนหลัก dashboard data
// ─────────────────────────────────────────────
app.get('/api/dashboard/overview', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // KPI: จำนวนสินค้า หมวด สต็อก ฯลฯ
    const [productCountRows] = await pool.query('SELECT COUNT(*) AS total FROM products')
    const totalProducts = Number(productCountRows?.[0]?.total) || 0

    const [categoryCountRows] = await pool.query('SELECT COUNT(*) AS total FROM categories')
    const totalCategories = Number(categoryCountRows?.[0]?.total) || 0

    const [stockRows] = await pool.query('SELECT SUM(stock_qty) AS total FROM products')
    const totalStockUnits = Number(stockRows?.[0]?.total) || 0

    const [inventoryValueRows] = await pool.query(
      'SELECT SUM(stock_qty * base_price) AS total FROM products',
    )
    const inventoryValue = Number(inventoryValueRows?.[0]?.total) || 0

    const [lowStockRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM products WHERE stock_qty <= 8',
    )
    const lowStockCount = Number(lowStockRows?.[0]?.total) || 0

    const [severeLowStockRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM products WHERE stock_qty <= 2',
    )
    const severeLowStockCount = Number(severeLowStockRows?.[0]?.total) || 0

    const [orderCountRows] = await pool.query('SELECT COUNT(*) AS total FROM orders')
    const orderCount = Number(orderCountRows?.[0]?.total) || 0

    const kpi = {
      totalProducts,
      totalCategories,
      totalStockUnits,
      inventoryValue,
      lowStockCount,
      severeLowStockCount,
      orderCount,
    }

    const thresholds = {
      lowStock: 8,
      severeLowStock: 2,
    }

    // Chart data: สต็อกรายหมวดหมู่
    const [categoryStockRows] = await pool.query(
      `
      SELECT
        c.cat_name AS label,
        SUM(p.stock_qty) AS value
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      GROUP BY c.cat_id, c.cat_name
      ORDER BY value DESC
      `,
    )

    const byCategoryStock = categoryStockRows.map((row) => ({
      label: row.label || 'ไม่มีหมวดหมู่',
      value: Number(row.value) || 0,
    }))

    // Chart data: มูลค่าสต็อกรายหมวดหมู่
    const [categoryValueRows] = await pool.query(
      `
      SELECT
        c.cat_name AS label,
        SUM(p.stock_qty * p.base_price) AS value
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      GROUP BY c.cat_id, c.cat_name
      ORDER BY value DESC
      `,
    )

    const byCategoryValue = categoryValueRows.map((row) => ({
      label: row.label || 'ไม่มีหมวดหมู่',
      value: Number(row.value) || 0,
    }))

    // Chart data: สินค้าเสี่ยง/ใกล้หมดรายหมวดหมู่
    const [categoryLowStockRows] = await pool.query(
      `
      SELECT
        c.cat_name AS label,
        COUNT(*) AS value
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.stock_qty <= 8
      GROUP BY c.cat_id, c.cat_name
      ORDER BY value DESC
      `,
    )

    const byCategoryLowStock = categoryLowStockRows.map((row) => ({
      label: row.label || 'ไม่มีหมวดหมู่',
      value: Number(row.value) || 0,
    }))

    // Chart data: ยอดขายรายคำสั่งซื้อ (top 5)
    const [recentOrdersRows] = await pool.query(
      `
      SELECT
        CONCAT('Order #', o.order_id) AS label,
        SUM(o.total_amount) AS value
      FROM orders o
      GROUP BY o.order_id
      ORDER BY o.order_id DESC
      LIMIT 5
      `,
    )

    const byRecentOrders = recentOrdersRows.map((row) => ({
      label: row.label || 'ไม่มีออเดอร์',
      value: Number(row.value) || 0,
    }))

    // ล่าสุด 10 สินค้า
    const [latestProductsRows] = await pool.query(
      `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku,
        c.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      ORDER BY p.prod_id DESC
      LIMIT 10
      `,
    )

    const latestProducts = latestProductsRows.map((row) => ({
      id: row.id,
      name: row.name || '-',
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '-',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
      imageUrls: [],
    }))

    const charts = {
      byCategoryStock,
      byCategoryValue,
      byCategoryLowStock,
      byRecentOrders,
    }

    res.json({
      kpi,
      thresholds,
      charts,
      latestProducts,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/user-stats
// ดึงจำนวน Users และ Admins ทั้งหมด
// ─────────────────────────────────────────────
app.get('/api/admin/user-stats', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [userCountRows] = await pool.query(
      'SELECT role, COUNT(*) AS count FROM accounts GROUP BY role',
    )

    let totalUsers = 0
    let totalAdmins = 0

    for (const row of userCountRows) {
      if (row.role?.toLowerCase() === 'user') {
        totalUsers = Number(row.count) || 0
      } else if (row.role?.toLowerCase() === 'admin') {
        totalAdmins = Number(row.count) || 0
      }
    }

    res.json({
      totalUsers,
      totalAdmins,
      totalAccounts: totalUsers + totalAdmins,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/orders
// ดึงรายการออเดอร์ทั้งหมดสำหรับแอดมิน
// ─────────────────────────────────────────────
app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const searchQuery = String(req.query.search || '').trim()
    const statusFilter = String(req.query.status || '').trim()
    const typeFilter = String(req.query.type || '')
      .trim()
      .toLowerCase()

    let query = `
      SELECT
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status,
        o.deadline,
        o.Order_type,
        o.Order_date,
        a.username,
        a.full_name,
        COUNT(od.detail_id) AS item_count,
        COALESCE(SUM(od.qty), 0) AS total_qty
      FROM orders o
      LEFT JOIN accounts a ON o.user_id = a.user_id
      LEFT JOIN order_details od ON od.order_id = o.order_id
      WHERE 1=1
    `

    const params = []

    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`
      query += ' AND (CAST(o.order_id AS CHAR) LIKE ? OR a.username LIKE ? OR a.full_name LIKE ?)'
      params.push(searchPattern, searchPattern, searchPattern)
    }

    if (statusFilter) {
      query += ' AND LOWER(o.status) = ?'
      params.push(statusFilter.toLowerCase())
    }

    if (typeFilter === 'preorder') {
      query += " AND LOWER(o.Order_type) = 'preorder'"
    } else if (typeFilter === 'ready') {
      query += " AND LOWER(o.Order_type) = 'ready'"
    }

    query += `
      GROUP BY
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status,
        o.deadline,
        o.Order_type,
        o.Order_date,
        a.username,
        a.full_name
      ORDER BY o.Order_date DESC, o.order_id DESC
    `

    const [rows] = await pool.query(query, params)

    res.json(
      rows.map((row) => ({
        order_id: Number(row.order_id),
        user_id: Number(row.user_id) || null,
        username: row.username || '',
        full_name: row.full_name || '',
        total_amount: Number(row.total_amount) || 0,
        status: row.status || 'Pending',
        deadline: row.deadline || null,
        Order_type: row.Order_type || 'Ready',
        Order_date: row.Order_date || null,
        item_count: Number(row.item_count) || 0,
        total_qty: Number(row.total_qty) || 0,
      })),
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/order-item-summary
// สรุปยอดขายรายสินค้าแบบรวมทุกออเดอร์สำหรับแอดมิน
// ─────────────────────────────────────────────
app.get('/api/admin/order-item-summary', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         od.prod_id,
         p.prod_name AS name,
         c.cat_name AS category_name,
         od.flavor,
         LOWER(COALESCE(NULLIF(od.item_type, ''), CASE WHEN od.preorder_round_id IS NOT NULL THEN 'preorder' END, '')) AS item_type,
         od.Price AS unit_price,
         SUM(od.qty) AS sold_qty,
         COUNT(od.detail_id) AS line_count,
         COUNT(DISTINCT od.order_id) AS order_count,
         COALESCE(SUM(od.Price * od.qty), 0) AS total_amount
       FROM order_details od
       INNER JOIN orders o ON o.order_id = od.order_id
       LEFT JOIN products p ON p.prod_id = od.prod_id
       LEFT JOIN categories c ON c.cat_id = p.cat_id
       WHERE o.order_id IS NOT NULL
       GROUP BY
         od.prod_id,
         p.prod_name,
         c.cat_name,
         od.flavor,
         LOWER(COALESCE(NULLIF(od.item_type, ''), CASE WHEN od.preorder_round_id IS NOT NULL THEN 'preorder' END, '')),
         od.Price
       ORDER BY sold_qty DESC, name ASC, od.flavor ASC, item_type ASC, unit_price ASC`,
    )

    res.json(
      rows.map((row) => ({
        prod_id: Number(row.prod_id) || null,
        name: row.name || '-',
        category_name: row.category_name || '',
        flavor: row.flavor || '',
        item_type: row.item_type || '',
        unit_price: Number(row.unit_price) || 0,
        sold_qty: Number(row.sold_qty) || 0,
        line_count: Number(row.line_count) || 0,
        order_count: Number(row.order_count) || 0,
        total_amount: Number(row.total_amount) || 0,
      })),
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─────────────────────────────────────────────
// GET /api/admin/users
// ดึงรายชื่อ users ทั้งหมด
// ─────────────────────────────────────────────
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const searchQuery = String(req.query.search || '').trim()
    const roleFilter = String(req.query.role || '').toLowerCase()

    let query =
      'SELECT user_id, username, full_name, role, phone_number, line_id, created_at FROM accounts WHERE 1=1'
    const params = []

    if (searchQuery) {
      query += ' AND (username LIKE ? OR full_name LIKE ?)'
      const searchPattern = `%${searchQuery}%`
      params.push(searchPattern, searchPattern)
    }

    if (roleFilter && ['user', 'admin'].includes(roleFilter)) {
      query += ' AND LOWER(role) = ?'
      params.push(roleFilter)
    }

    query += ' ORDER BY created_at DESC'

    const [rows] = await pool.query(query, params)

    const users = rows.map((row) => ({
      user_id: row.user_id,
      username: row.username,
      full_name: row.full_name,
      role: row.role,
      phone_number: row.phone_number || '',
      line_id: row.line_id || '',
      created_at: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '-',
    }))

    res.json(users)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ========== Admin QR Codes Management ==========
// GET /api/admin/qrcodes - list all qrcodes
app.get('/api/admin/qrcodes', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.qr_id, q.payment_method, q.qr_image, q.user_id, q.is_active, q.updated_at, a.username, a.full_name
       FROM admin_qrcodes q
       LEFT JOIN accounts a ON a.user_id = q.user_id
       ORDER BY q.updated_at DESC`,
    )

    const list = rows.map((r) => ({
      qr_id: r.qr_id,
      payment_method: r.payment_method,
      qr_image: r.qr_image || null,
      user_id: r.user_id,
      username: r.username || null,
      full_name: r.full_name || null,
      is_active: Boolean(r.is_active),
      updated_at: r.updated_at,
    }))

    res.json(list)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/qrcodes - public list of active payment QR codes
app.get('/api/qrcodes', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.qr_id, q.payment_method, q.qr_image, q.user_id, q.is_active, q.updated_at, a.username, a.full_name
       FROM admin_qrcodes q
       LEFT JOIN accounts a ON a.user_id = q.user_id
       WHERE q.is_active = 1
       ORDER BY q.updated_at DESC`,
    )

    const list = rows.map((r) => ({
      qr_id: r.qr_id,
      payment_method: r.payment_method,
      qr_image: r.qr_image || null,
      user_id: r.user_id,
      username: r.username || null,
      full_name: r.full_name || null,
      is_active: Boolean(r.is_active),
      updated_at: r.updated_at,
    }))

    res.json(list)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/qrcodes - upload a new QR image (multipart/form-data: image, payment_method)
app.post(
  '/api/admin/qrcodes',
  authenticateToken,
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      const payment_method = String(req.body?.payment_method || '').trim()
      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' })
      }

      const imageUrl = `/uploads/${req.file.filename}`
      const userId = req.user?.id || null

      const [result] = await pool.query(
        'INSERT INTO admin_qrcodes (payment_method, qr_image, user_id, is_active) VALUES (?, ?, ?, ?)',
        [payment_method || null, imageUrl, userId, 1],
      )

      const [rows] = await pool.query(
        'SELECT qr_id, payment_method, qr_image, user_id, is_active, updated_at FROM admin_qrcodes WHERE qr_id = ? LIMIT 1',
        [result.insertId],
      )
      res.status(201).json(rows[0])
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  },
)

// PATCH /api/admin/qrcodes/:id - update active status or payment method
app.patch('/api/admin/qrcodes/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  const { is_active, payment_method } = req.body || {}

  try {
    const updates = []
    const params = []
    if (is_active !== undefined) {
      updates.push('is_active = ?')
      params.push(is_active ? 1 : 0)
    }
    if (payment_method !== undefined) {
      updates.push('payment_method = ?')
      params.push(String(payment_method || '').trim() || null)
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(id)
    const [result] = await pool.query(
      `UPDATE admin_qrcodes SET ${updates.join(', ')} WHERE qr_id = ?`,
      params,
    )
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' })

    const [rows] = await pool.query(
      'SELECT qr_id, payment_method, qr_image, user_id, is_active, updated_at FROM admin_qrcodes WHERE qr_id = ? LIMIT 1',
      [id],
    )
    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/admin/qrcodes/:id - remove QR entry and delete file
app.delete('/api/admin/qrcodes/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' })

  try {
    const [rows] = await pool.query('SELECT qr_image FROM admin_qrcodes WHERE qr_id = ? LIMIT 1', [
      id,
    ])
    const row = rows[0]
    const [result] = await pool.query('DELETE FROM admin_qrcodes WHERE qr_id = ?', [id])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' })

    if (row && row.qr_image) {
      const filePath = path.join(uploadsDir, path.basename(row.qr_image))
      try {
        await unlink(filePath)
      } catch {
        // ignore unlink errors
      }
    }

    res.status(204).send()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.use((error, _req, res, _next) => {
  res.status(500).json({ message: error.message })
})

async function startServer() {
  try {
    await ensureAdminSchema()

    autoCloseExpiredPreorderRounds().catch((error) => {
      console.error('[auto-close] initial run failed:', error.message)
    })

    const preorderRoundAutoCloseTimer = setInterval(() => {
      autoCloseExpiredPreorderRounds().catch((error) => {
        console.error('[auto-close] scheduled run failed:', error.message)
      })
    }, 60 * 1000)

    preorderRoundAutoCloseTimer.unref?.()

    app.listen(port, () => {
      console.log(`API server running at http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Failed to start API server:', error)
    process.exit(1)
  }
}

startServer()
