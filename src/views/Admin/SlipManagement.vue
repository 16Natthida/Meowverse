<script setup>
import { ref, onMounted, computed } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const payments = ref([])
const loading = ref(false)
const error = ref('')
const selectedSlip = ref(null)
const filterStatus = ref('all')

// ใช้ Config สีและข้อความเดียวกับ HomeView
const statusConfig = {
  Pending:  { text: 'รอตรวจสอบ',  color: '#f59e0b', bg: '#fffbeb' },
  Approved: { text: 'อนุมัติแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Rejected: { text: 'ปฏิเสธ',      color: '#ef4444', bg: '#fef2f2' },
}

const paymentMethodLabel = {
  bank_transfer:    '🏦 โอนธนาคาร',
  promptpay:        '📱 พร้อมเพย์',
  cash_on_delivery: '💵 เก็บปลายทาง',
}

async function fetchPayments() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/payments`)
    if (!res.ok) throw new Error('โหลดข้อมูลสลิปไม่สำเร็จ')
    payments.value = await res.json()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function updateStatus(payId, status) {
  try {
    const res = await fetch(`${API_BASE}/payments/${payId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ')
    await fetchPayments()
    selectedSlip.value = null
  } catch (err) {
    error.value = err.message
  }
}

function openSlip(pay) { selectedSlip.value = pay }
function closeSlip()   { selectedSlip.value = null }

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function resolveSlipUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

const filteredPayments = computed(() => {
  if (filterStatus.value === 'all') return payments.value
  return payments.value.filter(p => p.status === filterStatus.value)
})

const countByStatus = (s) => payments.value.filter(p => p.status === s).length

onMounted(fetchPayments)
</script>

<template>
  <div class="home-page">
    <!-- Hero Panel สไตล์เดียวกับหน้า Home -->
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Financial Management</p>
        <h2>💳 จัดการสลิปการชำระเงิน</h2>
        <p>ตรวจสอบและอนุมัติหลักฐานการโอนเงินจากลูกค้าเพื่อดำเนินการจัดส่งสินค้าในขั้นตอนถัดไป</p>
      </div>
      <div class="hero-actions">
        <button class="hero-btn hero-btn--primary" @click="fetchPayments">🔄 รีเฟรชข้อมูล</button>
      </div>
    </section>

    <!-- Filter Pills โดยใช้โครงสร้าง KPI Grid -->
    <section class="kpi-grid">
      <article 
        class="kpi-card clickable" 
        :class="{ 'kpi-card--highlight': filterStatus === 'all' }"
        @click="filterStatus = 'all'"
      >
        <p class="kpi-label">รายการทั้งหมด</p>
        <p class="kpi-value">{{ payments.length }} รายการ</p>
      </article>

      <article 
        class="kpi-card clickable" 
        :class="{ 'kpi-card--highlight': filterStatus === 'Pending' }"
        @click="filterStatus = 'Pending'"
      >
        <p class="kpi-label">รอตรวจสอบ</p>
        <p class="kpi-value" style="color: #f59e0b">{{ countByStatus('Pending') }}</p>
      </article>

      <article 
        class="kpi-card clickable" 
        :class="{ 'kpi-card--highlight': filterStatus === 'Approved' }"
        @click="filterStatus = 'Approved'"
      >
        <p class="kpi-label">อนุมัติแล้ว</p>
        <p class="kpi-value" style="color: #10b981">{{ countByStatus('Approved') }}</p>
      </article>

      <article 
        class="kpi-card clickable" 
        :class="{ 'kpi-card--highlight': filterStatus === 'Rejected' }"
        @click="filterStatus = 'Rejected'"
      >
        <p class="kpi-label">ปฏิเสธแล้ว</p>
        <p class="kpi-value" style="color: #ef4444">{{ countByStatus('Rejected') }}</p>
      </article>
    </section>

    <!-- Table Panel สไตล์เดียวกับหน้า Home[cite: 1] -->
    <section class="panel table-panel">
      <header class="panel-head panel-head--stack">
        <h3>รายการหลักฐานการโอนเงิน</h3>
        <p>แสดงรายการตามตัวกรองที่เลือก</p>
      </header>

      <div v-if="error" class="error-banner">{{ error }}</div>
      <p v-if="loading" class="loading-message">กำลังโหลดข้อมูลสลิป...</p>

      <div v-else-if="filteredPayments.length === 0" class="empty-state">
        <p>ไม่พบรายการสลิปชำระเงินในขณะนี้</p>
      </div>

      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>รหัสชำระ</th>
              <th>ออเดอร์</th>
              <th>ประเภท</th>
              <th>ยอดเงิน</th>
              <th>วิธีชำระ</th>
              <th>วันที่</th>
              <th>สถานะ</th>
              <th>หลักฐาน</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pay in filteredPayments" :key="pay.pay_id">
              <td>#{{ pay.pay_id }}</td>
              <td><strong>#{{ pay.order_id }}</strong></td>
              <td>
                <span :class="pay.Order_type === 'Preorder' ? 'status status--pending' : 'status status--paid'">
                  {{ pay.Order_type === 'Preorder' ? 'Preorder' : 'Ready Stock' }}
                </span>
              </td>
              <td style="font-weight: 800; color: #432f61">
                ฿{{ Number(pay.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }}
              </td>
              <td>{{ paymentMethodLabel[pay.payment_method] || pay.payment_method || '-' }}</td>
              <td>{{ formatDate(pay.Slip_date) }}</td>
              <td>
                <span
                  class="status-pill"
                  :style="{
                    color: (statusConfig[pay.status] || {}).color,
                    background: (statusConfig[pay.status] || {}).bg,
                  }"
                >
                  {{ (statusConfig[pay.status] || {}).text || pay.status }}
                </span>
              </td>
              <td>
                <button v-if="pay.slip_img" class="slip-view-btn" @click="openSlip(pay)">
                  ดูสลิป 🖼️
                </button>
                <span v-else class="no-slip">ไม่มีไฟล์</span>
              </td>
              <td>
                <div class="action-btns" v-if="pay.status === 'Pending'">
                  <button class="btn-approve" @click="updateStatus(pay.pay_id, 'Approved')">✓ อนุมัติ</button>
                  <button class="btn-reject" @click="updateStatus(pay.pay_id, 'Rejected')">✕ ปฏิเสธ</button>
                </div>
                <span v-else class="done-text">ดำเนินการแล้ว</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Modal ดูรูปสลิป[cite: 1] -->
    <transition name="fade">
      <div v-if="selectedSlip" class="slip-modal-overlay" @click.self="closeSlip">
        <div class="slip-modal">
          <div class="slip-modal-head">
            <h3>สลิปออเดอร์ #{{ selectedSlip.order_id }}</h3>
            <button class="close-btn" @click="closeSlip">✕</button>
          </div>
          <div class="slip-modal-body">
            <img :src="resolveSlipUrl(selectedSlip.slip_img)" class="slip-img-full" alt="slip" />
          </div>
          <div class="slip-modal-foot" v-if="selectedSlip.status === 'Pending'">
            <button class="btn-approve" @click="updateStatus(selectedSlip.pay_id, 'Approved')">✓ อนุมัติสลิป</button>
            <button class="btn-reject" @click="updateStatus(selectedSlip.pay_id, 'Rejected')">✕ ปฏิเสธ</button>
          </div>
          <div class="slip-modal-foot" v-else>
             <span class="status-pill" :style="{ color: statusConfig[selectedSlip.status].color, background: statusConfig[selectedSlip.status].bg }">
                {{ statusConfig[selectedSlip.status].text }}
             </span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ดึง Style มาจาก HomeView เพื่อให้เข้าชุดกัน[cite: 1] */
.home-page {
  --panel-bg: rgba(255, 255, 255, 0.88);
  --panel-border: #e8dcf3;
  --text-main: #432f61;
  --text-muted: #7a6a96;
  --pink: #ff93b8;
  --grape: #a66de6;
  display: grid;
  gap: 1rem;
}

.hero-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1.2rem;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: radial-gradient(circle at right top, rgba(255, 147, 184, 0.32), transparent 52%), var(--panel-bg);
}

.hero-copy h2 { color: var(--text-main); font-weight: 900; font-size: 1.7rem; }
.hero-copy p { color: var(--text-muted); }

.hero-btn { border-radius: 999px; padding: 0.46rem 1.2rem; font-weight: 700; cursor: pointer; border: none; }
.hero-btn--primary { color: #fff; background: linear-gradient(135deg, #b673ee, #ff93b8); }

.kpi-grid { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.kpi-card { border-radius: 15px; border: 1px solid var(--panel-border); background: var(--panel-bg); padding: 0.9rem; transition: 0.2s; cursor: pointer; }
.kpi-card--highlight { background: #f7efff; border-color: #dbc8f4; transform: translateY(-2px); }
.kpi-label { font-size: 0.76rem; color: #8d7aad; font-weight: 700; }
.kpi-value { font-size: 1.5rem; color: var(--text-main); font-weight: 900; }

.panel { border-radius: 16px; border: 1px solid var(--panel-border); background: var(--panel-bg); padding: 0.95rem; }
.panel-head h3 { color: var(--text-main); font-weight: 850; }

table { width: 100%; border-collapse: collapse; min-width: 800px; }
th, td { padding: 0.7rem; border-bottom: 1px solid #eee7f7; font-size: 0.8rem; }
th { color: #826ea1; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.72rem; }

.status { border-radius: 999px; padding: 0.2rem 0.6rem; font-weight: 700; font-size: 0.7rem; }
.status--pending { background: #ffe7d5; color: #b55a1f; }
.status--paid { background: #ddf7ee; color: #277a62; }

.status-pill { border-radius: 999px; padding: 3px 12px; font-weight: 800; font-size: 0.75rem; }
.slip-view-btn { background: #f8f2ff; border: 1px solid #dbc8f4; color: #6f50a0; border-radius: 8px; padding: 4px 12px; font-weight: 700; cursor: pointer; }
.btn-approve { background: #ecfdf5; color: #059669; border: 1px solid #6ee7b7; border-radius: 8px; padding: 5px 12px; cursor: pointer; font-weight: 700; }
.btn-reject { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 8px; padding: 5px 12px; cursor: pointer; font-weight: 700; }

.slip-modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.slip-modal { background: #fff; border-radius: 20px; width: 480px; overflow: hidden; }
.slip-modal-head { display: flex; justify-content: space-between; padding: 1rem; border-bottom: 1px solid #eee; }
.slip-img-full { width: 100%; max-height: 450px; object-fit: contain; padding: 1rem; }
.slip-modal-foot { padding: 1rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>