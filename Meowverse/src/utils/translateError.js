export default function translateError(err) {
  let msg
  if (!err) return 'เกิดข้อผิดพลาด'

  if (typeof err === 'string') msg = err
  else if (err instanceof Error) msg = String(err.message || '')
  else if (typeof err === 'object') {
    // Try common shapes
    if (err.message) msg = String(err.message)
    else if (err.error) msg = String(err.error)
    else msg = JSON.stringify(err)
  } else {
    msg = String(err)
  }

  const lower = msg.toLowerCase()

  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('unable to connect')
  ) {
    return 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่อีกครั้ง'
  }
  if (lower.includes('unauthorized') || lower.includes('401'))
    return 'การเข้าสู่ระบบหมดสิทธิ์หรือไม่ถูกต้อง (401)'
  if (lower.includes('forbidden') || lower.includes('403'))
    return 'คุณไม่มีสิทธิ์ดำเนินการนี้ (403)'
  if (lower.includes('not found') || lower.includes('404')) return 'ไม่พบข้อมูลที่ร้องขอ (404)'
  if (lower.includes('500')) return 'เกิดข้อผิดพลาดภายในระบบ กรุณาติดต่อผู้ดูแล (500)'
  if (lower.includes('timeout')) return 'การเชื่อมต่อล้มเหลว (หมดเวลา)'
  if (lower.includes('not defined')) return `เกิดข้อผิดพลาดภายในระบบ: ${msg}`

  // Common UX messages from backend
  if (lower.includes('invalid') || lower.includes('required'))
    return 'ข้อมูลไม่ถูกต้อง โปรดตรวจสอบและลองใหม่'

  // Fallback: return original but ensure Thai prefix
  return `เกิดข้อผิดพลาด: ${msg}`
}
