export const DEFAULT_PREORDER_TERMS = [
  'สินค้าพรีออเดอร์อาจใช้เวลาจัดส่งตามกำหนดการของร้านและผู้ผลิต',
  'กำหนดการจัดส่งอาจเปลี่ยนแปลงได้ หากเกิดความล่าช้าจากขนส่งหรือปัจจัยภายนอก',
  'ค่านำเข้า (ถ้ามี) จะแจ้งให้ชำระเพิ่มเติมในรอบที่ 2 หลังสินค้าถึงไทย',
  'กรุณาตรวจสอบชื่อ ที่อยู่ เบอร์โทรศัพท์ และรายละเอียดสินค้าให้ถูกต้องก่อนยืนยัน',
  'เมื่อยืนยันคำสั่งซื้อแล้ว การยกเลิกหรือเปลี่ยนแปลงรายการจะเป็นไปตามเงื่อนไขของร้าน',
]

export function normalizePreorderTerms(terms) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 50) return null
  if (terms.some((term) => typeof term !== 'string' || !term.trim() || term.trim().length > 1000)) return null
  const normalized = terms.map((term) => term.trim())
  // Leave room within the existing MySQL TEXT column, including JSON encoding.
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 60000) return null
  return normalized
}
