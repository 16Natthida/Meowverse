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
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT NULL
  `)

  await pool.query(`
    ALTER TABLE cart
    ADD COLUMN IF NOT EXISTS flavor VARCHAR(120) DEFAULT NULL
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
          (cat_id, prod_name, description, flavors, stock_qty, base_price, sku, preorder_enabled, ready_to_ship_enabled)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(payload.categoryId),
        String(payload.name).trim(),
        payload.description ? String(payload.description).trim() : null,
        serializeFlavorList(payload.flavors),
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
          description = ?,
          flavors = ?,
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
        payload.description ? String(payload.description).trim() : null,
        serializeFlavorList(payload.flavors),
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
        p.description AS description,
        p.flavors AS flavors,
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
      description: row.description || '',
      flavors: parseFlavorList(row.flavors),
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

// Get ready-to-ship products for users
app.get('/api/products/ready-to-ship', async (req, res) => {
  try {
    const categoryId = req.query.categoryId
    let sql = `
      SELECT
        p.prod_id AS id,
        p.prod_name AS name,
        p.description AS description,
        p.sku AS sku,
        p.cat_id AS categoryId,
        c.cat_name AS categoryName,
        p.stock_qty AS stock,
        p.base_price AS basePrice,
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
  const { productIds, quantities } = req.body || {}

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

    const values = productIds.map((pid, index) => [
      roundId,
      Number(pid),
      quantities && quantities[index] ? Number(quantities[index]) : 0,
    ])

    await pool.query(
      `
      INSERT INTO preorder_round_products (round_id, prod_id, quantity_available)
      VALUES ?
      ON DUPLICATE KEY UPDATE quantity_available = VALUES(quantity_available)
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

    if (quantity === undefined || quantity < 0) {
      res.status(400).json({ message: 'quantity must be a non-negative number' })
      return
    }

    try {
      const [result] = await pool.query(
        `
      UPDATE preorder_round_products
      SET quantity_available = ?
      WHERE round_id = ? AND prod_id = ?
    `,
        [Number(quantity), roundId, productId],
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

    // 4. อัปเดตสถานะในตาราง orders เป็น 'Pending'
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
