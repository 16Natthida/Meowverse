<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const tourOpen = ref(false)
const tourStep = ref(0)
const targetBox = ref(null)
const tourCard = ref(null)
const tourPosition = ref({ top: 0, left: 0 })

const steps = [
  { target: '.sidebar', title: 'เมนู Admin', text: 'เมนูด้านซ้ายรวมงานจัดการร้านทั้งหมด ตั้งแต่ Dashboard สินค้า ยอดขาย พรีออเดอร์ สต็อก ขนส่ง และการตั้งค่า', side: 'right' },
  { target: '.menu-group__trigger', title: 'รายการยอดขาย', text: 'กดเมนูนี้เพื่อเปิดเมนูย่อย แล้วเลือกดูยอดขายทั้งหมด สินค้าพร้อมส่ง หรือสินค้าพรีออเดอร์', side: 'right' },
  { target: '.top-search', title: 'ค้นหาจากแถบด้านบน', text: 'ใช้ช่องค้นหาเพื่อช่วยค้นหารายการตามหน้าที่ระบบรองรับ', side: 'bottom' },
  { target: '.notify', title: 'กลับหน้าเว็บไซต์หลัก', text: 'ปุ่มนี้พาไปยังหน้าเว็บฝั่ง User เพื่อดูมุมมองหน้าร้าน', side: 'bottom' },
  { target: '.profile-chip', title: 'โปรไฟล์ Admin', text: 'กดเพื่อแก้ชื่อ ตำแหน่ง และรูปโปรไฟล์ของผู้ดูแลระบบ', side: 'bottom' },
  { target: '.page', title: 'พื้นที่ทำงานของ Admin', text: 'ข้อมูล ตาราง ฟอร์ม และปุ่มดำเนินการของเมนูที่เลือกจะแสดงในพื้นที่นี้', side: 'bottom' },
  { target: '.sidebar-footer__logout', title: 'ออกจากระบบ', text: 'กดเมื่อทำงานเสร็จ โดยเฉพาะกรณีใช้เครื่องร่วมกับผู้อื่น', side: 'right' },
]

function getTargetElement() { return document.querySelector(steps[tourStep.value]?.target) }
function placeTour() {
  const element = getTargetElement()
  if (!element) { targetBox.value = null; return }
  const rect = element.getBoundingClientRect()
  targetBox.value = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  const card = tourCard.value
  const gap = 18
  const cardWidth = card?.offsetWidth || 350
  const cardHeight = card?.offsetHeight || 180
  const side = steps[tourStep.value]?.side || 'bottom'
  let top = rect.bottom + gap
  let left = rect.left
  if (side === 'right') { top = rect.top + rect.height / 2 - cardHeight / 2; left = rect.right + gap }
  if (side === 'left') { top = rect.top + rect.height / 2 - cardHeight / 2; left = rect.left - cardWidth - gap }
  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12))
  top = Math.max(12, Math.min(top, window.innerHeight - cardHeight - 12))
  tourPosition.value = { top, left }
}
async function startTour() { tourStep.value = 0; tourOpen.value = true; await nextTick(); placeTour() }
async function nextStep() { if (tourStep.value >= steps.length - 1) { tourOpen.value = false; return }; tourStep.value += 1; await nextTick(); placeTour() }
async function previousStep() { if (tourStep.value <= 0) return; tourStep.value -= 1; await nextTick(); placeTour() }
function closeTour() { tourOpen.value = false }
function handleResize() { if (tourOpen.value) placeTour() }
onMounted(() => window.addEventListener('resize', handleResize))
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))
</script>

<template>
  <section class="admin-guide-page">
    <div class="admin-guide-page__hero">
      <div><p class="eyebrow">Meowverse · Admin Guide</p><h1>คู่มือการใช้งานสำหรับ Admin</h1><p class="lead">ทัวร์สั้น ๆ สำหรับจัดการสินค้า ออเดอร์ สลิป พรีออเดอร์ สต็อก ค่านำเข้า และการจัดส่ง</p></div>
      <button class="guide-start" type="button" @click="startTour">▶ เริ่มแนะนำการใช้งาน</button>
    </div>
    <div class="admin-guide-page__notice"><strong>แนะนำลำดับงาน:</strong><span>ตรวจ Dashboard → ตรวจยอดขาย/สลิป → อัปเดตสต็อก/รับสินค้า → กรอกค่านำเข้า → จัดส่งและอัปเดตสถานะ</span></div>
    <div class="admin-guide-page__grid">
      <article class="guide-card guide-card--wide"><span class="guide-card__number">01</span><div><h2>รายการยอดขาย</h2><p>เลือกดูทั้งหมด / พร้อมส่ง / พรีออเดอร์ ใช้ตัวกรองและเปิดรายละเอียดออเดอร์เพื่อตรวจรายการสินค้า ยอดเงิน และสถานะ</p></div></article>
      <article class="guide-card"><span class="guide-card__number">02</span><h2>จัดการสลิป</h2><p>เปิดดูสลิป ตรวจยอดเงินและออเดอร์ แล้วกดอนุมัติหรือปฏิเสธตามหลักฐาน</p></article>
      <article class="guide-card"><span class="guide-card__number">03</span><h2>สินค้าและสต็อก</h2><p>เพิ่ม/แก้ไขชื่อ SKU หมวดหมู่ ราคา รสชาติ รูปภาพ และจำนวนสต็อก</p></article>
      <article class="guide-card guide-card--wide"><span class="guide-card__number">04</span><div><h2>พรีออเดอร์และค่านำเข้า</h2><p>จัดการรอบพรีออเดอร์ ติดตามความคืบหน้า รับสินค้าเข้า กรอกค่านำเข้า และรอตรวจสลิปชำระรอบที่ 2</p></div></article>
      <article class="guide-card"><span class="guide-card__number">05</span><h2>การจัดส่ง</h2><p>จัดการรายการจัดส่ง บริษัทขนส่ง และข้อมูลติดตามพัสดุ</p></article>
      <article class="guide-card"><span class="guide-card__number">06</span><h2>ตั้งค่าและผู้ใช้</h2><p>ตั้งค่า QR Payment ระบบ ร้านค้า และเพิ่มบัญชี User ตามสิทธิ์</p></article>
    </div>
    <div class="admin-guide-page__workflow"><h2>ลำดับงานพรีออเดอร์</h2><div class="workflow"><span>เปิดรอบ</span><b>→</b><span>รับออเดอร์/ตรวจสลิป</span><b>→</b><span>รับสินค้าเข้า</span><b>→</b><span>กรอกค่านำเข้า</span><b>→</b><span>User ชำระรอบ 2</span><b>→</b><span>จัดส่ง</span></div></div>
    <section class="admin-deep-links"><div class="admin-deep-links__head"><div><p class="eyebrow">เจาะเข้าไปข้างใน</p><h2>กดเมนูเพื่อเปิดหน้าจริงและดูปุ่มด้านใน</h2></div><p>แต่ละปุ่มจะพาไปยังหน้านั้นจริง แล้วเปิดลูกศรชี้ตาราง ฟอร์ม ตัวกรอง และปุ่มสำคัญให้ทีละขั้น</p></div><div class="admin-deep-links__grid">
      <RouterLink class="admin-deep-link" to="/admin/home?guide=1"><strong>แดชบอร์ด</strong><span>KPI กราฟ และสลิปที่ต้องตรวจ →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/sales?guide=1"><strong>รายการยอดขาย</strong><span>สลับประเภท กรอง และเปิดออเดอร์ →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/products?guide=1"><strong>สินค้า</strong><span>เพิ่มสินค้า หมวดหมู่ SKU และสต็อก →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/slips?guide=1"><strong>จัดการสลิป</strong><span>ดูหลักฐาน อนุมัติ หรือปฏิเสธ →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/preorder-rounds?guide=1"><strong>จัดการรอบพรีออเดอร์</strong><span>สร้างรอบและผูกสินค้า →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/preorder-progress?guide=1"><strong>สรุปยอดพรีออเดอร์</strong><span>ดูขั้นต่ำและความคืบหน้า →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/inventory-intake?guide=1"><strong>รับสินค้าเข้า</strong><span>กรอกจำนวนรับจริงและยืนยัน →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/import-fee?guide=1"><strong>กรอกค่านำเข้า</strong><span>เลือกกรอบ กรอกค่า และบันทึก →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/shipping?guide=1"><strong>รายการจัดส่ง</strong><span>กรอง ตรวจที่อยู่ และเลขพัสดุ →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/users?guide=1"><strong>เพิ่ม User</strong><span>ค้นหา แก้ไข หรือลบบัญชี →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/settings?guide=1"><strong>ตั้งค่าระบบ</strong><span>เลือกหมวดและบันทึกค่าระบบ →</span></RouterLink>
      <RouterLink class="admin-deep-link" to="/admin/qrcodes?guide=1"><strong>ตั้งค่า QR Payment</strong><span>อัปโหลดและเปิด/ปิด QR →</span></RouterLink>
    </div></section>
    <div v-if="tourOpen" class="guide-tour" @click.self="closeTour">
      <div v-if="targetBox" class="guide-tour__spotlight" :style="{ top: `${targetBox.top - 6}px`, left: `${targetBox.left - 6}px`, width: `${targetBox.width + 12}px`, height: `${targetBox.height + 12}px` }"></div>
      <div ref="tourCard" class="guide-tour__card" :style="{ top: `${tourPosition.top}px`, left: `${tourPosition.left}px` }">
        <div class="guide-tour__arrow" :class="`guide-tour__arrow--${steps[tourStep].side}`"></div>
        <div class="guide-tour__head"><span>{{ tourStep + 1 }}/{{ steps.length }}</span><button type="button" aria-label="ปิด" @click="closeTour">×</button></div>
        <h2>{{ steps[tourStep].title }}</h2><p>{{ steps[tourStep].text }}</p>
        <div class="guide-tour__actions"><button type="button" class="tour-secondary" :disabled="tourStep === 0" @click="previousStep">ย้อนกลับ</button><button type="button" class="tour-primary" @click="nextStep">{{ tourStep === steps.length - 1 ? 'จบการแนะนำ' : 'ถัดไป →' }}</button></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-guide-page{color:#403153;padding:6px 0 28px}.admin-guide-page__hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 30px;border:1px solid #eadff5;border-radius:24px;background:linear-gradient(135deg,#f7efff,#fff4f7);box-shadow:0 12px 30px rgba(76,48,103,.08)}.eyebrow{margin:0 0 7px;color:#8b56b8;font-size:.77rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.admin-guide-page h1{margin:0;font-size:clamp(1.6rem,3vw,2.45rem);line-height:1.2}.lead{margin:10px 0 0;color:#786b87;max-width:700px}.guide-start,.tour-primary{border:0;border-radius:999px;padding:.78rem 1rem;background:linear-gradient(135deg,#8c56bd,#c47eb4);color:#fff;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 8px 18px rgba(140,86,189,.22)}.admin-guide-page__notice{display:flex;gap:10px;align-items:center;margin:18px 0;padding:13px 16px;border-left:4px solid #9b61c9;border-radius:10px;background:#faf5ff;color:#776786;font-size:.9rem}.admin-guide-page__notice strong{color:#5d397d}.admin-guide-page__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.guide-card{position:relative;min-height:140px;padding:22px 22px 18px 68px;border:1px solid #eadff5;border-radius:18px;background:#fff;box-shadow:0 8px 20px rgba(76,48,103,.05)}.guide-card--wide{grid-column:span 2}.guide-card__number{position:absolute;left:20px;top:21px;color:#c48bdc;font-size:1.45rem;font-weight:900}.guide-card h2,.admin-guide-page__workflow h2{margin:0 0 6px;color:#5e3b7c;font-size:1.08rem}.guide-card p{margin:0;color:#766785;font-size:.92rem}.admin-guide-page__workflow{margin-top:16px;padding:20px;border:1px solid #eadff5;border-radius:18px;background:#fff}.workflow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.workflow span{padding:8px 11px;border-radius:10px;background:#f8f1ff;color:#69458a;font-size:.84rem;font-weight:800}.workflow b{color:#d05277;font-size:1.2rem}.guide-tour{position:fixed;inset:0;z-index:5000;background:rgba(26,15,38,.58);pointer-events:auto}.guide-tour__spotlight{position:fixed;z-index:5001;border:3px solid #f58aaa;border-radius:14px;box-shadow:0 0 0 9999px rgba(26,15,38,.58),0 0 0 7px rgba(245,138,170,.18);pointer-events:none}.guide-tour__card{position:fixed;z-index:5002;width:min(360px,calc(100vw - 24px));padding:17px 18px 15px;border:1px solid #ead2f4;border-radius:16px;background:#fff;box-shadow:0 18px 42px rgba(25,12,39,.28)}.guide-tour__head{display:flex;justify-content:space-between;align-items:center;color:#a06bc1;font-size:.8rem;font-weight:900}.guide-tour__head button{border:0;background:transparent;color:#8c759e;font-size:1.4rem;line-height:1;cursor:pointer}.guide-tour__card h2{margin:8px 0 4px;color:#5b367c;font-size:1.08rem}.guide-tour__card p{margin:0;color:#756582;font-size:.88rem;line-height:1.55}.guide-tour__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.tour-secondary{border:1px solid #e5d7ee;border-radius:999px;padding:.45rem .78rem;background:#fff;color:#745f86;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}.tour-secondary:disabled{opacity:.45;cursor:not-allowed}.tour-primary{padding:.5rem .85rem;font-size:.78rem}.guide-tour__arrow{position:absolute;width:0;height:0;border:9px solid transparent}.guide-tour__arrow--bottom{top:-18px;left:28px;border-bottom-color:#fff}.guide-tour__arrow--right{left:-18px;top:50%;border-right-color:#fff}.guide-tour__arrow--left{right:-18px;top:50%;border-left-color:#fff}
.admin-deep-links{margin-top:16px;padding:20px;border:1px solid #eadff5;border-radius:18px;background:#fff}.admin-deep-links__head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.admin-deep-links__head h2{margin:0;color:#5e3b7c;font-size:1.2rem}.admin-deep-links__head>p{margin:0;max-width:480px;color:#887a95;font-size:.85rem}.admin-deep-links__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.admin-deep-link{display:grid;gap:4px;padding:14px;border:1px solid #eadff5;border-radius:13px;background:#fcf9ff;color:#674582;text-decoration:none;transition:.15s}.admin-deep-link:hover{border-color:#bd91dc;background:#f7efff;transform:translateY(-2px)}.admin-deep-link span{color:#887a95;font-size:.78rem}
@media(max-width:800px){.admin-guide-page__hero{align-items:flex-start;flex-direction:column;padding:23px 20px}.guide-start{width:100%}.admin-guide-page__notice{align-items:flex-start;flex-direction:column}.guide-card--wide{grid-column:span 1}}
@media(max-width:520px){.admin-guide-page__grid{grid-template-columns:1fr}.admin-deep-links__head{align-items:flex-start;flex-direction:column}.admin-deep-links__grid{grid-template-columns:1fr}.guide-tour__card{width:calc(100vw - 24px)}}
</style>
