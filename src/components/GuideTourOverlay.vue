<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GUIDE_ENABLED } from '../config/guide'

const route = useRoute()
const router = useRouter()
const open = ref(false)
const stepIndex = ref(0)
const steps = ref([])
const targetBox = ref(null)
const cardRef = ref(null)
const position = ref({ top: 0, left: 0 })
let activeTargetElement = null
let activeTargetStyles = null

const userSteps = {
  browse: [
    ['.hero__actions .btn--primary, .hero__actions .btn:first-child', 'ปุ่มสินค้าพร้อมส่ง', 'กดปุ่มนี้เพื่อดูสินค้าที่มีสต็อกและสามารถจัดส่งได้ตามปกติ'],
    ['.hero__actions .btn--outline, .hero__actions .btn:nth-child(2)', 'ปุ่มสินค้าพรีออเดอร์', 'กดปุ่มนี้เพื่อดูสินค้าที่สั่งตามรอบพรีออเดอร์'],
    ['.user-shell__search, .search-box', 'ช่องค้นหาสินค้า', 'พิมพ์ชื่อสินค้าในช่องนี้เพื่อค้นหารายการได้เร็วขึ้น'],
    ['.categories .cat-btn, .categories', 'ปุ่มกรองหมวดหมู่', 'กดปุ่มหมวดหมู่ เช่น อาหาร ขนม หรือสินค้าแนะนำ เพื่อให้เหลือเฉพาะสินค้าที่ต้องการ'],
    ['.product-card .btn-cart, .recommended-card', 'ปุ่มเลือก/เพิ่มสินค้า', 'กดปุ่มนี้เพื่อเลือกสินค้า เพิ่มลงตะกร้า หรือเปิดรายละเอียดเพื่อเลือกรสชาติและจำนวน'],
    ['.user-shell__top-action, .cart-icon-btn', 'ตะกร้าสินค้า', 'กดไอคอนรถเข็นด้านบนเพื่อดูรายการสินค้า ตรวจยอด และไปชำระเงิน'],
  ],
  cart: [
    ['.cart-layout', 'ภาพรวมตะกร้า', 'หน้านี้แยกรายการพร้อมส่งและพรีออเดอร์ให้ตรวจได้ชัดเจน'],
    '.view-toggle__btn',
    ['.item-list', 'ปรับจำนวนสินค้า', 'ใช้ปุ่ม + / − เพื่อปรับจำนวน หรือกดลบเมื่อต้องการเอารายการออก'],
    ['.cart-summary', 'ตรวจยอดรวม', 'ตรวจยอดสินค้าและประเภทออเดอร์ในกล่องสรุปด้านขวา'],
    ['.btn-checkout', 'ไปชำระเงิน', 'เมื่อข้อมูลถูกต้อง กดปุ่มนี้เพื่อสร้าง/ไปยังรายการชำระเงิน'],
  ],
  orders: [
    ['.type-tabs', 'กรองประเภทออเดอร์', 'เลือกดูทั้งหมด พร้อมส่ง หรือพรีออเดอร์'],
    ['.tabs', 'กรองตามสถานะ', 'กรองเฉพาะรอชำระ รอนำเข้า รอค่านำเข้า หรือกำลังจัดส่ง'],
    ['.order-card', 'เปิดรายละเอียดออเดอร์', 'กดการ์ดเพื่อไปหน้าชำระเงิน ดูความคืบหน้า และแนบสลิป'],
    ['.tracking-summary', 'ติดตามพัสดุ', 'เมื่อร้านส่งแล้ว จะเห็นบริษัทขนส่ง เลขพัสดุ และปุ่มยืนยันรับสินค้า'],
  ],
  profile: [
    ['.profile-form-card', 'ข้อมูลบัญชี', 'ตรวจสอบชื่อ เบอร์โทร และข้อมูลจัดส่งของคุณ'],
    ['.profile-section input, .profile-section textarea', 'แก้ไขข้อมูล', 'กดในช่องที่แก้ไขได้ แล้วกรอกข้อมูลให้ครบถ้วน'],
    ['.profile-actions .btn--primary', 'บันทึกข้อมูล', 'กดบันทึกหลังแก้ไข ระบบจะแจ้งผลการบันทึกด้านล่าง'],
  ],
  payment: [
    ['.payment-card, .payment-page, .content', 'ตรวจรายละเอียดการชำระ', 'ตรวจเลขออเดอร์ ยอดเงิน และข้อมูลผู้รับก่อนชำระ'],
    ['input[type="file"], .upload-area, .slip-upload', 'แนบสลิป', 'เลือกภาพสลิปที่เห็นยอดเงินและวันที่ชัดเจน'],
    ['button[type="submit"], .btn-primary, .btn--primary', 'ยืนยันการชำระเงิน', 'กดส่งข้อมูลแล้วรอแอดมินตรวจสอบในรายการออเดอร์'],
  ],
}

const adminSteps = {
  home: [
    ['.kpi-grid', 'ตัวเลขภาพรวม', 'ดูจำนวนออเดอร์ มูลค่าสต็อก สินค้า และหมวดหมู่'],
    ['.dashboard-grid', 'กราฟและข้อมูลเชิงลึก', 'ใช้ดูภาพรวมสต็อกและรายได้ของร้าน'],
    ['.slip-section', 'สลิปที่ต้องตรวจ', 'ตรวจรายการชำระเงินล่าสุดได้จากส่วนนี้ หรือกดเข้าเมนูจัดการสลิป'],
  ],
  sales: [
    ['.sales-type-switch', 'สลับประเภทการขาย', 'เลือกดูยอดขายทั้งหมด พร้อมส่ง หรือพรีออเดอร์'],
    ['.view-filter-row', 'เลือกมุมมอง', 'สลับระหว่างสรุปยอดขายรายสินค้าและรายการออเดอร์'],
    ['.summary-filters, .orders-table, .sales-table', 'กรองข้อมูล', 'ใช้ตัวกรองและค้นหาเพื่อเจาะรายการที่ต้องการ'],
    ['.admin-order-page .order-row, .summary-table', 'เปิดรายละเอียด', 'กดแถว/รายการเพื่อดูรายละเอียดสินค้าและออเดอร์'],
  ],
  products: [
    ['.toolbar', 'แถบจัดการสินค้า', 'ดูจำนวนสินค้า ค้นหา และเปิดฟอร์มหมวดหมู่หรือเพิ่มสินค้า'],
    ['.toolbar-actions', 'ค้นหาและเพิ่มข้อมูล', 'ค้นหาด้วยชื่อสินค้า/SKU/หมวดหมู่ หรือกดเพิ่มสินค้า'],
    ['.product-form', '.category-manager', 'กรอกข้อมูลสินค้า', 'กรอกชื่อ SKU หมวดหมู่ ราคา รสชาติ สต็อก และสถานะการขาย'],
    ['.form-actions, .toolbar-btn--primary', 'บันทึกข้อมูล', 'ตรวจข้อมูลให้ครบแล้วกดบันทึก การแก้ SKU ซ้ำจะไม่ผ่าน'],
  ],
  slips: [
    ['.kpi-grid', 'สรุปสลิป', 'ดูจำนวนสลิปรอตรวจ อนุมัติแล้ว และปฏิเสธแล้ว'],
    ['.filter-shell', 'กรองสลิป', 'เลือกประเภทออเดอร์และสถานะเพื่อหาสลิปที่ต้องทำงาน'],
    ['.slip-table', 'เปิดดูหลักฐาน', 'กดดูสลิปเพื่อตรวจยอดเงิน เลขออเดอร์ และชื่อผู้ชำระ'],
    ['.btn-approve, .btn-reject', 'อนุมัติหรือปฏิเสธ', 'อนุมัติเมื่อหลักฐานครบถ้วน ปฏิเสธเมื่อยอด/ข้อมูลไม่ถูกต้อง'],
  ],
  rounds: [
    ['.round-form, .rounds-toolbar, .toolbar', 'จัดการรอบ', 'สร้าง/แก้ไขรอบพรีออเดอร์และกำหนดช่วงเวลารับออเดอร์'],
    ['.round-list, .round-card, .rounds-list', 'เลือกรอบ', 'กดรอบที่ต้องการเพื่อดูรายละเอียดและสินค้าที่ผูกไว้'],
    ['.products-section, .products-grid', 'สินค้าในรอบ', 'ตรวจสินค้า ราคา ขั้นต่ำ และยอดจองในรอบนั้น'],
    ['.btn-add-products-small, .btn-primary', 'เพิ่มสินค้า/บันทึก', 'เพิ่มสินค้าเข้าไปในรอบ แล้วตรวจข้อมูลก่อนบันทึก'],
  ],
  progress: [
    ['.summary-grid', 'สรุปความคืบหน้า', 'ดูจำนวนรายการที่ถึงขั้นต่ำและยังไม่ถึงขั้นต่ำ'],
    ['.filter-panel', 'กรองรอบ/สถานะ', 'ใช้ตัวกรองเพื่อเจาะรายการที่ต้องติดตาม'],
    ['.table-card', 'ตารางความคืบหน้า', 'ตรวจยอดจองและสถานะขั้นต่ำของสินค้าแต่ละรายการ'],
  ],
  statistics: [
    ['.filter-card', 'ตัวกรองสถิติ', 'เลือกสินค้า รอบ และเงื่อนไขเพื่อสร้างรายงาน'],
    ['.filter-buttons, .hero-btn--primary', 'สร้างรายงาน', 'กดดูรายงานหลังเลือกตัวกรอง หรือกดล้างตัวกรองเพื่อเริ่มใหม่'],
    ['.history-table, .history-cards', 'อ่านสถิติย้อนหลัง', 'ดูจำนวนออเดอร์ จำนวนชิ้น ราคาเฉลี่ย และยอดรวมแยกตามรอบ'],
  ],
  postpone: [
    ['.kpi-grid', 'สรุปคำขอเลื่อน', 'ดูจำนวนคำขอทั้งหมด รอดำเนินการ อนุมัติ และปฏิเสธ'],
    ['.filter-panel', 'ค้นหาและกรอง', 'ค้นหาลูกค้า/ออเดอร์ และกรองตามสถานะคำขอ'],
    ['.table-panel', 'ตรวจรายละเอียดคำขอ', 'อ่านเหตุผลและกำหนดชำระใหม่ก่อนตัดสินใจ'],
    ['.btn-action--approve, .btn-action--reject', 'อนุมัติหรือปฏิเสธ', 'เลือกผลตามนโยบายร้านและข้อมูลออเดอร์'],
  ],
  intake: [
    ['.intake-grid', 'เลือกรอบรับสินค้า', 'เลือกรอบทางซ้ายเพื่อเปิดรายละเอียดสินค้าที่ต้องตรวจรับ'],
    ['.items-table', 'กรอกจำนวนรับจริง', 'เทียบจำนวนสั่งกับจำนวนที่รับจริง ระบบจะคำนวณรายการขาดให้'],
    ['.qty-input', 'กรอกจำนวนรายชิ้น', 'กรอกเฉพาะจำนวนที่นับได้จริง ตรวจซ้ำก่อนยืนยัน'],
    ['.action-row .primary-btn', 'ยืนยันรับสินค้า', 'กดบันทึกเมื่อเช็กจำนวนและหมายเหตุครบแล้ว'],
  ],
  missing: [
    ['.kpi-grid', 'สรุปรายการขาด', 'ดูจำนวนสินค้า/ออเดอร์ที่ได้รับผลกระทบ'],
    ['.table-panel', 'ตรวจสินค้าที่ขาด', 'เทียบจำนวนสั่ง จำนวนรับจริง และยอดคืน'],
    ['.action-buttons', 'ดำเนินการชดเชย', 'ใช้ปุ่มเลื่อน/คืนเงินตามขั้นตอนของร้าน'],
  ],
  importFee: [
    ['.selector-card', 'เลือกรอบพรีออเดอร์', 'เลือกรอบที่ต้องการกรอกค่านำเข้าและดูสถานะรอบ'],
    ['.fee-table', 'ตรวจรายการและสถานะสินค้า', 'ดูจำนวนสั่ง/รับจริง ราคา และกลุ่มสินค้าที่มาถึง'],
    ['.fee-input', 'กรอกค่านำเข้า', 'กรอกค่าเป็นบาทตามรายการที่ระบบเปิดให้แก้ไข'],
    ['.btn-save', 'บันทึกค่านำเข้า', 'ตรวจทุกแถวก่อนบันทึก เพราะยอดนี้ใช้คำนวณชำระรอบที่ 2'],
  ],
  shipping: [
    ['.filter-panel', 'กรองรายการจัดส่ง', 'เลือกประเภทออเดอร์หรือสถานะเพื่อเตรียมจัดส่ง'],
    ['.shipping-page', 'ตรวจผู้รับและรายการ', 'ตรวจที่อยู่ สินค้า หมายเหตุ และยอดของแต่ละออเดอร์'],
    ['.shipment-editor', 'กรอกข้อมูลขนส่ง', 'เลือกบริษัทขนส่งและกรอกเลขติดตามตามที่ระบบเปิดให้แก้ไข'],
    ['.btn-action--ready, .btn-print-order', 'ยืนยัน/พิมพ์ใบสั่งซื้อ', 'อัปเดตสถานะพร้อมส่งหรือพิมพ์เอกสารจัดส่ง'],
  ],
  providers: [
    ['.provider-form', 'ตั้งค่าค่าขนส่ง', 'กรอกค่าบริการ/รายละเอียดบริษัทขนส่งตามช่องที่กำหนด'],
    ['.form-actions .btn--primary', 'บันทึกบริษัทขนส่ง', 'กดบันทึกเมื่อข้อมูลและสถานะเปิดใช้งานถูกต้อง'],
    ['.provider-list', 'รายการบริษัทขนส่ง', 'ดู แก้ไข หรือเปิด/ปิดบริษัทขนส่งที่มีอยู่'],
  ],
  settings: [
    ['.settings-tabs', 'เลือกหมวดตั้งค่า', 'สลับระหว่างกฎพรีออเดอร์ แบนเนอร์ และโลโก้'],
    ['.settings-view', 'แก้ไขค่าระบบ', 'กรอกหรืออัปโหลดค่าที่ต้องการเปลี่ยน โดยตรวจตัวอย่างก่อนบันทึก'],
    ['button[type="submit"], .btn-primary, .save-btn', 'บันทึกการตั้งค่า', 'กดบันทึกแล้วตรวจข้อความสำเร็จ/ผิดพลาด'],
  ],
  qrcodes: [
    ['.upload-section', 'เพิ่ม QR Payment', 'กรอกวิธีชำระและเลือกไฟล์ QR ที่ต้องการให้ User ใช้'],
    ['.upload-section .btn', 'อัปโหลด QR', 'ตรวจรูปและบัญชีปลายทางก่อนกดอัปโหลด'],
    ['.qr-list', 'จัดการ QR ที่มีอยู่', 'เปิด/ปิดใช้งานหรือลบ QR ที่ไม่ต้องการ'],
  ],
  users: [
    ['.header-actions, .btn-add-user', 'เพิ่มผู้ใช้ใหม่', 'กดเพื่อไปยังแบบฟอร์มสร้างบัญชี User หรือ Admin'],
    ['.controls-section', 'ค้นหาและกรองผู้ใช้', 'ค้นหาชื่อผู้ใช้และเลือกกรองตาม Role'],
    ['.users-table', 'ตารางสมาชิก', 'ตรวจ Role วันที่สร้าง และรายการบัญชี'],
    ['.actions-cell', 'แก้ไขหรือลบ', 'กดแก้ไขเพื่อปรับข้อมูล หรือกดลบเมื่อยืนยันแล้ว'],
  ],
  addUser: [
    ['.adduser-form', 'กรอกข้อมูลบัญชี', 'กรอกชื่อผู้ใช้ ชื่อแสดงผล รหัสผ่าน และข้อมูลที่ระบบกำหนด'],
    ['.role-preview', 'เลือกสิทธิ์', 'ตรวจว่าเลือก User หรือ Admin ถูกต้องก่อนสร้างบัญชี'],
    ['.form-actions .btn-primary', 'สร้างบัญชี', 'กดบันทึกแล้วแจ้งข้อมูลเข้าสู่ระบบให้ผู้ใช้ผ่านช่องทางที่ปลอดภัย'],
  ],
}

function normalizeSteps(rawSteps, fallback) {
  return rawSteps.map((item) => {
    if (typeof item === 'string') return { selectors: [item], title: 'ส่วนนี้ทำงานอย่างไร', text: 'กดหรืออ่านส่วนนี้เพื่อดำเนินการของหน้านี้', side: 'bottom' }
    const selectors = item.length === 4 ? `${item[0]}, ${item[1]}` : item[0]
    const title = item.length === 4 ? item[2] : item[1]
    const text = item.length === 4 ? item[3] : item[2]
    return { selectors: selectors.split(',').map((selector) => selector.trim()), title, text, side: selectors.includes('sidebar') ? 'right' : 'bottom' }
  }).concat(fallback)
}

function getGuideKey() {
  const path = route.path
  if (!path.startsWith('/admin')) {
    if (path === '/cart') return 'cart'
    if (path.startsWith('/order-list')) return 'orders'
    if (path === '/profile') return 'profile'
    if (path.includes('payment')) return 'payment'
    return 'browse'
  }
  if (path === '/admin/home') return 'home'
  if (path.startsWith('/admin/sales') || path === '/admin/orders') return 'sales'
  if (path === '/admin/products') return 'products'
  if (path === '/admin/slips') return 'slips'
  if (path === '/admin/preorder-rounds') return 'rounds'
  if (path === '/admin/preorder-progress') return 'progress'
  if (path === '/admin/preorder-statistics') return 'statistics'
  if (path === '/admin/postpones') return 'postpone'
  if (path === '/admin/inventory-intake') return 'intake'
  if (path === '/admin/missing-items') return 'missing'
  if (path === '/admin/import-fee') return 'importFee'
  if (path === '/admin/shipping') return 'shipping'
  if (path === '/admin/shipping-providers') return 'providers'
  if (path === '/admin/settings') return 'settings'
  if (path === '/admin/qrcodes') return 'qrcodes'
  if (path === '/admin/users/add') return 'addUser'
  if (path === '/admin/users') return 'users'
  return 'home'
}

function selectTarget(step) {
  for (const selector of step.selectors) {
    const element = document.querySelector(selector)
    if (element) {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return element
    }
  }
  return document.querySelector(route.path.startsWith('/admin') ? '.page' : '.user-shell__content')
}

function clearActiveTarget() {
  if (!activeTargetElement || !activeTargetStyles) return
  for (const [property, value] of Object.entries(activeTargetStyles)) {
    activeTargetElement.style[property] = value
  }
  activeTargetElement = null
  activeTargetStyles = null
}

function highlightTarget(element) {
  clearActiveTarget()
  if (!element) return

  activeTargetElement = element
  activeTargetStyles = {
    position: element.style.position,
    zIndex: element.style.zIndex,
    boxShadow: element.style.boxShadow,
    borderRadius: element.style.borderRadius,
  }
  element.style.position = 'relative'
  element.style.zIndex = '6004'
  element.style.boxShadow = '0 0 0 4px #f58aaa, 0 0 0 9px rgba(245, 138, 170, 0.24)'
  element.style.borderRadius = '10px'
}

function placeTour() {
  const step = steps.value[stepIndex.value]
  const element = step && selectTarget(step)
  if (!element) { clearActiveTarget(); targetBox.value = null; return }
  highlightTarget(element)
  const rect = element.getBoundingClientRect()
  targetBox.value = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  const card = cardRef.value
  const cardWidth = card?.offsetWidth || 360
  const cardHeight = card?.offsetHeight || 190
  let top = rect.bottom + 18
  let left = rect.left
  if (rect.left < 300) { top = rect.top + rect.height / 2 - cardHeight / 2; left = rect.right + 18 }
  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12))
  top = Math.max(12, Math.min(top, window.innerHeight - cardHeight - 12))
  position.value = { top, left }
}

async function syncFromRoute() {
  if (!GUIDE_ENABLED) { open.value = false; clearActiveTarget(); return }
  if (!route.query.guide) { open.value = false; return }
  const fallback = [{ selectors: [route.path.startsWith('/admin') ? '.page' : '.user-shell__content'], title: 'พื้นที่ทำงาน', text: 'นี่คือพื้นที่แสดงข้อมูลและปุ่มการทำงานของหน้าที่เปิดอยู่', side: 'bottom' }]
  const raw = route.path.startsWith('/admin') ? adminSteps[getGuideKey()] : userSteps[getGuideKey()]
  steps.value = normalizeSteps(raw || [], fallback)
  stepIndex.value = 0
  open.value = true
  await nextTick()
  placeTour()
}

async function nextStep() {
  if (stepIndex.value >= steps.value.length - 1) { await closeTour(); return }
  stepIndex.value += 1
  await nextTick()
  placeTour()
}
async function previousStep() {
  if (stepIndex.value <= 0) return
  stepIndex.value -= 1
  await nextTick()
  placeTour()
}
async function closeTour() {
  open.value = false
  clearActiveTarget()
  const query = { ...route.query }
  delete query.guide
  await router.replace({ query })
}
function handleResize() { if (open.value) placeTour() }

watch(() => route.fullPath, syncFromRoute, { immediate: true })
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  if (GUIDE_ENABLED && route.query.guide) {
    await nextTick()
    placeTour()
  }
})
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))
</script>

<template>
  <div v-if="open && steps.length" class="guide-overlay" @click.self="closeTour">
    <div class="guide-overlay__demo-label">โหมดสาธิต · ข้อมูลตัวอย่าง ไม่บันทึกจริง</div>
    <div v-if="targetBox" class="guide-overlay__spotlight" :style="{ top: `${targetBox.top - 6}px`, left: `${targetBox.left - 6}px`, width: `${targetBox.width + 12}px`, height: `${targetBox.height + 12}px` }"></div>
    <div ref="cardRef" class="guide-overlay__card" :style="{ top: `${position.top}px`, left: `${position.left}px` }">
      <div class="guide-overlay__arrow" :class="{ 'guide-overlay__arrow--right': targetBox && targetBox.left < 300 }"></div>
      <div class="guide-overlay__head"><span>{{ stepIndex + 1 }}/{{ steps.length }}</span><button type="button" aria-label="ปิด" @click="closeTour">×</button></div>
      <h2>{{ steps[stepIndex].title }}</h2><p>{{ steps[stepIndex].text }}</p>
      <div class="guide-overlay__actions"><button type="button" class="guide-overlay__back" :disabled="stepIndex === 0" @click="previousStep">ย้อนกลับ</button><button type="button" class="guide-overlay__next" @click="nextStep">{{ stepIndex === steps.length - 1 ? 'จบการแนะนำ' : 'ถัดไป →' }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.guide-overlay{position:fixed;inset:0;z-index:6000;background:rgba(26,15,38,.58)}.guide-overlay__demo-label{position:fixed;top:14px;left:50%;z-index:6003;transform:translateX(-50%);padding:5px 12px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.92);color:#7b4e98;font-size:.75rem;font-weight:800;box-shadow:0 5px 16px rgba(20,10,30,.18)}.guide-overlay__spotlight{position:fixed;z-index:6001;border:3px solid #f58aaa;border-radius:14px;box-shadow:0 0 0 9999px rgba(26,15,38,.58),0 0 0 7px rgba(245,138,170,.18);pointer-events:none}.guide-overlay__card{position:fixed;z-index:6002;width:min(360px,calc(100vw - 24px));padding:17px 18px 15px;border:1px solid #ead2f4;border-radius:16px;background:#fff;box-shadow:0 18px 42px rgba(25,12,39,.28)}.guide-overlay__head{display:flex;justify-content:space-between;align-items:center;color:#a06bc1;font-size:.8rem;font-weight:900}.guide-overlay__head button{border:0;background:transparent;color:#8c759e;font-size:1.4rem;line-height:1;cursor:pointer}.guide-overlay__card h2{margin:8px 0 4px;color:#5b367c;font-size:1.08rem}.guide-overlay__card p{margin:0;color:#756582;font-size:.88rem;line-height:1.55}.guide-overlay__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.guide-overlay__back,.guide-overlay__next{border-radius:999px;padding:.5rem .85rem;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}.guide-overlay__back{border:1px solid #e5d7ee;background:#fff;color:#745f86}.guide-overlay__back:disabled{opacity:.45;cursor:not-allowed}.guide-overlay__next{border:0;background:linear-gradient(135deg,#8c56bd,#c47eb4);color:#fff}.guide-overlay__arrow{position:absolute;top:-18px;left:28px;width:0;height:0;border:9px solid transparent;border-bottom-color:#fff}.guide-overlay__arrow--right{top:50%;left:-18px;border-right-color:#fff;border-bottom-color:transparent}
</style>
