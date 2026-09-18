<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const tourOpen = ref(false)
const tourStep = ref(0)
const targetBox = ref(null)
const tourCard = ref(null)
const tourPosition = ref({ top: 0, left: 0 })

const steps = [
  {
    target: '.user-shell__sidebar',
    title: 'เมนูหลักของ User',
    text: 'ใช้เมนูด้านซ้ายเพื่อไปหน้าแรก เลือกสินค้าพร้อมส่ง/พรีออเดอร์ ดูรายการออเดอร์ ตะกร้า และบัญชีของฉัน',
    side: 'right',
  },
  {
    target: '.user-shell__search',
    title: 'ค้นหาสินค้า',
    text: 'พิมพ์ชื่อสินค้าที่ต้องการ ระบบจะกรองรายการสินค้าให้ค้นหาได้เร็วขึ้น',
    side: 'bottom',
  },
  {
    target: '.user-shell__top-action',
    title: 'ตะกร้าสินค้า',
    text: 'กดไอคอนนี้เพื่อดูรายการสินค้า จำนวน และยอดรวมก่อนสั่งซื้อ ตัวเลขสีม่วงคือจำนวนสินค้าในตะกร้า',
    side: 'bottom',
  },
  {
    target: '.user-shell__profile',
    title: 'บัญชีของฉัน',
    text: 'กดไอคอนผู้ใช้เพื่อดูข้อมูลบัญชีและข้อมูลจัดส่งของคุณ',
    side: 'bottom',
  },
  {
    target: '.user-shell__content',
    title: 'พื้นที่ทำงาน',
    text: 'ส่วนนี้จะแสดงสินค้า รายละเอียดออเดอร์ การชำระเงิน และข้อมูลของหน้าที่คุณกำลังเปิดอยู่',
    side: 'bottom',
  },
  {
    target: '.user-shell__logout',
    title: 'ออกจากระบบ',
    text: 'กดเมื่อใช้งานเสร็จ หรือเมื่อใช้เครื่องสาธารณะเพื่อป้องกันผู้อื่นเข้าบัญชีของคุณ',
    side: 'right',
  },
]

function getTargetElement() {
  return document.querySelector(steps[tourStep.value]?.target)
}

function placeTour() {
  const element = getTargetElement()
  if (!element) {
    targetBox.value = null
    return
  }

  const rect = element.getBoundingClientRect()
  targetBox.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }

  const card = tourCard.value
  const gap = 18
  const cardWidth = card?.offsetWidth || 330
  const cardHeight = card?.offsetHeight || 170
  const side = steps[tourStep.value]?.side || 'bottom'
  let top = rect.bottom + gap
  let left = rect.left

  if (side === 'right') {
    top = rect.top + rect.height / 2 - cardHeight / 2
    left = rect.right + gap
  }

  if (side === 'left') {
    top = rect.top + rect.height / 2 - cardHeight / 2
    left = rect.left - cardWidth - gap
  }

  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12))
  top = Math.max(12, Math.min(top, window.innerHeight - cardHeight - 12))
  tourPosition.value = { top, left }
}

async function startTour() {
  tourStep.value = 0
  tourOpen.value = true
  await nextTick()
  placeTour()
}

async function nextStep() {
  if (tourStep.value >= steps.length - 1) {
    tourOpen.value = false
    return
  }
  tourStep.value += 1
  await nextTick()
  placeTour()
}

async function previousStep() {
  if (tourStep.value <= 0) return
  tourStep.value -= 1
  await nextTick()
  placeTour()
}

function closeTour() {
  tourOpen.value = false
}

function handleResize() {
  if (tourOpen.value) placeTour()
}

onMounted(() => window.addEventListener('resize', handleResize))
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))
</script>

<template>
  <section class="user-guide-page">
    <div class="user-guide-page__hero">
      <div>
        <p class="eyebrow">Meowverse · User Guide</p>
        <h1>คู่มือการใช้งานสำหรับ User</h1>
        <p class="lead">ดูวิธีเลือกสินค้า สั่งซื้อ ชำระเงิน และติดตามออเดอร์จากหน้าเว็บจริงได้ในไม่กี่ขั้นตอน</p>
      </div>
      <button class="guide-start" type="button" @click="startTour">▶ เริ่มแนะนำการใช้งาน</button>
    </div>

    <div class="user-guide-page__notice">
      <strong>วิธีใช้หน้านี้</strong>
      <span>กดปุ่มเริ่มแนะนำเพื่อให้ระบบไฮไลต์เมนูจริงทีละจุด หรืออ่านสรุปขั้นตอนด้านล่างได้เลย</span>
    </div>

    <div class="user-guide-page__grid">
      <article class="guide-card guide-card--wide">
        <span class="guide-card__number">01</span>
        <div><h2>เลือกสินค้า</h2><p>ไปที่ <strong>พร้อมส่ง</strong> หากต้องการสินค้าที่มีสต็อก หรือไปที่ <strong>พรีออเดอร์</strong> หากสั่งตามรอบ จากนั้นเลือกสินค้า รสชาติ และจำนวน แล้วกดเพิ่มลงตะกร้า</p></div>
      </article>
      <article class="guide-card">
        <span class="guide-card__number">02</span>
        <h2>ตรวจตะกร้า</h2><p>กดไอคอนรถเข็นด้านบน ตรวจชื่อสินค้า จำนวน ราคา และยอดรวมก่อนไปหน้าชำระเงิน</p>
      </article>
      <article class="guide-card">
        <span class="guide-card__number">03</span>
        <h2>ชำระเงิน</h2><p>ชำระตาม QR/ข้อมูลบัญชีที่แสดง แล้วอัปโหลดสลิปให้เห็นยอดเงินและวันที่ชัดเจน</p>
      </article>
      <article class="guide-card guide-card--wide">
        <span class="guide-card__number">04</span>
        <div><h2>ติดตามออเดอร์</h2><p>ไปที่ <strong>รายการออเดอร์</strong> เพื่อดูสถานะ หากขึ้นรอชำระหรือสลิปไม่ถูกต้อง ให้กดเข้าออเดอร์และทำรายการตามที่ระบบแจ้ง หากพรีออเดอร์มีค่านำเข้า ให้ชำระรอบที่ 2 จากหน้าออเดอร์</p></div>
      </article>
    </div>

    <div class="guide-statuses">
      <div><span class="dot dot--orange"></span><strong>รอชำระ</strong><small>เปิดออเดอร์เพื่อชำระเงิน</small></div>
      <div><span class="dot dot--blue"></span><strong>แนบสลิปแล้ว</strong><small>รอแอดมินตรวจสอบ</small></div>
      <div><span class="dot dot--green"></span><strong>พร้อมจัดส่ง</strong><small>ร้านกำลังเตรียมส่ง</small></div>
      <div><span class="dot dot--red"></span><strong>สลิปไม่ถูกต้อง</strong><small>ตรวจข้อความแล้วแนบใหม่</small></div>
    </div>

    <section class="guide-deep-links">
      <div class="guide-deep-links__head"><div><p class="eyebrow">เจาะเข้าไปข้างใน</p><h2>กดเมนูเพื่อดูปุ่มด้านในแบบมีลูกศรชี้</h2></div><p>เมื่อกดปุ่ม ระบบจะเปิดหน้าจริงของเว็บและเริ่มแนะนำตำแหน่งสำคัญในหน้านั้นให้ทันที</p></div>
      <div class="guide-deep-links__grid">
        <RouterLink class="guide-deep-link" to="/dashboard?guide=1"><strong>หน้าแรก</strong><span>ค้นหา หมวดหมู่ และเปิดรายละเอียดสินค้า →</span></RouterLink>
        <RouterLink class="guide-deep-link" to="/products/ready-to-ship?guide=1"><strong>พร้อมส่ง</strong><span>เลือกสินค้าและเพิ่มลงตะกร้า →</span></RouterLink>
        <RouterLink class="guide-deep-link" to="/products/preorder?guide=1"><strong>พรีออเดอร์</strong><span>ดูสินค้าและรอบพรีออเดอร์ →</span></RouterLink>
        <RouterLink class="guide-deep-link" to="/order-list?guide=1"><strong>รายการออเดอร์</strong><span>กรองสถานะ ดูเลขพัสดุ และยืนยันรับสินค้า →</span></RouterLink>
        <RouterLink class="guide-deep-link" to="/cart?guide=1"><strong>ตะกร้าสินค้า</strong><span>ปรับจำนวน ตรวจยอด และไปชำระเงิน →</span></RouterLink>
        <RouterLink class="guide-deep-link" to="/profile?guide=1"><strong>บัญชีของฉัน</strong><span>แก้ข้อมูลและบันทึกโปรไฟล์ →</span></RouterLink>
      </div>
    </section>

    <div v-if="tourOpen" class="guide-tour" @click.self="closeTour">
      <div
        v-if="targetBox"
        class="guide-tour__spotlight"
        :style="{ top: `${targetBox.top - 6}px`, left: `${targetBox.left - 6}px`, width: `${targetBox.width + 12}px`, height: `${targetBox.height + 12}px` }"
      ></div>
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
.user-guide-page{color:#3f2f5d;padding:6px 0 28px}.user-guide-page__hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 30px;border:1px solid #eadff5;border-radius:24px;background:linear-gradient(135deg,#f7efff,#fff4f7);box-shadow:0 12px 30px rgba(76,48,103,.08)}.eyebrow{margin:0 0 7px;color:#8b56b8;font-size:.77rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.user-guide-page h1{margin:0;font-size:clamp(1.6rem,3vw,2.45rem);line-height:1.2}.lead{margin:10px 0 0;color:#786b87;max-width:680px}.guide-start,.tour-primary{border:0;border-radius:999px;padding:.78rem 1rem;background:linear-gradient(135deg,#8c56bd,#c47eb4);color:#fff;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 8px 18px rgba(140,86,189,.22)}.user-guide-page__notice{display:flex;gap:10px;align-items:center;margin:18px 0;padding:13px 16px;border-left:4px solid #9b61c9;border-radius:10px;background:#faf5ff;color:#776786;font-size:.9rem}.user-guide-page__notice strong{color:#5d397d}.user-guide-page__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.guide-card{position:relative;min-height:154px;padding:22px 22px 18px 68px;border:1px solid #eadff5;border-radius:18px;background:#fff;box-shadow:0 8px 20px rgba(76,48,103,.05)}.guide-card--wide{grid-column:span 2}.guide-card__number{position:absolute;left:20px;top:21px;color:#c48bdc;font-size:1.45rem;font-weight:900}.guide-card h2{margin:0 0 6px;color:#5e3b7c;font-size:1.08rem}.guide-card p{margin:0;color:#766785;font-size:.92rem}.guide-statuses{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}.guide-statuses>div{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;padding:13px;border:1px solid #eadff5;border-radius:13px;background:#fff}.guide-statuses small{grid-column:2;color:#887a95;font-size:.75rem}.dot{width:11px;height:11px;border-radius:50%;grid-row:span 2}.dot--orange{background:#df941f}.dot--blue{background:#427dd8}.dot--green{background:#2ea875}.dot--red{background:#dc5565}.guide-tour{position:fixed;inset:0;z-index:5000;background:rgba(26,15,38,.58);pointer-events:auto}.guide-tour__spotlight{position:fixed;z-index:5001;border:3px solid #f58aaa;border-radius:14px;box-shadow:0 0 0 9999px rgba(26,15,38,.58),0 0 0 7px rgba(245,138,170,.18);pointer-events:none}.guide-tour__card{position:fixed;z-index:5002;width:min(350px,calc(100vw - 24px));padding:17px 18px 15px;border:1px solid #ead2f4;border-radius:16px;background:#fff;box-shadow:0 18px 42px rgba(25,12,39,.28)}.guide-tour__head{display:flex;justify-content:space-between;align-items:center;color:#a06bc1;font-size:.8rem;font-weight:900}.guide-tour__head button{border:0;background:transparent;color:#8c759e;font-size:1.4rem;line-height:1;cursor:pointer}.guide-tour__card h2{margin:8px 0 4px;color:#5b367c;font-size:1.08rem}.guide-tour__card p{margin:0;color:#756582;font-size:.88rem;line-height:1.55}.guide-tour__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.tour-secondary{border:1px solid #e5d7ee;border-radius:999px;padding:.45rem .78rem;background:#fff;color:#745f86;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}.tour-secondary:disabled{opacity:.45;cursor:not-allowed}.tour-primary{padding:.5rem .85rem;font-size:.78rem}.guide-tour__arrow{position:absolute;width:0;height:0;border:9px solid transparent}.guide-tour__arrow--bottom{top:-18px;left:28px;border-bottom-color:#fff}.guide-tour__arrow--right{left:-18px;top:50%;border-right-color:#fff}.guide-tour__arrow--left{right:-18px;top:50%;border-left-color:#fff}
.guide-deep-links{margin-top:18px;padding:20px;border:1px solid #eadff5;border-radius:18px;background:#fff}.guide-deep-links__head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.guide-deep-links__head h2{margin:0;color:#5e3b7c;font-size:1.2rem}.guide-deep-links__head>p{margin:0;max-width:480px;color:#887a95;font-size:.85rem}.guide-deep-links__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.guide-deep-link{display:grid;gap:4px;padding:14px;border:1px solid #eadff5;border-radius:13px;background:#fcf9ff;color:#674582;text-decoration:none;transition:.15s}.guide-deep-link:hover{border-color:#bd91dc;background:#f7efff;transform:translateY(-2px)}.guide-deep-link span{color:#887a95;font-size:.78rem}
@media(max-width:800px){.user-guide-page__hero{align-items:flex-start;flex-direction:column;padding:23px 20px}.guide-start{width:100%}.guide-statuses{grid-template-columns:repeat(2,minmax(0,1fr))}.user-guide-page__notice{align-items:flex-start;flex-direction:column}.guide-card--wide{grid-column:span 1}}
@media(max-width:480px){.user-guide-page__grid{grid-template-columns:1fr}.guide-statuses{grid-template-columns:1fr}.guide-deep-links__head{align-items:flex-start;flex-direction:column}.guide-deep-links__grid{grid-template-columns:1fr}.guide-tour__card{width:calc(100vw - 24px)}}
</style>
