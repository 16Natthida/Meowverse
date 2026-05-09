/* eslint-disable no-undef */
import cors from 'cors'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import mysql from 'mysql2/promise'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import cartRouter from './cart.js'
import orderRouter from './order.js'

dotenv.config()

const app = express()

const port = Number(process.env.API_PORT) || 3001

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
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

app.use(cors({ origin: frontendOrigin }))
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(uploadsDir))
app.use('/api/cart', cartRouter)
app.use('/api/orders', orderRouter)

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

function normalizeIntakeQuantity(value, fallback = 0) {
  const quantity = Number(value)
  if (!Number.isFinite(quantity) || quantity < 0) {
    return Math.max(0, Number(fallback) || 0)
  }

  return Math.floor(quantity)
}

function resolveIntakeStatus(orderedQty, receivedQty) {
  const ordered = Math.max(0, Number(orderedQty) || 0)
  const received = Math.max(0, Number(receivedQty) || 0)

  if (ordered === 0) return 'Received'
  if (received <= 0) return 'Missing'
  if (received >= ordered) return 'Received'
  return 'Partial'
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
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE p.prod_id IN (?)
      ORDER BY p.prod_id DESC
    `,
    [productIds],
  )

  const [imageRows] = await connection.query(
    `
      SELECT prod_id AS productId, image_url AS imageUrl
      FROM product_images
      WHERE prod_id IN (?)
      ORDER BY sort_order ASC, img_id ASC
    `,
    [productIds],
  )

  const imageUrlMap = new Map()
  for (const row of imageRows) {
    const list = imageUrlMap.get(row.productId) || []
    list.push(row.imageUrl)
    imageUrlMap.set(row.productId, list)
  }

  return productRows.map((row) => mapProductRow(row, imageUrlMap))
}

async function queryAllProducts(connection = pool) {
  const [idRows] = await connection.query(
    'SELECT prod_id AS id FROM products ORDER BY prod_id DESC',
  )
  const productIds = idRows.map((row) => row.id)
  return queryProductsByIds(productIds, connection)
}

async function countTableRows(tableName, connection = pool) {
  const [tableRows] = await connection.query(
    `
      SELECT COUNT(*) AS tableCount
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
    `,
    [tableName],
  )

  if (Number(tableRows[0]?.tableCount) === 0) {
    return null
  }

  const [rows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM ${tableName}`)
  return Number(rows[0]?.rowCount) || 0
}

async function upsertProductImages(connection, productId, imageUrls = []) {
  await connection.query('DELETE FROM product_images WHERE prod_id = ?', [productId])

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return
  }

  const values = imageUrls
    .filter((imageUrl) => typeof imageUrl === 'string' && imageUrl.trim() !== '')
    .map((imageUrl, index) => [productId, imageUrl.trim(), index])

  if (values.length > 0) {
    await connection.query('INSERT INTO product_images (prod_id, image_url, sort_order) VALUES ?', [
      values,
    ])
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
    CREATE TABLE IF NOT EXISTS cart (
      cart_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      prod_id INT NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      item_type VARCHAR(20) DEFAULT NULL,
      flavor VARCHAR(120) DEFAULT NULL,
      PRIMARY KEY (cart_id),
      KEY idx_cart_user_id (user_id),
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
    ALTER TABLE order_details
    ADD COLUMN IF NOT EXISTS flavor VARCHAR(120) DEFAULT NULL
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
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP
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

    await upsertProductImages(connection, productId, payload.imageUrls)

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

    await upsertProductImages(connection, productId, payload.imageUrls)

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
    const [productRows] = await pool.query(`
      SELECT DISTINCT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_price AS preorderPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM preorder_round_products prp
      JOIN preorder_rounds r ON r.round_id = prp.round_id
      JOIN products p ON p.prod_id = prp.prod_id
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE LOWER(r.status) IN ('active', 'open')
      ORDER BY c.cat_name ASC, p.prod_name ASC
    `)

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

// Get all preorder rounds
app.get('/api/preorder-rounds', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [rounds] = await pool.query(`
      SELECT
        round_id AS id,
        round_name AS name,
        round_description AS description,
        start_date AS startDate,
        end_date AS endDate,
        status
      FROM preorder_rounds
      ORDER BY round_id DESC
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

    // Get products in this round
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
        p.preorder_price AS preorderPrice,
        prp.quantity_available AS quantityAvailable,
        prp.round_price AS roundPrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM preorder_round_products prp
      JOIN products p ON p.prod_id = prp.prod_id
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      WHERE prp.round_id = ?
      ORDER BY p.prod_id DESC
    `,
      [roundId],
    )

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
    res.json(updatedRound[0])
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

    const values = productIds.map((pid, index) => [
      roundId,
      Number(pid),
      quantities && quantities[index] ? Number(quantities[index]) : 0,
      roundPrices && roundPrices[index] !== undefined && roundPrices[index] !== null
        ? Number(roundPrices[index])
        : (preorderPriceMap.get(String(pid)) ?? productPriceMap.get(String(pid)) ?? 0),
    ])

    await pool.query(
      `
      INSERT INTO preorder_round_products (round_id, prod_id, quantity_available, round_price)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        quantity_available = VALUES(quantity_available),
        round_price = COALESCE(VALUES(round_price), round_price)
    `,
      [values],
    )

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

// Update product quantity in preorder round
app.put(
  '/api/preorder-rounds/:id/products/:productId',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const roundId = Number(req.params.id)
    const productId = Number(req.params.productId)
    const { quantity } = req.body || {}

    // Allow null to represent "unlimited". Otherwise quantity must be a non-negative number.
    if (quantity === undefined || (quantity !== null && Number(quantity) < 0)) {
      res
        .status(400)
        .json({ message: 'quantity must be null (unlimited) or a non-negative number' })
      return
    }

    try {
      const [result] = await pool.query(
        `
      UPDATE preorder_round_products
      SET quantity_available = ?
      WHERE round_id = ? AND prod_id = ?
    `,
        [quantity === null ? null : Number(quantity), roundId, productId],
      )

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Product not found in this round' })
        return
      }

      res.json({ message: 'Product quantity updated successfully' })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  },
)

app.get('/api/dashboard/overview', async (_req, res) => {
  try {
    const lowStockThreshold = 8
    const severeLowStockThreshold = 2

    const [summaryRows] = await pool.query(
      `
      SELECT
        COUNT(*) AS totalProducts,
        COALESCE(SUM(stock_qty), 0) AS totalStockUnits,
        COALESCE(SUM(stock_qty * base_price), 0) AS inventoryValue
      FROM products
    `,
    )

    const [categoryCountRows] = await pool.query(
      `
      SELECT COUNT(*) AS totalCategories
      FROM categories
    `,
    )

    const [lowStockRows] = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN stock_qty <= ? THEN 1 ELSE 0 END), 0) AS lowStockCount,
        COALESCE(SUM(CASE WHEN stock_qty <= ? THEN 1 ELSE 0 END), 0) AS severeLowStockCount
      FROM products
      WHERE ready_to_ship_enabled = 1 OR preorder_enabled = 1
    `,
      [lowStockThreshold, severeLowStockThreshold],
    )

    const [categoryMetricRows] = await pool.query(
      `
      SELECT
        c.cat_id AS categoryId,
        c.cat_name AS categoryName,
        COALESCE(SUM(p.stock_qty), 0) AS totalStock,
        COALESCE(SUM(p.stock_qty * p.base_price), 0) AS totalValue,
        COALESCE(SUM(CASE WHEN p.stock_qty <= ? THEN 1 ELSE 0 END), 0) AS lowStockProducts
      FROM categories c
      LEFT JOIN products p ON p.cat_id = c.cat_id
      GROUP BY c.cat_id, c.cat_name
      ORDER BY totalStock DESC, c.cat_name ASC
      LIMIT 8
    `,
      [lowStockThreshold],
    )

    const [latestProductRows] = await pool.query(
      `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.sku AS sku,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
        p.preorder_enabled AS preorderEnabled,
        p.ready_to_ship_enabled AS readyToShipEnabled
      FROM products p
      LEFT JOIN categories c ON c.cat_id = p.cat_id
      ORDER BY p.prod_id DESC
      LIMIT 8
    `,
    )

    const orderCountCandidates = ['orders', 'order_headers', 'purchase_orders']
    let orderCount = null

    for (const tableName of orderCountCandidates) {
      // First matching table wins so existing databases can expose real order counts.
      // If the table does not exist, fall through without failing the endpoint.
      // This keeps the dashboard usable in partial schemas.
      const count = await countTableRows(tableName)
      if (count !== null) {
        orderCount = count
        break
      }
    }

    if (orderCount === null) {
      const [orderItemCountRows] = await pool.query(
        `
        SELECT COUNT(*) AS rowCount
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'order_items'
      `,
      )

      if (Number(orderItemCountRows[0]?.rowCount) > 0) {
        const [distinctOrderRows] = await pool.query(
          'SELECT COUNT(DISTINCT order_id) AS rowCount FROM order_items',
        )
        orderCount = Number(distinctOrderRows[0]?.rowCount) || 0
      }
    }

    const summary = summaryRows[0] || {}
    const categoryCount = categoryCountRows[0] || {}
    const lowStock = lowStockRows[0] || {}

    // Recent orders for dashboard chart (most recent N orders)
    const [recentOrderRows] = await pool.query(
      `
      SELECT order_id, COALESCE(total_amount, 0) AS total_amount, Order_date
      FROM orders
      ORDER BY Order_date DESC, order_id DESC
      LIMIT 12
    `,
    )

    res.json({
      kpi: {
        totalProducts: Number(summary.totalProducts) || 0,
        totalCategories: Number(categoryCount.totalCategories) || 0,
        totalStockUnits: Number(summary.totalStockUnits) || 0,
        inventoryValue: Number(summary.inventoryValue) || 0,
        lowStockCount: Number(lowStock.lowStockCount) || 0,
        severeLowStockCount: Number(lowStock.severeLowStockCount) || 0,
        orderCount: orderCount === null ? 0 : orderCount,
      },
      charts: {
        byCategoryStock: categoryMetricRows.map((row) => ({
          label: row.categoryName,
          value: Number(row.totalStock) || 0,
        })),
        byCategoryValue: categoryMetricRows.map((row) => ({
          label: row.categoryName,
          value: Number(row.totalValue) || 0,
        })),
        byCategoryLowStock: categoryMetricRows.map((row) => ({
          label: row.categoryName,
          value: Number(row.lowStockProducts) || 0,
        })),
        byRecentOrders: recentOrderRows.map((row) => ({
          label: `#${row.order_id}`,
          value: Number(row.total_amount) || 0,
        })),
      },
      latestProducts: latestProductRows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku || '',
        categoryName: row.categoryName || '-',
        stock: Number(row.stock) || 0,
        basePrice: Number(row.basePrice) || 0,
        preorderEnabled: Boolean(row.preorderEnabled),
        readyToShipEnabled: Boolean(row.readyToShipEnabled),
      })),
      thresholds: {
        lowStock: lowStockThreshold,
        severeLowStock: severeLowStockThreshold,
      },
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/orders/:order_id/payment
app.post('/api/orders/:order_id/payment', upload.single('slip'), async (req, res) => {
  const { order_id } = req.params
  const { payment_method, shipping_name, shipping_phone, shipping_address, notes } = req.body
  const slip_url = req.file ? `/uploads/${req.file.filename}` : null

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // 1. ตรวจสอบข้อมูล Order เดิมเพื่อยอดเงินและประเภท
    const [orderRows] = await connection.query(
      'SELECT total_amount, Order_type FROM orders WHERE order_id = ?',
      [order_id],
    )

    if (orderRows.length === 0) {
      throw new Error('ไม่พบข้อมูลออเดอร์')
    }

    const orderData = orderRows[0]

    // 2. บันทึกข้อมูลสลิปลงตาราง payment
    const paymentType = orderData.Order_type === 'Ready' ? 'Ready pay' : 'Order_fee'
    await connection.query(
      `INSERT INTO payment (order_id, type, amount, slip_img, Slip_date, status, payment_method)
       VALUES (?, ?, ?, ?, NOW(), 'Pending', ?)`,
      [order_id, paymentType, orderData.total_amount, slip_url, payment_method || null],
    )

    // 3. บันทึกที่อยู่ลงตาราง shipping
    // รวมชื่อ เบอร์โทร และหมายเหตุเข้ากับที่อยู่ เพื่อเก็บในคอลัมน์ address ตามโครงสร้างตาราง
    const fullAddress = `ชื่อผู้รับ: ${shipping_name}\nโทร: ${shipping_phone}\nที่อยู่: ${shipping_address}\nหมายเหตุ: ${notes || '-'}`

    await connection.query(`INSERT INTO shipping (order_id, address) VALUES (?, ?)`, [
      order_id,
      fullAddress,
    ])

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
        await connection.query('UPDATE products SET stock_qty = stock_qty - ? WHERE prod_id = ?', [
          detail.qty,
          detail.prod_id,
        ])
      }
    }

    // 7. อัปเดตสถานะในตาราง orders เป็น 'Pending'
    await connection.query(`UPDATE orders SET status = 'Pending' WHERE order_id = ?`, [order_id])

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

// ─────────────────────────────────────────────
// GET /api/payments
// ดึงรายการ payment ทั้งหมด (admin)
// ─────────────────────────────────────────────
app.get('/api/payments', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, o.user_id, a.username
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
    await pool.query('UPDATE payment SET status = ? WHERE pay_id = ?', [status, pay_id])
    res.json({ success: true })
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
               ORDER BY pi.sort_order ASC, pi.img_id ASC
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
        refund_amount: missingQty * unitPrice,
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
      const decrementPreorderPool =
        payload.decrement_preorder_pool !== undefined
          ? Boolean(payload.decrement_preorder_pool)
          : true

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
        // - For Preorder orders: decrement preorder_round_products.quantity_available when configured
        // - For Ready orders: add appliedToOrder back into products.stock_qty (receive into warehouse)
        // - Excess (beyond ordered) can be optionally added to products.stock_qty
        const orderType = String(order.Order_type || '').toLowerCase()

        if (orderType === 'preorder') {
          if (decrementPreorderPool && appliedToOrder > 0) {
            // Try to decrement preorder pool for this product (if configured)
            try {
              const [prpRows] = await connection.query(
                'SELECT link_id, quantity_available FROM preorder_round_products WHERE prod_id = ? LIMIT 1 FOR UPDATE',
                [detail.prod_id],
              )
              if (prpRows.length > 0) {
                const currentAvail = Number(prpRows[0].quantity_available) || 0
                const newAvail = Math.max(0, currentAvail - appliedToOrder)
                await connection.query(
                  'UPDATE preorder_round_products SET quantity_available = ? WHERE link_id = ?',
                  [newAvail, prpRows[0].link_id],
                )
              }
            } catch (err) {
              // Non-fatal — continue processing but log
              console.warn(
                'Failed to decrement preorder pool for prod_id',
                detail.prod_id,
                err.message,
              )
            }
          }

          // For preorder, do not add appliedToOrder into products.stock_qty (it's allocated to orders)
          if (excessQty > 0 && moveExcessToStock) {
            await connection.query(
              'UPDATE products SET stock_qty = stock_qty + ? WHERE prod_id = ?',
              [excessQty, detail.prod_id],
            )
          }
        } else {
          // Ready-to-ship orders: receiving increases product stock by applied amount
          if (appliedToOrder > 0) {
            await connection.query(
              'UPDATE products SET stock_qty = stock_qty + ? WHERE prod_id = ?',
              [appliedToOrder, detail.prod_id],
            )
          }
          if (excessQty > 0 && moveExcessToStock) {
            await connection.query(
              'UPDATE products SET stock_qty = stock_qty + ? WHERE prod_id = ?',
              [excessQty, detail.prod_id],
            )
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

app.use((error, _req, res, _next) => {
  res.status(500).json({ message: error.message })
})

async function startServer() {
  try {
    await ensureAdminSchema()

    app.listen(port, () => {
      console.log(`API server running at http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Failed to start API server:', error)
    process.exit(1)
  }
}

startServer()
