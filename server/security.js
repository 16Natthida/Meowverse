// server/security.js
// รวมมาตรการป้องกันการโจมตีของ API ไว้ที่เดียว
//   - อัปโหลดรูปอย่างปลอดภัย (ตรวจชนิดไฟล์จากเนื้อไฟล์จริง, ตั้งนามสกุลเอง)
//   - ป้องกันไฟล์สลิป: ต้องมี URL ที่เซ็นแล้ว (มีอายุ) ถึงจะเปิดดูได้
//   - ซ่อนรายละเอียด error ภายใน (SQL / stack) ไม่ให้หลุดถึงผู้ใช้
//   - จำกัดจำนวน request (rate limit)
//   - security headers (helmet)
//   - นโยบายรหัสผ่าน

import crypto from 'node:crypto'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { open, rename, unlink } from 'node:fs/promises'
import helmet from 'helmet'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { deriveKey } from './auth.js'

// ===========================================================================
// Error handling — ไม่ส่งข้อความ error ภายในกลับไปให้ผู้ใช้
// ===========================================================================

export const GENERIC_ERROR_MESSAGE = 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง'
const THAI_TEXT = /[฀-๿]/

// ใช้ throw ข้อความที่ "ตั้งใจให้ผู้ใช้เห็น" พร้อม status code
export class PublicError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'PublicError'
    this.status = status
    this.expose = true
  }
}

// ข้อความที่ปลอดภัยจะส่งให้ผู้ใช้:
// - PublicError (expose = true)
// - Error ที่โค้ดเราเขียนข้อความภาษาไทยเอง (ไม่ใช่ error จาก MySQL / ระบบ)
function isSafeToExpose(error) {
  if (!error || typeof error.message !== 'string' || !error.message) return false
  if (error.expose === true) return true
  if (error.sqlMessage || error.sqlState || error.errno || error.code) return false
  return THAI_TEXT.test(error.message)
}

export function publicErrorMessage(error) {
  return isSafeToExpose(error) ? error.message : GENERIC_ERROR_MESSAGE
}

// ใช้แทน res.status(500).json({ error: error.message })
// key = ชื่อ field ที่ frontend อ่านอยู่เดิม ('error' หรือ 'message')
export function sendServerError(res, error, key = 'error', extra = {}) {
  const status =
    error?.expose === true && Number.isInteger(error.status) && error.status >= 400
      ? error.status
      : 500
  if (status >= 500) {
    const req = res.req
    console.error(`[api] ${req?.method || ''} ${req?.originalUrl || ''} →`, error)
  }
  return res.status(status).json({ ...extra, [key]: publicErrorMessage(error) })
}

function sendJsonError(res, status, message) {
  return res.status(status).json({ success: false, error: message, message })
}

// error handler ตัวสุดท้ายของ app
export function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `ไฟล์มีขนาดใหญ่เกินไป (สูงสุด ${MAX_UPLOAD_MB} MB)`
        : 'ข้อมูลไฟล์ที่อัปโหลดไม่ถูกต้อง'
    return sendJsonError(res, 400, message)
  }
  if (error?.type === 'entity.too.large') {
    return sendJsonError(res, 413, 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป')
  }
  if (error?.type === 'entity.parse.failed') {
    return sendJsonError(res, 400, 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง')
  }
  if (error?.message === 'Not allowed by CORS') {
    return sendJsonError(res, 403, 'ไม่อนุญาตให้เรียกใช้งานจากเว็บไซต์นี้')
  }

  const status = error?.expose === true && Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} →`, error)
  return sendJsonError(res, status, publicErrorMessage(error))
}

// ===========================================================================
// Security headers (helmet)
// ===========================================================================

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        // รูปแบนเนอร์/โลโก้อาจเป็น URL ภายนอกที่แอดมินตั้งไว้
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        // ไม่บังคับอัปเกรดเป็น https อัตโนมัติ (บางเครื่องยังรันผ่าน http ใน LAN)
        'upgrade-insecure-requests': null,
      },
    },
    // หน้า dev (localhost:5173) ต้องโหลดรูปจาก API (localhost:3001) ได้
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
}

// ===========================================================================
// Rate limiting (จำกัดตาม IP)
// หมายเหตุ: ถ้าอยู่หลัง reverse proxy (nginx, Cloudflare ฯลฯ) ต้องตั้ง TRUST_PROXY ใน .env
// ไม่งั้นทุกคนจะถูกนับเป็น IP เดียวกัน (IP ของ proxy)
// ===========================================================================

function createLimiter({ windowMs, limit, message, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => sendJsonError(res, 429, message),
    ...options,
  })
}

// ทุกเส้นใต้ /api: 300 ครั้ง/นาที/IP
export const apiRateLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
})

// login ผิดได้ 20 ครั้ง / 15 นาที / IP (login สำเร็จไม่นับ)
// ใช้คู่กับการล็อกต่อ username ที่มีอยู่เดิม — กันการยิงสุ่มหลาย username จาก IP เดียว
export const loginRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่',
})

// สมัครสมาชิกได้ 10 ครั้ง / ชั่วโมง / IP
export const registerRateLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'สมัครสมาชิกบ่อยเกินไป กรุณาลองใหม่ภายหลัง',
})

// อัปโหลดไฟล์ได้ 40 ครั้ง / 15 นาที / IP (กันยิงไฟล์จนดิสก์เต็ม)
export const uploadRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: 'อัปโหลดไฟล์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
})

// TRUST_PROXY: ว่าง = ไม่เชื่อ X-Forwarded-For, ตัวเลข = จำนวน proxy ข้างหน้า, หรือค่าแบบ express เช่น loopback
export function parseTrustProxy(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw.toLowerCase() === 'false') return false
  if (/^\d+$/.test(raw)) return Number(raw)
  if (raw.toLowerCase() === 'true') {
    console.warn('[security] TRUST_PROXY=true ไม่ปลอดภัย (ปลอม IP ได้) — ใช้จำนวน proxy แทน เช่น TRUST_PROXY=1')
    return 1
  }
  return raw
}

// ===========================================================================
// Password policy
// ===========================================================================

export const PASSWORD_MIN_LENGTH = 8
const BCRYPT_MAX_BYTES = 72

// รหัสผ่านยอดนิยมที่ผู้โจมตีลองก่อนเสมอ (ห้ามใช้)
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234',
  '11223344', '88888888', '99999999', 'password', 'password1', 'passw0rd', 'qwertyui',
  'qwerty123', 'qwertyuiop', 'asdfghjk', 'asdfasdf', 'zxcvbnm1', 'abcdefgh', 'abcd1234',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'welcome1', 'admin123',
  'administrator', 'letmein1', 'trustno1', 'superman', 'whatever', 'aaaaaaaa',
  'meowverse', 'meowverse1', 'meowverse123',
])

export function validatePassword(password, { username } = {}) {
  const value = String(password ?? '')
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`
  }
  if (Buffer.byteLength(value, 'utf8') > BCRYPT_MAX_BYTES) {
    return `รหัสผ่านยาวเกินไป (สูงสุด ${BCRYPT_MAX_BYTES} ตัวอักษรภาษาอังกฤษ)`
  }
  // ไม่บังคับชนิดตัวอักษร (ใช้ตัวพิมพ์เล็กล้วน/ภาษาไทยได้) แต่ห้ามรหัสที่เดาง่ายเกินไป
  const lowered = value.toLowerCase()
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(value)) {
    return 'รหัสผ่านนี้เดาง่ายเกินไป กรุณาตั้งรหัสอื่น'
  }
  const name = String(username ?? '').trim().toLowerCase()
  if (name.length >= 3 && value.toLowerCase().includes(name)) {
    return 'รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ในรหัสผ่าน'
  }
  return null
}

// เทียบ string แบบใช้เวลาคงที่ (กัน timing attack) — ใช้กับรหัสผ่านแบบเก่าที่ยังไม่ได้ hash
export function safeEqualStrings(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest()
  const digestB = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(digestA, digestB)
}

// ===========================================================================
// Image uploads
// ===========================================================================

const MAX_UPLOAD_MB = 5
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])
const IMAGE_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
}
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const INVALID_IMAGE_MESSAGE = 'อนุญาตเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF, HEIC) เท่านั้น'

// ดูชนิดไฟล์จาก "magic bytes" ในเนื้อไฟล์ ไม่เชื่อชื่อไฟล์หรือ Content-Type ที่ผู้ส่งกำหนด
export function detectImageExtension(buffer) {
  if (!buffer || buffer.length < 3) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'gif'
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    HEIF_BRANDS.has(buffer.toString('ascii', 8, 12))
  ) {
    return 'heic'
  }
  return null
}

async function readFileHead(filePath, size = 32) {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, size, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

// สร้างตัวรับอัปโหลดรูป — ใช้แทน multer เดิม: upload.single('image')
// - สลิป (field "slip") เก็บแยกใน uploads/slips/ ซึ่งต้องใช้ URL ที่เซ็นแล้วถึงจะเปิดได้
// - ตั้งชื่อไฟล์เองทั้งหมด (สุ่ม) และนามสกุลมาจากชนิดไฟล์จริง
// - หลังผ่านแล้ว req.file.publicUrl = path ที่ใช้เก็บลง DB เช่น /uploads/slips/xxx.png
export function createImageUpload({ uploadsDir }) {
  const slipsDir = path.join(uploadsDir, 'slips')
  mkdirSync(slipsDir, { recursive: true })

  const storage = multer.diskStorage({
    destination: (_req, file, callback) => {
      callback(null, file.fieldname === 'slip' ? slipsDir : uploadsDir)
    },
    filename: (_req, _file, callback) => {
      // นามสกุลชั่วคราว .upload — จะเปลี่ยนเป็นนามสกุลจริงหลังตรวจเนื้อไฟล์แล้ว
      callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.upload`)
    },
  })

  const multerUpload = multer({
    storage,
    limits: {
      fileSize: MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 30,
      fieldSize: 100 * 1024,
      parts: 40,
    },
    fileFilter: (_req, file, callback) => {
      const mime = String(file.mimetype || '').toLowerCase()
      if (!ALLOWED_UPLOAD_MIME.has(mime)) {
        return callback(new PublicError(INVALID_IMAGE_MESSAGE, 400))
      }
      return callback(null, true)
    },
  })

  async function verifyUploadedImage(req, res, next) {
    if (!req.file) return next()

    try {
      const extension = detectImageExtension(await readFileHead(req.file.path))
      if (!extension) {
        await unlink(req.file.path).catch(() => {})
        req.file = undefined
        return sendJsonError(res, 400, INVALID_IMAGE_MESSAGE)
      }

      const finalName = req.file.filename.replace(/\.upload$/, `.${extension}`)
      const finalPath = path.join(path.dirname(req.file.path), finalName)
      await rename(req.file.path, finalPath)

      const relative = path.relative(uploadsDir, finalPath).split(path.sep).join('/')
      Object.assign(req.file, {
        filename: finalName,
        path: finalPath,
        mimetype: IMAGE_MIME_BY_EXT[extension],
        publicUrl: `/uploads/${relative}`,
      })
      return next()
    } catch (error) {
      await unlink(req.file.path).catch(() => {})
      return next(error)
    }
  }

  return {
    single: (fieldName) => [uploadRateLimiter, multerUpload.single(fieldName), verifyUploadedImage],
  }
}

// ===========================================================================
// Signed URLs สำหรับไฟล์สลิป
// ===========================================================================

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 ชั่วโมง
const SIGNED_URL_BUCKET_SECONDS = 10 * 60 // ปัดเวลาให้ URL ซ้ำกันภายใน 10 นาที → browser cache ได้
let signingKey = null

function getSigningKey() {
  if (!signingKey) signingKey = deriveKey('meowverse-upload-url-v1')
  return signingKey
}

function computeSignature(pathname, exp) {
  return crypto.createHmac('sha256', getSigningKey()).update(`${pathname}|${exp}`).digest('base64url')
}

// แปลง /uploads/... ให้เป็น URL ที่มีลายเซ็น + วันหมดอายุ (ใช้ตอนส่งข้อมูลสลิปให้ผู้มีสิทธิ์เท่านั้น)
export function signUploadUrl(url) {
  if (typeof url !== 'string') return url
  const pathname = url.trim().split(/[?#]/)[0]
  if (!pathname.startsWith('/uploads/')) return url

  const now = Math.floor(Date.now() / 1000)
  const exp =
    Math.ceil((now + SIGNED_URL_TTL_SECONDS) / SIGNED_URL_BUCKET_SECONDS) *
    SIGNED_URL_BUCKET_SECONDS
  return `${pathname}?exp=${exp}&sig=${computeSignature(pathname, exp)}`
}

function hasValidSignature(pathname, query) {
  const exp = Number(query?.exp)
  const sig = String(query?.sig || '')
  if (!Number.isInteger(exp) || !sig) return false
  if (exp * 1000 < Date.now()) return false

  const expected = Buffer.from(computeSignature(pathname, exp))
  const received = Buffer.from(sig)
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

// ===========================================================================
// การเสิร์ฟไฟล์ใน /uploads
// ===========================================================================

const INLINE_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.bmp',
  '.svg',
])

// ตัวเลือกของ express.static: ไฟล์ทุกไฟล์ถูก sandbox ห้ามรันสคริปต์
// ไฟล์ที่ไม่ใช่รูป (เช่น .html ที่อาจถูกอัปโหลดไว้ก่อนหน้านี้) จะถูกบังคับให้ดาวน์โหลดแทนการเปิดในเบราว์เซอร์
export const uploadsStaticOptions = {
  index: false,
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    )
    if (!INLINE_UPLOAD_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'attachment')
    }
  },
}

// ตรวจสิทธิ์ก่อนเสิร์ฟไฟล์สลิป
// - ไฟล์ใน uploads/slips/ ต้องมีลายเซ็นเสมอ
// - สลิปเก่าที่อยู่ปนกับรูปสินค้าใน uploads/ ตรวจจากตาราง payment ว่าเป็นสลิปหรือไม่
export function createUploadsGuard({ db }) {
  const slipCache = new Map()
  const CACHE_TTL_MS = 10 * 60 * 1000
  const CACHE_MAX_ENTRIES = 10000

  async function isLegacySlip(fileName) {
    const cached = slipCache.get(fileName)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const escaped = fileName.replace(/[\\%_]/g, (char) => `\\${char}`)
    const [rows] = await db.query('SELECT 1 FROM payment WHERE slip_img LIKE ? LIMIT 1', [
      `%/${escaped}`,
    ])
    const value = rows.length > 0

    if (slipCache.size >= CACHE_MAX_ENTRIES) slipCache.clear()
    slipCache.set(fileName, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    return value
  }

  return async function uploadsGuard(req, res, next) {
    const relativePath = req.path
    const pathname = `${req.baseUrl}${relativePath}`

    try {
      const isSlip =
        relativePath.toLowerCase().startsWith('/slips/') ||
        (await isLegacySlip(path.posix.basename(relativePath)))

      if (!isSlip) return next()

      if (!hasValidSignature(pathname, req.query)) {
        return res.status(403).type('text/plain').send('Forbidden')
      }
      res.setHeader('Cache-Control', 'private, max-age=600')
      res.setHeader('Referrer-Policy', 'no-referrer')
      return next()
    } catch (error) {
      console.error('[uploads] access check failed:', error.message)
      return res.status(503).type('text/plain').send('Service Unavailable')
    }
  }
}
