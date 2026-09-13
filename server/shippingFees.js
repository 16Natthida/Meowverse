// server/shippingFees.js
// จุดรวม logic การอ่านค่าส่ง (ready / preorder) จากตาราง site_settings
// ใช้ร่วมกันทั้งใน order.js, shipping.js และ index.js เพื่อไม่ให้ค่าเพี้ยนกันคนละที่

export const SHIPPING_FEE_SETTING_KEYS = Object.freeze({
  ready: 'shipping_fee_ready',
  preorder: 'shipping_fee_preorder',
})

// ค่าเริ่มต้น (fallback) กรณียังไม่เคยตั้งค่าใน site_settings
export const DEFAULT_SHIPPING_FEES = Object.freeze({
  ready: 49,
  preorder: 65,
})

/**
 * อ่านค่าส่งปัจจุบันจาก site_settings
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} runner - pool หรือ connection ที่ query ได้
 * @returns {Promise<{ready: number, preorder: number}>}
 */
export async function getShippingFeeSettings(runner) {
  try {
    const [rows] = await runner.query(
      `SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (?, ?)`,
      [SHIPPING_FEE_SETTING_KEYS.ready, SHIPPING_FEE_SETTING_KEYS.preorder],
    )
    const map = new Map(rows.map((row) => [row.setting_key, row.setting_value]))
    const readyRaw = map.get(SHIPPING_FEE_SETTING_KEYS.ready)
    const preorderRaw = map.get(SHIPPING_FEE_SETTING_KEYS.preorder)
    const ready = Number(readyRaw)
    const preorder = Number(preorderRaw)
    return {
      ready: Number.isFinite(ready) && readyRaw !== undefined ? ready : DEFAULT_SHIPPING_FEES.ready,
      preorder: Number.isFinite(preorder) && preorderRaw !== undefined ? preorder : DEFAULT_SHIPPING_FEES.preorder,
    }
  } catch (error) {
    console.error('Load shipping fee settings error:', error)
    return { ...DEFAULT_SHIPPING_FEES }
  }
}
