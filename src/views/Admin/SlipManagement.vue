<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'
const { getUser } = useAuth()

const currentUser = computed(() => getUser())

const payments = ref([])
const slipLoading = ref(false)
const slipError = ref('')
const selectedSlip = ref(null)
const selectedOrderDetail = ref(null)
const selectedOrderLoading = ref(false)
const selectedOrderError = ref('')
const importFeeInput = ref('')
const filterStatus = ref('all')

const filteredPayments = computed(() => {
  if (filterStatus.value === 'all') return payments.value
  return payments.value.filter((payment) => payment.status === filterStatus.value)
})

const statusConfig = {
  Pending: { text: 'รอตรวจสอบ', color: '#f59e0b', bg: '#fffbeb' },
  Approved: { text: 'อนุมัติแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Rejected: { text: 'ปฏิเสธ', color: '#ef4444', bg: '#fef2f2' },
}

const paymentMethodLabel = {
  bank_transfer: '🏦 โอนธนาคาร',
  promptpay: '📱 พร้อมเพย์',
  cash_on_delivery: '💵 เก็บปลายทาง',
}

function authHeaders() {
  const user = currentUser.value || {}
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function resolveIntakeStatusClass(status) {
  const key = String(status || '').toLowerCase()
  if (key.includes('ready')) return 'badge badge--ready'
  if (key.includes('partial')) return 'badge badge--partial'
  if (key.includes('missing')) return 'badge badge--missing'
  return 'badge badge--pending'
}

function resolveIntakeStatusLabel(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'ready_to_ship') return 'พร้อมจัดส่ง'
  if (key === 'partially_received') return 'รับไม่ครบ'
  if (key === 'missing') return 'ขาดสินค้า'
  if (key === 'received') return 'รับครบ'
  if (key === 'partial') return 'รับบางส่วน'
  return status || 'Pending'
}

function resolveSlipUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

async function fetchPayments() {
  slipLoading.value = true
  slipError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/payments`)
    if (!response.ok) {
      throw new Error('โหลดข้อมูลสลิปไม่สำเร็จ')
    }
    payments.value = await response.json()
  } catch (error) {
    slipError.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    slipLoading.value = false
  }
}

async function updatePaymentStatus(payId, status) {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/${payId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      throw new Error('อัปเดตสถานะไม่สำเร็จ')
    }

    await fetchPayments()
    selectedSlip.value = null
    selectedOrderDetail.value = null
    importFeeInput.value = ''
  } catch (error) {
    slipError.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  }
}

async function fetchOrderDetails(orderId) {
  selectedOrderLoading.value = true
  selectedOrderError.value = ''
  selectedOrderDetail.value = null

  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`)
    if (!response.ok) {
      throw new Error(`ไม่สามารถโหลดข้อมูลออเดอร์ได้ (${response.status})`)
    }
    selectedOrderDetail.value = await response.json()
    importFeeInput.value = selectedOrderDetail.value.import_fee_total || ''
  } catch (error) {
    selectedOrderError.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    selectedOrderLoading.value = false
  }
}

async function openSlip(payment) {
  selectedSlip.value = payment
  selectedOrderDetail.value = null
  importFeeInput.value = ''
  selectedOrderError.value = ''

  if (payment.Order_type === 'Preorder') {
    await fetchOrderDetails(payment.order_id)
  }
}

function closeSlip() {
  selectedSlip.value = null
  selectedOrderDetail.value = null
  selectedOrderError.value = ''
  importFeeInput.value = ''
}

async function saveImportFee() {
  if (!selectedSlip.value) return

  const fee = Number(importFeeInput.value)
  if (Number.isNaN(fee) || fee < 0) {
    selectedOrderError.value = 'กรุณากรอกค่านำเข้าที่เป็นตัวเลข 0 ขึ้นไป'
    return
  }

  try {
    selectedOrderError.value = ''
    const response = await fetch(
      `${API_BASE_URL}/orders/${selectedSlip.value.order_id}/import-fee`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ import_fee: fee }),
      },
    )

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error || 'ไม่สามารถบันทึกค่านำเข้าได้')
    }

    await fetchPayments()
    await fetchOrderDetails(selectedSlip.value.order_id)
  } catch (error) {
    selectedOrderError.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  }
}

const countByStatus = (status) =>
  payments.value.filter((payment) => payment.status === status).length

onMounted(() => {
  fetchPayments()
})
</script>

<template>
  <div class="admin-support-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin Operations</p>
        <h1>จัดการสลิปการชำระเงิน</h1>
        <p>ตรวจสอบ อนุมัติ และบันทึกค่านำเข้าสำหรับออเดอร์พรีออเดอร์ โดยดูหลักฐานการโอนเงิน</p>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card">
        <p class="kpi-label">สลิปรอตรวจสอบ</p>
        <p class="kpi-value">{{ countByStatus('Pending') }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">อนุมัติแล้ว</p>
        <p class="kpi-value">{{ countByStatus('Approved') }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">ปฏิเสธแล้ว</p>
        <p class="kpi-value">{{ countByStatus('Rejected') }}</p>
      </article>
    </section>

    <section class="panel">
      <header class="panel-head panel-head--stacked">
        <div>
          <h2>จัดการสลิปการชำระเงิน</h2>
          <p>ตรวจสอบ อนุมัติ และบันทึกค่านำเข้าสำหรับออเดอร์พรีออเดอร์</p>
        </div>
        <button class="ghost-btn" type="button" @click="fetchPayments">รีเฟรช</button>
      </header>

      <div class="filter-row">
        <button
          class="filter-btn"
          :class="{ active: filterStatus === 'all' }"
          @click="filterStatus = 'all'"
        >
          ทั้งหมด
        </button>
        <button
          class="filter-btn"
          :class="{ active: filterStatus === 'Pending' }"
          @click="filterStatus = 'Pending'"
        >
          รอตรวจสอบ
        </button>
        <button
          class="filter-btn"
          :class="{ active: filterStatus === 'Approved' }"
          @click="filterStatus = 'Approved'"
        >
          อนุมัติแล้ว
        </button>
        <button
          class="filter-btn"
          :class="{ active: filterStatus === 'Rejected' }"
          @click="filterStatus = 'Rejected'"
        >
          ปฏิเสธแล้ว
        </button>
      </div>

      <div v-if="slipError" class="state-box state-box--error">{{ slipError }}</div>
      <p v-if="slipLoading" class="loading-message">กำลังโหลดข้อมูลสลิป...</p>

      <div v-else-if="filteredPayments.length === 0" class="empty-box">
        ไม่พบรายการสลิปชำระเงินในขณะนี้
      </div>

      <div v-else class="table-scroll">
        <table class="slip-table">
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
            <tr v-for="payment in filteredPayments" :key="payment.pay_id">
              <td>#{{ payment.pay_id }}</td>
              <td>
                <strong>#{{ payment.order_id }}</strong>
              </td>
              <td>
                <span
                  :class="
                    payment.Order_type === 'Preorder'
                      ? 'status status--pending'
                      : 'status status--paid'
                  "
                >
                  {{ payment.Order_type === 'Preorder' ? 'Preorder' : 'Ready Stock' }}
                </span>
              </td>
              <td>
                ฿{{ Number(payment.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }}
              </td>
              <td>
                {{ paymentMethodLabel[payment.payment_method] || payment.payment_method || '-' }}
              </td>
              <td>{{ formatDate(payment.Slip_date) }}</td>
              <td>
                <span
                  class="status-pill"
                  :style="{
                    color: (statusConfig[payment.status] || {}).color,
                    background: (statusConfig[payment.status] || {}).bg,
                  }"
                >
                  {{ (statusConfig[payment.status] || {}).text || payment.status }}
                </span>
              </td>
              <td>
                <button v-if="payment.slip_img" class="slip-view-btn" @click="openSlip(payment)">
                  ดูสลิป 🖼️
                </button>
                <span v-else class="no-slip">ไม่มีไฟล์</span>
              </td>
              <td>
                <div v-if="payment.status === 'Pending'" class="action-btns">
                  <button
                    class="btn-approve"
                    @click="updatePaymentStatus(payment.pay_id, 'Approved')"
                  >
                    ✓ อนุมัติ
                  </button>
                  <button
                    class="btn-reject"
                    @click="updatePaymentStatus(payment.pay_id, 'Rejected')"
                  >
                    ✕ ปฏิเสธ
                  </button>
                </div>
                <span v-else class="done-text">ดำเนินการแล้ว</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <transition name="fade">
      <div v-if="selectedSlip" class="slip-modal-overlay" @click.self="closeSlip">
        <div class="slip-modal">
          <div class="slip-modal-head">
            <h3>สลิปออเดอร์ #{{ selectedSlip.order_id }}</h3>
            <button class="close-btn" type="button" @click="closeSlip">✕</button>
          </div>

          <div class="slip-modal-body">
            <img :src="resolveSlipUrl(selectedSlip.slip_img)" class="slip-img-full" alt="slip" />

            <div v-if="selectedSlip.Order_type === 'Preorder'" class="import-fee-panel">
              <h4>ค่านำเข้า</h4>
              <p class="import-fee-note">
                สำหรับพรีออเดอร์ แอดมินสามารถบันทึกค่านำเข้าเพื่อแจ้งลูกค้าต่อได้
              </p>

              <div v-if="selectedOrderLoading" class="state-wrap">
                <p>กำลังโหลดข้อมูลออเดอร์...</p>
              </div>

              <div v-else>
                <div v-if="selectedOrderError" class="error-box">{{ selectedOrderError }}</div>
                <div v-else-if="selectedOrderDetail">
                  <div class="import-fee-summary">
                    <p>ยอดรวมสินค้า: {{ formatMoney(selectedOrderDetail.total_amount) }}</p>
                    <p>
                      ค่านำเข้าปัจจุบัน:
                      {{ formatMoney(selectedOrderDetail.import_fee_total || 0) }}
                    </p>
                  </div>

                  <div class="form-group">
                    <label for="import-fee-input">ใส่ค่านำเข้า</label>
                    <input
                      id="import-fee-input"
                      v-model="importFeeInput"
                      class="form-input"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedSlip.status === 'Pending'" class="slip-modal-foot">
            <button
              class="btn-approve"
              type="button"
              @click="updatePaymentStatus(selectedSlip.pay_id, 'Approved')"
            >
              ✓ อนุมัติสลิป
            </button>
            <button
              class="btn-reject"
              type="button"
              @click="updatePaymentStatus(selectedSlip.pay_id, 'Rejected')"
            >
              ✕ ปฏิเสธ
            </button>
            <button
              v-if="selectedSlip.Order_type === 'Preorder'"
              class="btn-approve"
              type="button"
              @click="saveImportFee"
            >
              💰 บันทึกค่านำเข้า
            </button>
          </div>
          <div v-else class="slip-modal-foot">
            <span
              class="status-pill"
              :style="{
                color: (statusConfig[selectedSlip.status] || {}).color,
                background: (statusConfig[selectedSlip.status] || {}).bg,
              }"
            >
              {{ (statusConfig[selectedSlip.status] || {}).text || selectedSlip.status }}
            </span>
            <button
              v-if="selectedSlip.Order_type === 'Preorder'"
              class="btn-approve"
              type="button"
              @click="saveImportFee"
            >
              💰 บันทึกค่านำเข้า
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.admin-support-page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(255, 183, 214, 0.25), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 145, 255, 0.18), transparent 26%), #faf7ff;
  color: #2c2440;
  display: grid;
  gap: 1rem;
}

.hero-panel,
.panel,
.kpi-card,
.state-box,
.empty-box,
.slip-modal {
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.hero-panel {
  padding: 1.1rem 1.2rem;
  border-radius: 18px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background:
    radial-gradient(circle at right top, rgba(255, 147, 184, 0.32), transparent 52%),
    rgba(255, 255, 255, 0.88);
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  color: #a45bd6;
  font-weight: 700;
}

.hero-copy h1,
.panel-head h2,
.panel-head h3 {
  color: #432f61;
  font-weight: 900;
}

.hero-copy h1 {
  font-size: clamp(1.4rem, 2vw, 1.9rem);
}

.hero-copy p {
  margin-top: 0.45rem;
  color: #6b5a84;
  line-height: 1.6;
}

.kpi-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.kpi-card {
  border-radius: 15px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.88);
  padding: 0.9rem;
}

.kpi-label {
  font-size: 0.76rem;
  color: #8d7aad;
  font-weight: 700;
}

.kpi-value {
  font-size: 1.5rem;
  color: #432f61;
  font-weight: 900;
  margin-top: 0.15rem;
}

.panel {
  border-radius: 16px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.92);
  padding: 0.95rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: center;
  margin-bottom: 0.8rem;
}

.panel-head--stacked {
  flex-direction: column;
  align-items: start;
}

.panel-head p {
  color: #8d7cad;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.ghost-btn,
.primary-btn,
.filter-btn,
.btn-approve,
.btn-reject,
.slip-view-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
}

.ghost-btn {
  background: #f3ecff;
  color: #7d4db2;
  padding: 0.8rem 1.1rem;
}

.primary-btn {
  background: linear-gradient(135deg, #a55eea, #ff7eb6);
  color: #fff;
  padding: 0.8rem 1.1rem;
}

.intake-grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1rem;
}

.order-list {
  display: grid;
  gap: 0.8rem;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.filter-btn {
  background: #f3ecff;
  color: #7d4db2;
  padding: 0.55rem 0.85rem;
}

.filter-btn.active {
  background: linear-gradient(135deg, #a55eea, #ff7eb6);
  color: #fff;
}

.table-scroll {
  overflow-x: auto;
}

.slip-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}

.slip-table th,
.slip-table td {
  padding: 0.7rem;
  border-bottom: 1px solid #eee7f7;
  font-size: 0.8rem;
  text-align: left;
}

.slip-table th {
  color: #826ea1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.72rem;
}

.status,
.status-pill,
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
}

.status {
  padding: 0.2rem 0.6rem;
  font-size: 0.7rem;
}

.status--pending {
  background: #ffe7d5;
  color: #b55a1f;
}

.status--paid {
  background: #ddf7ee;
  color: #277a62;
}

.status-pill {
  padding: 3px 12px;
  font-size: 0.75rem;
}

.badge {
  padding: 0.34rem 0.72rem;
  font-size: 0.76rem;
}

.badge--pending {
  background: #fff4d9;
  color: #b76b00;
}

.badge--ready {
  background: #e2f8eb;
  color: #16794c;
}

.badge--partial {
  background: #eef2ff;
  color: #5753c9;
}

.badge--missing {
  background: #fde2e1;
  color: #b42318;
}

.slip-view-btn {
  background: #f8f2ff;
  border: 1px solid #dbc8f4;
  color: #6f50a0;
  padding: 0.4rem 0.8rem;
}

.btn-approve {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #6ee7b7;
  padding: 0.45rem 0.8rem;
}

.btn-reject {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  padding: 0.45rem 0.8rem;
}

.done-text,
.no-slip {
  color: #8f7ca8;
  font-size: 0.78rem;
}

.action-btns {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.slip-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.slip-modal {
  background: #fff;
  border-radius: 20px;
  width: min(720px, 100%);
  overflow: hidden;
}

.slip-modal-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.slip-modal-body {
  padding: 1rem;
}

.slip-img-full {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  background: #faf8ff;
  border-radius: 14px;
}

.slip-modal-foot {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  gap: 0.6rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.import-fee-panel {
  margin-top: 1rem;
  padding: 1rem;
  border-top: 1px solid #f3e8ff;
  background: #faf5ff;
  border-radius: 12px;
}

.import-fee-panel h4 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #5b21b6;
}

.import-fee-note,
.import-fee-summary {
  color: #6d28d9;
}

.import-fee-summary {
  margin: 0.8rem 0;
  line-height: 1.5;
}

.import-fee-summary p {
  margin: 0;
}

.form-group {
  margin-top: 0.8rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.35rem;
  color: #4c1d95;
  font-weight: 700;
}

.error-box {
  margin-top: 0.75rem;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #fda29b;
  border-radius: 12px;
  padding: 0.7rem;
}

.state-wrap {
  padding: 0.85rem 0;
  color: #7d4db2;
}

.close-btn {
  background: transparent;
  border: 0;
  font-size: 1.25rem;
  cursor: pointer;
  color: #7d6b96;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .admin-support-page {
    padding: 1rem;
  }
}
</style>
