<script setup>
import { computed, onMounted, ref } from 'vue'
import translateError from '../../utils/translateError'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const payments = ref([])
const slipLoading = ref(false)
const slipError = ref('')
const selectedSlip = ref(null)
const selectedOrderDetail = ref(null)
const selectedOrderLoading = ref(false)
const selectedOrderError = ref('')
const importFeeInput = ref('')
const typeFilter = ref('all')
const filterStatus = ref('all')
const showStatusFilters = ref(false)

const filteredPayments = computed(() => {
  return payments.value.filter((payment) => {
    const matchesStatus =
      filterStatus.value === 'all' || String(payment.status || '') === filterStatus.value
    const matchesType =
      typeFilter.value === 'all' ||
      String(payment.Order_type || '').toLowerCase() === typeFilter.value
    return matchesStatus && matchesType
  })
})

const typeCount = computed(() => ({
  all: payments.value.length,
  preorder: payments.value.filter(
    (payment) => String(payment.Order_type || '').toLowerCase() === 'preorder',
  ).length,
  ready: payments.value.filter(
    (payment) => String(payment.Order_type || '').toLowerCase() === 'ready',
  ).length,
  pending_import: payments.value.filter(
    (payment) => String(payment.Order_type || '').toLowerCase() === 'pending_import',
  ).length,
}))

const currentTypeLabel = computed(() => {
  if (typeFilter.value === 'preorder') return 'พรีออเดอร์'
  if (typeFilter.value === 'ready') return 'พร้อมส่ง'
  if (typeFilter.value === 'pending_import') return 'รออนุมัติรอบ 2'
  return 'ทั้งหมด'
})
// เพิ่มตัวเลือกประเภท Pending_import ใน filter
// ...existing code...

const currentStatusLabel = computed(() => {
  if (filterStatus.value === 'Pending') return 'รอตรวจสอบ'
  if (filterStatus.value === 'Approved') return 'อนุมัติแล้ว'
  if (filterStatus.value === 'Rejected') return 'ปฏิเสธแล้ว'
  return 'ทั้งหมด'
})

const statusConfig = {
  Pending: { text: 'รอตรวจสอบ', color: '#f59e0b', bg: '#fffbeb' },
  Approved: { text: 'อนุมัติแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Rejected: { text: 'ปฏิเสธ', color: '#ef4444', bg: '#fef2f2' },
}

// Cash-on-delivery removed — do not show as an option
const paymentMethodLabel = {
  bank_transfer: '🏦 โอนธนาคาร',
  promptpay: '📱 พร้อมเพย์',
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

function resolveSlipUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

function resetFilters() {
  typeFilter.value = 'all'
  filterStatus.value = 'all'
}

async function fetchPayments() {
  slipLoading.value = true
  slipError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/payments`)
    if (!response.ok) {
      throw new Error('โหลดข้อมูลสลิปไม่สำเร็จ')
    }
    const data = await response.json()
    // FIX: Show all payment records, no deduplication
    payments.value = Array.isArray(data) ? data : []
  } catch (error) {
    slipError.value = translateError(error)
  } finally {
    slipLoading.value = false
  }
}

async function updatePaymentStatus(payId, status, orderId = null) {
  try {
    // 1) ตรวจสอบว่าต้องกรอกค่านำเข้าก่อนอนุมัติ slip รอบแรก (preorder)
    const targetPayment = payments.value.find((p) => p.pay_id === payId)
    const _orderId = orderId || selectedSlip.value?.order_id || targetPayment?.order_id
    let orderData = null
    // Allow approving slips immediately even if import fee not set.
    // If needed, admin can still save import fee separately via the modal.

    // 2) อัปเดตสถานะ payment
    const response = await fetch(`${API_BASE_URL}/payments/${payId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ')

    // 3) อัปเดตสถานะ order ตาม logic เดิม
    if (_orderId) {
      let nextOrderStatus = null
      if (status === 'Rejected') {
        // ตรวจสอบสถานะออเดอร์ก่อน: ถ้าเป็น Pending_import_fee ให้ใช้ Invalid import slip
        if (!orderData) {
          const orderRes = await fetch(`${API_BASE_URL}/orders/${_orderId}`)
          orderData = orderRes.ok ? await orderRes.json() : null
        }
        nextOrderStatus =
          orderData?.status === 'Pending_import_fee' ? 'Invalid import slip' : 'Invalid slip'
      } else if (status === 'Approved') {
        if (targetPayment?.type === 'Order_fee') {
          nextOrderStatus = 'Wait_for_Import_Fee'
        } else if (targetPayment?.type === 'Import_Fee') {
          nextOrderStatus = 'Paid'
        } else if (targetPayment?.Order_type === 'Preorder') {
          if (!orderData) {
            const orderRes = await fetch(`${API_BASE_URL}/orders/${_orderId}`)
            orderData = orderRes.ok ? await orderRes.json() : null
          }
          if (orderData?.status === 'Pending') {
            nextOrderStatus = 'Wait_for_Import_Fee'
          } else if (['Wait_for_Import_Fee', 'Pending_import_fee'].includes(orderData?.status)) {
            nextOrderStatus = 'Paid'
          }
        }
      }
      if (nextOrderStatus) {
        const orderRes = await fetch(`${API_BASE_URL}/orders/${_orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextOrderStatus }),
        })
        if (!orderRes.ok) console.warn('อัปเดตสถานะออเดอร์ไม่สำเร็จ')
      }
    }

    await fetchPayments()
    selectedSlip.value = null
    selectedOrderDetail.value = null
    importFeeInput.value = ''
  } catch (error) {
    slipError.value = translateError(error)
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
    selectedOrderError.value = translateError(error)
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

      <div class="filter-shell">
        <div class="filter-shell__top">
          <div class="filter-summary-row">
            <span class="filter-summary-label">ตัวกรองปัจจุบัน</span>
            <div class="filter-summary-chips">
              <span class="summary-chip">ประเภท: {{ currentTypeLabel }}</span>
              <span class="summary-chip">สถานะ: {{ currentStatusLabel }}</span>
            </div>
          </div>

          <button
            class="ghost-btn filter-shell__toggle"
            type="button"
            @click="showStatusFilters = !showStatusFilters"
          >
            ตัวกรอง
            <span class="filter-shell__toggle-badge">{{ typeCount.all }}</span>
          </button>
        </div>

        <transition name="filter-drop">
          <div v-if="showStatusFilters" class="filter-popover">
            <div class="filter-grid">
              <div class="filter-field">
                <label for="type-filter">ประเภทสลิป</label>
                <select id="type-filter" v-model="typeFilter" class="filter-select">
                  <option value="all">ทั้งหมด ({{ typeCount.all }})</option>
                  <option value="preorder">พรีออเดอร์ ({{ typeCount.preorder }})</option>
                  <option value="ready">พร้อมส่ง ({{ typeCount.ready }})</option>
                  <option value="pending_import">
                    รออนุมัติรอบ 2 ({{ typeCount.pending_import }})
                  </option>
                </select>
              </div>

              <div class="filter-field">
                <label for="status-filter">สถานะการตรวจ</label>
                <select id="status-filter" v-model="filterStatus" class="filter-select">
                  <option value="all">ทั้งหมด</option>
                  <option value="Pending">รอตรวจสอบ</option>
                  <option value="Approved">อนุมัติแล้ว</option>
                  <option value="Rejected">ปฏิเสธแล้ว</option>
                </select>
              </div>
            </div>

            <div class="filter-actions">
              <button class="ghost-btn filter-secondary-btn" type="button" @click="resetFilters">
                ล้างตัวกรอง
              </button>
              <button
                class="primary-btn filter-secondary-btn"
                type="button"
                @click="showStatusFilters = false"
              >
                เสร็จแล้ว
              </button>
            </div>
          </div>
        </transition>
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
              <th>ประเภทสลิป</th>
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
                      : payment.Order_type === 'Pending_import'
                        ? 'status status--pending-import'
                        : 'status status--paid'
                  "
                  :style="
                    payment.Order_type === 'Pending_import'
                      ? { color: '#a259e6', background: '#f3e8ff', 'font-weight': 'bold' }
                      : {}
                  "
                >
                  {{
                    payment.Order_type === 'Preorder'
                      ? 'Preorder'
                      : payment.Order_type === 'Pending_import'
                        ? 'Pending Import'
                        : 'Ready Stock'
                  }}
                </span>
              </td>
              <td>
                <span
                  v-if="payment.type === 'Import_Fee'"
                  class="badge badge--import-fee"
                >💰 จ่ายค่านำเข้า</span>
                <span v-else class="badge badge--order-fee">🧾 ค่าสินค้า</span>
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
                สำหรับพรีออเดอร์ ต้องอนุมัติรอบแรกก่อนถึงจะบันทึกค่านำเข้าได้<br />
                หลังจากลูกค้าชำระรอบสองและอัปโหลดสลิป ให้แอดมินอนุมัติรอบสองเพื่อเปลี่ยนสถานะเป็น
                "ชำระแล้ว"
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
                      :disabled="selectedOrderDetail.status === 'Paid'"
                    />
                  </div>
                  <div v-if="selectedOrderDetail.status === 'Paid'" class="info-box">
                    ออเดอร์นี้ชำระครบแล้ว ไม่สามารถแก้ค่านำเข้าได้
                  </div>
                  <div v-else class="info-box">
                    กรอกค่านำเข้า (ถ้ามี) แล้วจึงกดอนุมัติรอบที่เหมาะสม
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="slip-modal-foot">
            <template v-if="selectedSlip.Order_type === 'Preorder' && selectedOrderDetail">
              <!-- รอบ 1: อนุมัติรอบแรก (Pending -> Wait_for_Import_Fee) -->
              <button
                v-if="selectedSlip.status === 'Pending' && selectedOrderDetail.status === 'Pending'"
                class="btn-approve"
                type="button"
                @click="updatePaymentStatus(selectedSlip.pay_id, 'Approved', selectedSlip.order_id)"
              >
                ✓ อนุมัติรอบ 1 (ชำระรอบแรก)
              </button>
              <!-- รอบ 2: อนุมัติรอบสอง (Wait_for_Import_Fee / Pending_import_fee -> Paid) -->
              <button
                v-if="
                  selectedSlip.status === 'Pending' &&
                  ['Wait_for_Import_Fee', 'Pending_import_fee'].includes(selectedOrderDetail.status)
                "
                class="btn-approve"
                type="button"
                @click="updatePaymentStatus(selectedSlip.pay_id, 'Approved', selectedSlip.order_id)"
              >
                ✓ อนุมัติรอบ 2 (ชำระรอบสอง)
              </button>
              <!-- ปฏิเสธสลิป -->
              <button
                v-if="selectedSlip.status === 'Pending'"
                class="btn-reject"
                type="button"
                @click="updatePaymentStatus(selectedSlip.pay_id, 'Rejected', selectedSlip.order_id)"
              >
                ✕ ปฏิเสธ
              </button>
              <!-- บันทึกค่านำเข้า (เฉพาะ Wait_for_Import_Fee) -->
              <button
                v-if="selectedOrderDetail.status === 'Wait_for_Import_Fee'"
                class="btn-approve"
                type="button"
                @click="saveImportFee"
              >
                💰 บันทึกค่านำเข้า
              </button>
              <span
                v-if="selectedOrderDetail.status === 'Paid'"
                class="status-pill"
                :style="{
                  color: (statusConfig['Approved'] || {}).color,
                  background: (statusConfig['Approved'] || {}).bg,
                }"
              >
                ชำระครบ 2 รอบแล้ว
              </span>
            </template>
            <template v-else>
              <span
                class="status-pill"
                :style="{
                  color: (statusConfig[selectedSlip.status] || {}).color,
                  background: (statusConfig[selectedSlip.status] || {}).bg,
                }"
              >
                {{ (statusConfig[selectedSlip.status] || {}).text || selectedSlip.status }}
              </span>
            </template>
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

.filter-panel {
  display: grid;
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid rgba(230, 218, 244, 0.95);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(255, 231, 243, 0.58), transparent 30%),
    linear-gradient(180deg, rgba(250, 247, 255, 0.94), rgba(255, 255, 255, 0.99));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.filter-shell {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-shell__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.filter-summary-label {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9a88b2;
}

.filter-summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  background: rgba(125, 77, 178, 0.08);
  color: #6d4c9c;
  font-size: 0.76rem;
  font-weight: 700;
  border: 1px solid rgba(125, 77, 178, 0.1);
}

.filter-shell__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  background: rgba(243, 236, 255, 0.95);
  border: 1px solid #e3d5f7;
  color: #6c4a99;
  box-shadow: 0 10px 20px rgba(124, 92, 160, 0.08);
}

.filter-shell__toggle-badge {
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: #fff;
  color: #7d4db2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}

.filter-popover {
  border-radius: 18px;
  border: 1px solid rgba(230, 218, 244, 0.95);
  background: rgba(255, 255, 255, 0.98);
  padding: 1rem;
  box-shadow: 0 18px 30px rgba(129, 103, 164, 0.12);
}

.filter-grid {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.filter-field {
  display: grid;
  gap: 0.45rem;
}

.filter-field label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #5d447e;
}

.filter-select {
  width: 100%;
  border-radius: 14px;
  border: 1px solid #e2d5f3;
  background: #fbf9ff;
  color: #4d3b6c;
  padding: 0.82rem 0.95rem;
  outline: none;
}

.filter-select:focus {
  border-color: #b38ae4;
  box-shadow: 0 0 0 3px rgba(165, 94, 234, 0.12);
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.95rem;
  flex-wrap: wrap;
}

.filter-secondary-btn {
  padding: 0.72rem 1rem;
}

.filter-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-chip-group--status .filter-btn {
  color: #5d447e;
}

.filter-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #e6d8f6 18%, #e6d8f6 82%, transparent);
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #fff;
  color: #7d4db2;
  padding: 0.58rem 0.9rem;
  border: 1px solid #e6daf4;
  box-shadow: 0 4px 12px rgba(124, 92, 160, 0.05);
}

.filter-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.55;
}

.filter-dot--all {
  color: #7d4db2;
}

.filter-dot--pending {
  color: #f59e0b;
}

.filter-dot--approved {
  color: #10b981;
}

.filter-dot--rejected {
  color: #ef4444;
}

.filter-btn:hover {
  border-color: #d5c1ea;
}

.filter-btn.active {
  background: linear-gradient(135deg, #a55eea, #ff7eb6);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 10px 20px rgba(165, 94, 234, 0.2);
}

.filter-count {
  min-width: 1.65rem;
  height: 1.35rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}

.filter-btn:not(.active) .filter-count {
  background: #f7f0ff;
  color: #7d4db2;
}

.filter-drop-enter-active,
.filter-drop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.filter-drop-enter-from,
.filter-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
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

.badge--import-fee {
  background: #f3e8ff;
  color: #7c3aed;
}

.badge--order-fee {
  background: #f0fdf4;
  color: #16a34a;
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