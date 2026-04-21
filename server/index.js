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

dotenv.config()

const app = express()

const port = Number(process.env.API_PORT) || 3001

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const CATEGORY_NAME_MAX_LENGTH = 100
const CATEGORY_DETAIL_MAX_LENGTH = 255

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

app.post('/login', async (req, res) => {
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
})

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

function toBooleanNumber(value) {
  return value ? 1 : 0
}

function mapProductRow(row, imageUrlMap) {
  return {
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
  }
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
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
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
          (cat_id, prod_name, stock_qty, base_price, sku, preorder_enabled, ready_to_ship_enabled)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(payload.categoryId),
        String(payload.name).trim(),
        Number(payload.stock) || 0,
        Number(payload.basePrice) || 0,
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
          stock_qty = ?,
          base_price = ?,
          sku = ?,
          preorder_enabled = ?,
          ready_to_ship_enabled = ?
        WHERE prod_id = ?
      `,
      [
        Number(payload.categoryId),
        String(payload.name).trim(),
        Number(payload.stock) || 0,
        Number(payload.basePrice) || 0,
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
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
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
      sku: row.sku || '',
      categoryId: row.categoryId,
      categoryName: row.categoryName || '',
      stock: Number(row.stock) || 0,
      basePrice: Number(row.basePrice) || 0,
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
