// server/auth.js
// ระบบยืนยันตัวตนด้วย JWT + ตารางกำหนดสิทธิ์ของทุกเส้น API
//
// หลักการ:
// 1) ทุกเส้นใต้ /api ต้องผ่าน authorizeApiRequest (default-deny)
//    - เส้นที่ไม่ได้ระบุไว้ใน ACCESS_RULES จะถือว่าเป็น "admin" อัตโนมัติ
//      ถ้าเพิ่มเส้นใหม่สำหรับ user/public ต้องมาเพิ่มกฎในไฟล์นี้ด้วย
// 2) ตัวตนมาจาก JWT ใน header "Authorization: Bearer <token>" เท่านั้น
//    (ไม่เชื่อ header x-user-role / x-user-id จากฝั่ง client อีกต่อไป)
// 3) ทุก request ที่ยืนยันตัวตนจะเช็คกับฐานข้อมูลว่า user ยังอยู่ และใช้ role ล่าสุดจาก DB
//    → ลบ user หรือเปลี่ยน role แล้วมีผลทันที ไม่ต้องรอ token หมดอายุ
// 4) user ทั่วไปจะเข้าถึงได้เฉพาะข้อมูลของตัวเอง (user_id / order / cart)

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const JWT_ALGORITHM = 'HS256'
const JWT_ISSUER = 'meowverse-api'
const REFRESH_HEADER = 'X-Refreshed-Token'
const MIN_SECRET_LENGTH = 32

export const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' })

// ---------------------------------------------------------------------------
// Secret / config
// ---------------------------------------------------------------------------

let cachedSecret = null

function getJwtSecret() {
  if (cachedSecret) return cachedSecret

  const fromEnv = String(process.env.JWT_SECRET || '').trim()
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      console.warn(
        `[auth] JWT_SECRET สั้นเกินไป (${fromEnv.length} ตัวอักษร) ควรยาวอย่างน้อย ${MIN_SECRET_LENGTH} ตัวอักษร`,
      )
    }
    cachedSecret = fromEnv
    return cachedSecret
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('[auth] ต้องตั้งค่า JWT_SECRET ใน .env ก่อนรันบน production')
  }

  // โหมด dev: สุ่ม secret ชั่วคราวให้ใช้งานได้ แต่ token ทั้งหมดจะใช้ไม่ได้เมื่อรีสตาร์ทเซิร์ฟเวอร์
  cachedSecret = crypto.randomBytes(48).toString('hex')
  console.warn(
    '[auth] ยังไม่ได้ตั้งค่า JWT_SECRET ใน .env — ใช้ secret สุ่มชั่วคราว (ต้อง login ใหม่ทุกครั้งที่รีสตาร์ท API)',
  )
  return cachedSecret
}

// ---------------------------------------------------------------------------
// อายุ token (ตั้งค่าได้ใน .env)
//   admin                    → JWT_ADMIN_EXPIRES_IN    (ค่าเริ่มต้น 12h)
//   user ติ๊ก "จดจำฉัน"        → JWT_REMEMBER_EXPIRES_IN (ค่าเริ่มต้น 7d)
//   user ไม่ติ๊ก              → JWT_EXPIRES_IN          (ค่าเริ่มต้น 12h)
// ถ้ายังใช้งานอยู่ ระบบจะต่ออายุ token ให้อัตโนมัติ (sliding session)
// แต่รวมแล้วต้อง login ใหม่อย่างน้อยทุก JWT_ADMIN_MAX_SESSION (7d) / JWT_USER_MAX_SESSION (30d)
// ---------------------------------------------------------------------------

const DURATION_UNITS = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 }

function readDurationSeconds(envName, fallback) {
  const raw = String(process.env[envName] || '').trim().toLowerCase()
  const match = (raw || fallback).match(/^(\d+)\s*([smhd]?)$/)
  if (!match) {
    console.warn(`[auth] ${envName}="${raw}" ไม่ถูกต้อง ใช้ค่าเริ่มต้น ${fallback}`)
    return readDurationSeconds('__unused__', fallback)
  }
  return Number(match[1]) * DURATION_UNITS[match[2] || 's']
}

function getTokenPolicy(role, remember) {
  if (role === ROLES.ADMIN) {
    return {
      ttl: readDurationSeconds('JWT_ADMIN_EXPIRES_IN', '12h'),
      maxSession: readDurationSeconds('JWT_ADMIN_MAX_SESSION', '7d'),
    }
  }
  return {
    ttl: remember
      ? readDurationSeconds('JWT_REMEMBER_EXPIRES_IN', '7d')
      : readDurationSeconds('JWT_EXPIRES_IN', '12h'),
    maxSession: readDurationSeconds('JWT_USER_MAX_SESSION', '30d'),
  }
}

// สร้าง key แยกตามวัตถุประสงค์จาก JWT_SECRET (เช่น ใช้เซ็น URL ของสลิป)
// ไม่ใช้ secret ตัวเดียวกันตรงๆ เพื่อไม่ให้ลายเซ็นของงานหนึ่งเอาไปใช้กับอีกงานได้
export function deriveKey(purpose) {
  return crypto.createHmac('sha256', getJwtSecret()).update(String(purpose)).digest()
}

// เรียกตอนเริ่มเซิร์ฟเวอร์ (หลัง dotenv.config()) เพื่อให้ config ผิดพลาดตั้งแต่ตอน start
export function assertAuthConfig() {
  getJwtSecret()
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase() === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER
}

// account ต้องมี user_id, username, role, token_version
// options.remember = ผู้ใช้ติ๊ก "จดจำฉัน" (admin ไม่มีผล)
// options.authTime = เวลาที่ login ครั้งแรก (ใช้ตอนต่ออายุ เพื่อคุมอายุ session สูงสุด)
export function signAccessToken(account, { remember = false, authTime } = {}) {
  const userId = Number(account?.user_id ?? account?.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('signAccessToken: invalid user id')
  }

  const role = normalizeRole(account.role)
  const rememberMe = role !== ROLES.ADMIN && Boolean(remember)
  const now = Math.floor(Date.now() / 1000)
  const loginTime = Number.isInteger(authTime) ? authTime : now
  const { ttl, maxSession } = getTokenPolicy(role, rememberMe)
  const exp = Math.min(now + ttl, loginTime + maxSession)

  const token = jwt.sign(
    {
      role,
      username: String(account.username || ''),
      tv: Number(account.token_version) || 0, // ต้องตรงกับ accounts.token_version ถึงจะใช้ได้
      rem: rememberMe ? 1 : 0,
      auth_time: loginTime,
      jti: crypto.randomBytes(16).toString('hex'), // รหัสของ token ใบนี้ (ใช้ตอน logout)
      iat: now,
      exp,
    },
    getJwtSecret(),
    { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, subject: String(userId) },
  )

  return { token, expiresAt: exp * 1000 }
}

// ---------------------------------------------------------------------------
// การยกเลิก token
// ---------------------------------------------------------------------------

// logout เครื่องนี้: จด jti ของ token ใบนี้ไว้ในรายการที่ถูกยกเลิกจนกว่าจะหมดอายุ
export async function revokeToken(db, { tokenId, userId, expiresAtSeconds }) {
  if (!tokenId) return
  await db.query(
    'INSERT IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))',
    [tokenId, userId, expiresAtSeconds],
  )
}

// ออกจากระบบทุกเครื่อง / เปลี่ยนรหัสผ่าน: เพิ่ม token_version → token เก่าทุกใบใช้ไม่ได้ทันที
export async function revokeAllUserTokens(db, userId) {
  await db.query('UPDATE accounts SET token_version = token_version + 1 WHERE user_id = ?', [
    userId,
  ])
}

let authSchemaReady = false

// เรียกครั้งเดียวตอนเริ่มเซิร์ฟเวอร์: เพิ่มคอลัมน์/ตารางที่ระบบ token ต้องใช้ (ถ้ายังไม่มี)
// SQL เดียวกันอยู่ใน database/migrations/2026-09-22-auth-token-revocation.sql
export async function ensureAuthSchema(db) {
  if (authSchemaReady) return

  const [columns] = await db.query("SHOW COLUMNS FROM accounts LIKE 'token_version'")
  if (columns.length === 0) {
    await db.query('ALTER TABLE accounts ADD COLUMN token_version INT NOT NULL DEFAULT 0')
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti CHAR(32) NOT NULL PRIMARY KEY,
      user_id INT NOT NULL,
      expires_at DATETIME NOT NULL,
      KEY idx_revoked_tokens_expires_at (expires_at)
    )
  `)

  // ลบรายการที่หมดอายุแล้วทุกชั่วโมง (token ที่หมดอายุใช้ไม่ได้อยู่แล้ว ไม่ต้องจำ)
  const cleanup = () =>
    db
      .query('DELETE FROM revoked_tokens WHERE expires_at < NOW()')
      .catch((error) => console.error('[auth] revoked_tokens cleanup failed:', error.message))
  cleanup()
  setInterval(cleanup, 60 * 60 * 1000).unref?.()

  authSchemaReady = true
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function sendUnauthorized(res, error, code = 'UNAUTHORIZED') {
  return res.status(401).json({ success: false, error, code })
}

function sendForbidden(res, error = 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้') {
  return res.status(403).json({ success: false, error, code: 'FORBIDDEN' })
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

// ตรวจ JWT แล้วตั้งค่า req.user = { id, username, role }
export async function authenticateToken(req, res, next) {
  if (req.user) return next()

  const token = readBearerToken(req)
  if (!token) {
    return sendUnauthorized(res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 'TOKEN_MISSING')
  }

  let payload
  try {
    payload = jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
    })
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'TOKEN_EXPIRED')
    }
    return sendUnauthorized(res, 'โทเค็นไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่', 'TOKEN_INVALID')
  }

  const userId = Number(payload?.sub)
  const tokenId = String(payload?.jti || '')
  if (!Number.isInteger(userId) || userId <= 0 || !/^[a-f0-9]{32}$/.test(tokenId)) {
    return sendUnauthorized(res, 'โทเค็นไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่', 'TOKEN_INVALID')
  }

  try {
    const db = req.app.locals.db
    const [rows] = await db.query(
      `SELECT a.user_id, a.username, a.role, a.token_version,
              EXISTS(SELECT 1 FROM revoked_tokens r WHERE r.jti = ?) AS revoked
       FROM accounts a
       WHERE a.user_id = ?
       LIMIT 1`,
      [tokenId, userId],
    )
    if (rows.length === 0) {
      return sendUnauthorized(res, 'ไม่พบบัญชีผู้ใช้นี้แล้ว กรุณาเข้าสู่ระบบใหม่', 'USER_NOT_FOUND')
    }

    const account = rows[0]
    if (Number(account.revoked) === 1 || Number(payload.tv) !== Number(account.token_version)) {
      return sendUnauthorized(res, 'เซสชันนี้ถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่', 'TOKEN_REVOKED')
    }

    req.user = {
      id: Number(account.user_id),
      username: account.username,
      role: normalizeRole(account.role),
      tokenId,
      tokenExpiresAt: Number(payload.exp),
    }

    // ต่ออายุอัตโนมัติ: ใช้ไปเกินครึ่งอายุแล้ว → ส่ง token ใหม่กลับไปใน header
    // (frontend เก็บแทนของเดิมเอง — ดู src/utils/authFetch.js)
    const now = Math.floor(Date.now() / 1000)
    const lifetime = Number(payload.exp) - Number(payload.iat)
    if (lifetime > 0 && Number(payload.exp) - now < lifetime / 2) {
      const refreshed = signAccessToken(account, {
        remember: Number(payload.rem) === 1,
        authTime: Number(payload.auth_time),
      })
      if (refreshed.expiresAt / 1000 > Number(payload.exp)) {
        res.setHeader(REFRESH_HEADER, refreshed.token)
      }
    }

    return next()
  } catch (error) {
    console.error('[auth] failed to load user for token:', error.message)
    return res.status(500).json({ success: false, error: 'ไม่สามารถตรวจสอบสิทธิ์ได้' })
  }
}

export function isAdminRequest(req) {
  return req.user?.role === ROLES.ADMIN
}

export function requireRole(...roles) {
  const allowed = roles.map(normalizeRole)
  return (req, res, next) => {
    if (!req.user) return sendUnauthorized(res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 'TOKEN_MISSING')
    if (!allowed.includes(req.user.role)) return sendForbidden(res)
    return next()
  }
}

export const requireAdmin = requireRole(ROLES.ADMIN)

// user ทั่วไป: บังคับให้ user_id ใน query/body เป็นของตัวเองเสมอ
// - ถ้าส่ง user_id ของคนอื่นมา → 403
// - ถ้าไม่ได้ส่งมา → ใส่ให้อัตโนมัติจาก token
// admin: ไม่แตะ (ดูข้อมูลของ user คนไหนก็ได้)
export function enforceOwnUserId(req, res, next) {
  if (!req.user || isAdminRequest(req)) return next()

  const ownId = String(req.user.id)
  const queryUserId = req.query?.user_id
  const bodyUserId =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body.user_id
      : undefined

  for (const value of [queryUserId, bodyUserId]) {
    if (value !== undefined && value !== null && value !== '' && String(value) !== ownId) {
      return sendForbidden(res, 'ไม่สามารถเข้าถึงข้อมูลของผู้ใช้อื่นได้')
    }
  }

  // Express 5: req.query เป็น getter ที่ parse ใหม่ทุกครั้ง จึงต้อง override บน instance
  Object.defineProperty(req, 'query', {
    value: { ...req.query, user_id: ownId },
    writable: true,
    configurable: true,
    enumerable: true,
  })

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.user_id = req.user.id
  }

  return next()
}

// สร้าง param handler ตรวจว่าเป็นเจ้าของ resource (ใช้กับ app.param / router.param)
// ตัวอย่าง: router.param('order_id', requireOwnership('orders', 'order_id'))
const OWNERSHIP_TABLES = new Set(['orders', 'cart'])

export function requireOwnership(table, idColumn, notFoundMessage = 'ไม่พบข้อมูลที่ระบุ') {
  if (!OWNERSHIP_TABLES.has(table) || !/^[a-z_]+$/i.test(idColumn)) {
    throw new Error(`requireOwnership: unsupported table/column ${table}.${idColumn}`)
  }

  return async (req, res, next, rawId) => {
    if (!req.user) return sendUnauthorized(res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 'TOKEN_MISSING')
    if (isAdminRequest(req)) return next()

    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'รหัสไม่ถูกต้อง' })
    }

    try {
      const [rows] = await req.app.locals.db.query(
        `SELECT user_id FROM \`${table}\` WHERE \`${idColumn}\` = ? LIMIT 1`,
        [id],
      )
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: notFoundMessage })
      }
      if (Number(rows[0].user_id) !== req.user.id) {
        return sendForbidden(res, 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้')
      }
      return next()
    } catch (error) {
      console.error(`[auth] ownership check failed (${table}):`, error.message)
      return res.status(500).json({ success: false, error: 'ไม่สามารถตรวจสอบสิทธิ์ได้' })
    }
  }
}

// ---------------------------------------------------------------------------
// ตารางสิทธิ์ของทุกเส้น API (ตรวจจากบนลงล่าง เจอกฎแรกที่ตรงก็ใช้กฎนั้น)
//   public → ไม่ต้อง login
//   user   → ต้อง login (user หรือ admin ก็ได้) + จำกัดให้เห็นเฉพาะข้อมูลตัวเอง
//   admin  → admin เท่านั้น
// เส้นที่ไม่อยู่ในตาราง = admin (default-deny)
// ---------------------------------------------------------------------------

const PUBLIC = 'public'
const USER = 'user'
const ADMIN = 'admin'

const ACCESS_RULES = [
  // --- Auth ---
  ['POST', '/api/login', PUBLIC],
  ['POST', '/api/register', PUBLIC],
  ['POST', '/api/logout', USER],
  ['POST', '/api/logout-all', USER],

  // --- ข้อมูลสาธารณะ (หน้า login / หน้าร้าน) ---
  ['GET', '/api/health', PUBLIC],
  ['GET', '/api/site-settings/:key', PUBLIC],
  ['GET', '/api/categories', PUBLIC],
  ['GET', '/api/products/public', PUBLIC],
  ['GET', '/api/products/ready-to-ship', PUBLIC],
  ['GET', '/api/products/preorder', PUBLIC],
  ['GET', '/api/product-images', PUBLIC], // หน้าชำระเงินเรียกอยู่ (ยังไม่มีเส้นนี้ในเซิร์ฟเวอร์ → 404)
  ['GET', '/api/preorder-rounds/active', PUBLIC],
  ['GET', '/api/shipping-providers', PUBLIC],

  // --- โปรไฟล์ตัวเอง ---
  ['GET', '/api/users/me', USER],
  ['PUT', '/api/users/me', USER],

  // --- หน้าชำระเงิน / แจ้งเตือน ---
  ['GET', '/api/qrcodes', USER],
  ['GET', '/api/preorder-notifications', USER],

  // --- ตะกร้า (เช็คเจ้าของ cart_id ใน cart.js) ---
  ['GET', '/api/cart', USER],
  ['POST', '/api/cart', USER],
  ['PUT', '/api/cart/:cartId', USER],
  ['DELETE', '/api/cart/:cartId', USER],

  // --- ออเดอร์: เส้นของแอดมินต้องอยู่ก่อน /api/orders/:orderId ---
  ['GET', '/api/orders/postpones', ADMIN],
  ['PATCH', '/api/orders/postpones/:postId/status', ADMIN],
  ['PATCH', '/api/orders/:orderId/import-fee', ADMIN],
  ['PATCH', '/api/orders/:orderId/china-shipping', ADMIN],
  ['PATCH', '/api/orders/:orderId/reject-slip', ADMIN],

  // --- ออเดอร์ของลูกค้า (เช็คเจ้าของ order_id ผ่าน param handler) ---
  ['GET', '/api/orders', USER],
  ['POST', '/api/orders/checkout-preview', USER],
  ['POST', '/api/orders/confirm-payment', USER],
  ['GET', '/api/orders/:orderId', USER],
  ['GET', '/api/orders/:orderId/postpone/latest', USER],
  ['POST', '/api/orders/:orderId/postpone', USER],
  ['POST', '/api/orders/:orderId/payment', USER],
  ['POST', '/api/orders/:orderId/shipping', USER],
  ['PATCH', '/api/orders/:orderId/confirm-receipt', USER],
  ['PATCH', '/api/orders/:orderId/cancel', USER],
  ['PATCH', '/api/orders/:orderId/status', USER], // user เปลี่ยนได้เฉพาะกรณีแนบสลิปค่านำเข้าใหม่ (ดู order.js)
]

function compilePattern(pattern) {
  const source = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/')
  return new RegExp(`^${source}/?$`, 'i')
}

const COMPILED_RULES = ACCESS_RULES.map(([method, pattern, access]) => ({
  method,
  pattern,
  regex: compilePattern(pattern),
  access,
}))

export function resolveApiAccess(method, fullPath) {
  const normalizedMethod = method === 'HEAD' ? 'GET' : method
  const rule = COMPILED_RULES.find(
    (item) => item.method === normalizedMethod && item.regex.test(fullPath),
  )
  return rule ? rule.access : ADMIN
}

// ติดตั้งด้วย app.use('/api', authorizeApiRequest) ก่อน mount router ทั้งหมด
export function authorizeApiRequest(req, res, next) {
  if (req.method === 'OPTIONS') return next()

  const fullPath = `${req.baseUrl}${req.path}`
  const access = resolveApiAccess(req.method, fullPath)

  if (access === PUBLIC) return next()

  return authenticateToken(req, res, (error) => {
    if (error) return next(error)
    if (access === ADMIN && !isAdminRequest(req)) {
      return sendForbidden(res, 'เฉพาะผู้ดูแลระบบเท่านั้น')
    }
    return enforceOwnUserId(req, res, next)
  })
}
