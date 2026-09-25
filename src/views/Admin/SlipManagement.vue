<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
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
const typeFilter = ref('all')
const filterStatus = ref('all')
const search = ref('')
const expandedCards = ref(new Set())

function toggleCard(payId) {
  const next = new Set(expandedCards.value)
  if (next.has(payId)) {
    next.delete(payId)
  } else {
    next.add(payId)
  }
  expandedCards.value = next
}

function isCardExpanded(payId) {
  return expandedCards.value.has(payId)
}

const filteredPayments = computed(() => {
  return payments.value.filter((payment) => {
    const matchesStatus =
      filterStatus.value === 'all' || String(payment.status || '') === filterStatus.value
    const matchesType =
      typeFilter.value === 'all' ||
      String(payment.Order_type || '').toLowerCase() === typeFilter.value
    const query = search.value.trim().toLowerCase()
    const matchesSearch =
      !query ||
      `${payment.pay_id} ${payment.order_id} ${formatOrderNo(payment.order_id)} ${payment.username || ''}`
        .toLowerCase()
        .includes(query)
    return matchesStatus && matchesType && matchesSearch
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

function resolveSlipUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

function orderTypeLabel(payment) {
  if (payment.Order_type === 'Preorder') return 'Preorder'
  if (payment.Order_type === 'Pending_import') return 'Pending Import'
  return 'Ready Stock'
}

function orderTypeClass(payment) {
  if (payment.Order_type === 'Preorder') return 'status status--pending'
  if (payment.Order_type === 'Pending_import') return 'status status--pending-import'
  return 'status status--paid'
}

function formatAmount(value) {
  return Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2 })
}

function paymentMethodText(payment) {
  return (
    {
      bank_transfer: 'โอนธนาคาร',
      promptpay: 'พร้อมเพย์',
    }[payment.payment_method] ||
    payment.payment_method ||
    '-'
  )
}

function mobileCompletedStatusText(payment) {
  if (payment.status === 'Approved') return 'ดำเนินการแล้ว'
  if (payment.status === 'Rejected') return 'ปฏิเสธแล้ว'
  return (statusConfig[payment.status] || {}).text || payment.status || '-'
}

function formatOrderNo(value) {
  return String(value).padStart(3, '0')
}

const totalCount = computed(() => payments.value.length)

function resetFilters() {
  search.value = ''
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
    if (window.matchMedia?.('(max-width: 767px)').matches) {
      expandedCards.value = new Set(payments.value.map((payment) => payment.pay_id))
    }
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
    const _orderId = orderId || targetPayment?.order_id || selectedSlip.value?.order_id
    let orderData = null
    // Allow approving slips immediately without requiring import fee input in this modal.

    // 2) อัปเดตสถานะ payment
    const response = await fetch(`${API_BASE_URL}/payments/${payId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ')

    // 3) อัปเดตสถานะ order ตาม logic เดิม
    let orderUpdateFailed = false
    if (_orderId) {
      let nextOrderStatus = null
      if (status === 'Rejected') {
        // ให้ backend ตัดสินใจเองว่าเป็น "Invalid slip" หรือ "Invalid import slip"
        // โดยเช็คจาก order status ปัจจุบัน
        // (Pending_import_fee / Import_slip_submitted → Invalid import slip)
        const rejectRes = await fetch(`${API_BASE_URL}/orders/${_orderId}/reject-slip`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!rejectRes.ok) {
          const errorBody = await rejectRes.json().catch(() => null)
          console.error('อัปเดตสถานะออเดอร์ไม่สำเร็จ (reject-slip):', errorBody)
          orderUpdateFailed = true
        }
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
        if (!orderRes.ok) {
          const errorBody = await orderRes.json().catch(() => null)
          console.error('อัปเดตสถานะออเดอร์ไม่สำเร็จ (status):', errorBody)
          orderUpdateFailed = true
        }
      }
    } else if (status === 'Rejected' || status === 'Approved') {
      // ไม่มี order_id ให้ผูกกับ payment นี้เลย — แจ้งเตือนแทนการปล่อยผ่านเงียบๆ
      console.error('ไม่พบ order_id สำหรับ payment นี้', { payId, targetPayment })
      orderUpdateFailed = true
    }

    await fetchPayments()
    selectedSlip.value = null
    selectedOrderDetail.value = null

    if (orderUpdateFailed) {
      slipError.value = 'อัปเดตสถานะการชำระเงินสำเร็จ แต่ปรับสถานะออเดอร์ไม่สำเร็จ กรุณาตรวจสอบออเดอร์นี้อีกครั้ง'
    }
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
  } catch (error) {
    selectedOrderError.value = translateError(error)
  } finally {
    selectedOrderLoading.value = false
  }
}

async function openSlip(payment) {
  selectedSlip.value = payment
  selectedOrderDetail.value = null
  selectedOrderError.value = ''

  if (payment.Order_type === 'Preorder') {
    await fetchOrderDetails(payment.order_id)
  }
}

function closeSlip() {
  selectedSlip.value = null
  selectedOrderDetail.value = null
  selectedOrderError.value = ''
}


const countByStatus = (status) =>
  payments.value.filter((payment) => payment.status === status).length

onMounted(() => {
  fetchPayments()
})
</script>

<template>
  <div class="admin-support-page">
    <AdminPageHeader
      title="จัดการสลิปการชำระเงิน"
      description="ตรวจสอบ อนุมัติ และดูหลักฐานการโอนเงินสำหรับออเดอร์พรีออเดอร์"
    >
      <div class="header-actions">
        <button class="btn-primary" type="button" :disabled="slipLoading" @click="fetchPayments">
          {{ slipLoading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล' }}
        </button>
      </div>
    </AdminPageHeader>

    <div v-if="slipError" class="error-box">{{ slipError }}</div>

    <section class="summary-grid">
      <div class="summary-card summary-card--purple">
        <span>สลิปทั้งหมด</span><strong>{{ totalCount }}</strong>
      </div>
      <div class="summary-card summary-card--orange">
        <span>รอตรวจสอบ</span><strong>{{ countByStatus('Pending') }}</strong>
      </div>
      <div class="summary-card summary-card--green">
        <span>อนุมัติแล้ว</span><strong>{{ countByStatus('Approved') }}</strong>
      </div>
      <div class="summary-card summary-card--red">
        <span>ปฏิเสธแล้ว</span><strong>{{ countByStatus('Rejected') }}</strong>
      </div>
    </section>

    <section class="filter-panel">
      <div class="mobile-filter-heading">
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 5h16M7 12h10M10 19h4" />
          <path d="m16 5 2 2-2 2M8 12l-2 2 2 2" />
        </svg>
        <strong>ตัวกรอง</strong>
      </div>
      <input v-model="search" type="search" placeholder="ค้นหาเลขออเดอร์ รหัสชำระ หรือรหัสสมาชิก" />
      <select id="type-filter" v-model="typeFilter" aria-label="ประเภทสลิป">
        <option value="all">ทุกประเภท ({{ typeCount.all }})</option>
        <option value="preorder">พรีออเดอร์ ({{ typeCount.preorder }})</option>
        <option value="ready">พร้อมส่ง ({{ typeCount.ready }})</option>
        <option value="pending_import">รออนุมัติรอบ 2 ({{ typeCount.pending_import }})</option>
      </select>
      <select id="status-filter" v-model="filterStatus" aria-label="สถานะการตรวจ">
        <option value="all">ทุกสถานะ</option>
        <option value="Pending">รอตรวจสอบ</option>
        <option value="Approved">อนุมัติแล้ว</option>
        <option value="Rejected">ปฏิเสธแล้ว</option>
      </select>
      <button class="btn-secondary" type="button" @click="resetFilters">
        <span class="desktop-filter-reset-label">ล้างตัวกรอง</span>
        <span class="mobile-filter-button-label">
          <svg class="mobile-filter-button-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M4 5h16M7 12h10M10 19h4" />
          </svg>
          ตัวกรอง <strong>{{ filteredPayments.length }}</strong>
        </span>
      </button>
    </section>

    <section class="table-card">
      <div v-if="slipLoading && payments.length === 0" class="empty-state">กำลังโหลดข้อมูลสลิป...</div>
      <div v-else-if="filteredPayments.length === 0" class="empty-state">
        ไม่พบรายการสลิปชำระเงินในขณะนี้
      </div>

      <div v-else class="table-scroll">
        <table class="slip-table">
          <thead>
            <tr>
              <th>รหัสชำระ</th>
              <th>ออเดอร์</th>
              <th>รหัสสมาชิก</th>
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
                <strong>#{{ String(payment.order_id).padStart(3, '0') }}</strong>
              </td>
              <td>
                <span class="member-code">{{ payment.username || '-' }}</span>
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
                    @click="updatePaymentStatus(payment.pay_id, 'Approved', payment.order_id)"
                  >
                    ✓ อนุมัติ
                  </button>
                  <button
                    class="btn-reject"
                    @click="updatePaymentStatus(payment.pay_id, 'Rejected', payment.order_id)"
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

      <div
        v-if="filteredPayments.length"
        class="slip-cards"
        aria-label="รายการสลิปชำระเงินสำหรับมือถือและแท็บเล็ต"
      >
        <article
          v-for="payment in filteredPayments"
          :key="`card-${payment.pay_id}`"
          class="slip-card"
          :class="{ 'slip-card--expanded': isCardExpanded(payment.pay_id) }"
        >
          <button
            class="slip-card__summary"
            type="button"
            :aria-expanded="isCardExpanded(payment.pay_id)"
            @click="toggleCard(payment.pay_id)"
          >
            <span class="slip-card__title">
              <strong>Order #{{ formatOrderNo(payment.order_id) }}</strong>
              <small>#{{ payment.pay_id }} · ฿{{ formatAmount(payment.amount) }}</small>
            </span>
            <span class="slip-card__summary-side">
              <span
                class="status-pill"
                :style="{
                  color: (statusConfig[payment.status] || {}).color,
                  background: (statusConfig[payment.status] || {}).bg,
                }"
              >
                {{ (statusConfig[payment.status] || {}).text || payment.status }}
              </span>
              <span class="slip-card__chevron" aria-hidden="true">⌄</span>
            </span>
          </button>

          <div v-if="isCardExpanded(payment.pay_id)" class="slip-card__details">
            <div class="slip-card__detail-row">
              <span>รหัสชำระเงิน</span>
              <strong>#{{ payment.pay_id }}</strong>
            </div>
            <div class="slip-card__detail-row">
              <span>รหัสสมาชิก</span>
              <strong>{{ payment.username || '-' }}</strong>
            </div>
            <div class="slip-card__detail-row">
              <span>ประเภทออเดอร์</span>
              <span :class="orderTypeClass(payment)">{{ orderTypeLabel(payment) }}</span>
            </div>
            <div class="slip-card__detail-row">
              <span>ประเภทสลิป</span>
              <span v-if="payment.type === 'Import_Fee'" class="badge badge--import-fee">💰 จ่ายค่านำเข้า</span>
              <span v-else class="badge badge--order-fee">🧾 ค่าสินค้า</span>
            </div>
            <div class="slip-card__detail-row">
              <span>ยอดเงิน</span>
              <strong class="slip-card__amount">฿{{ formatAmount(payment.amount) }}</strong>
            </div>
            <div class="slip-card__detail-row">
              <span>วิธีชำระ</span>
              <strong>{{ paymentMethodLabel[payment.payment_method] || payment.payment_method || '-' }}</strong>
            </div>
            <div class="slip-card__detail-row">
              <span>วันที่</span>
              <strong>{{ formatDate(payment.Slip_date) }}</strong>
            </div>
            <div class="slip-card__detail-row">
              <span>หลักฐาน</span>
              <button v-if="payment.slip_img" class="slip-view-btn" type="button" @click="openSlip(payment)">
                ดูสลิป 🖼️
              </button>
              <span v-else class="no-slip">ไม่มีไฟล์</span>
            </div>

            <div class="slip-card__actions">
              <template v-if="payment.status === 'Pending'">
                <button
                  class="btn-approve"
                  type="button"
                  @click="updatePaymentStatus(payment.pay_id, 'Approved', payment.order_id)"
                >
                  ✓ อนุมัติ
                </button>
                <button
                  class="btn-reject"
                  type="button"
                  @click="updatePaymentStatus(payment.pay_id, 'Rejected', payment.order_id)"
                >
                  ✕ ปฏิเสธ
                </button>
              </template>
              <span v-else class="done-text">ดำเนินการแล้ว</span>
            </div>
          </div>
        </article>
      </div>

      <div
        v-if="filteredPayments.length"
        class="mobile-slip-cards"
        aria-label="รายการสลิปชำระเงินบนมือถือ"
      >
        <article v-for="payment in filteredPayments" :key="`mobile-card-${payment.pay_id}`" class="mobile-slip-card">
          <button
            class="mobile-slip-card__head"
            type="button"
            :aria-expanded="isCardExpanded(payment.pay_id)"
            @click="toggleCard(payment.pay_id)"
          >
            <span class="mobile-slip-card__identity">
              <strong>#{{ payment.pay_id }}</strong>
              <small>รหัสชำระเงิน</small>
            </span>
            <span class="mobile-slip-card__status-side">
              <span
                class="mobile-status-pill"
                :style="{
                  color: (statusConfig[payment.status] || {}).color,
                  background: (statusConfig[payment.status] || {}).bg,
                }"
              >
                <svg v-if="payment.status === 'Approved'" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8 12 2.5 2.5L16 9" />
                </svg>
                <svg v-else-if="payment.status === 'Rejected'" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m9 9 6 6M15 9l-6 6" />
                </svg>
                <svg v-else viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {{ (statusConfig[payment.status] || {}).text || payment.status || '-' }}
              </span>
              <svg class="mobile-slip-card__chevron" :class="{ 'is-open': isCardExpanded(payment.pay_id) }" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m7 9 5 5 5-5" />
              </svg>
            </span>
          </button>

          <div v-if="isCardExpanded(payment.pay_id)" class="mobile-slip-card__body">
            <div class="mobile-slip-divider"></div>

            <div class="mobile-slip-order-member">
              <div class="mobile-slip-order">
                <span>Order</span>
                <strong>#{{ formatOrderNo(payment.order_id) }}</strong>
              </div>
              <div class="mobile-slip-member">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 19c.7-3.1 2.9-4.8 6.5-4.8s5.8 1.7 6.5 4.8" />
                </svg>
                <span>
                  <strong>{{ payment.username || '-' }}</strong>
                  <small>รหัสสมาชิก {{ payment.user_id || '-' }}</small>
                </span>
              </div>
            </div>

            <div class="mobile-slip-badges">
              <span v-if="payment.Order_type === 'Preorder'" class="mobile-order-badge mobile-order-badge--preorder">
                Preorder
              </span>
              <span v-if="payment.type === 'Import_Fee'" class="mobile-order-badge mobile-order-badge--import">
                <span aria-hidden="true">💰</span> จ่ายค่านำเข้า
              </span>
              <span v-if="payment.type !== 'Import_Fee'" class="mobile-order-badge mobile-order-badge--order-fee">
                ค่าสินค้า
              </span>
            </div>

            <div class="mobile-slip-divider"></div>

            <div class="mobile-slip-two-column-row">
              <div class="mobile-slip-data-block">
                <span>ยอดเงิน</span>
                <strong class="mobile-slip-amount">฿{{ formatAmount(payment.amount) }}</strong>
              </div>
              <div class="mobile-slip-data-block mobile-slip-payment-method">
                <span>วิธีชำระ</span>
                <strong>
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M2 21h20" />
                    <path d="m4 10 8-6 8 6" />
                  </svg>
                  {{ paymentMethodText(payment) }}
                </strong>
              </div>
            </div>

            <div class="mobile-slip-divider"></div>

            <div class="mobile-slip-two-column-row mobile-slip-proof-row">
              <div class="mobile-slip-data-block">
                <span>วันที่</span>
                <strong>
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <rect x="4" y="5.5" width="16" height="15" rx="2" />
                    <path d="M8 3.5v4M16 3.5v4M4 10h16" />
                  </svg>
                  {{ formatDate(payment.Slip_date) }}
                </strong>
              </div>
              <div class="mobile-slip-data-block mobile-slip-proof-block">
                <span>หลักฐาน</span>
                <button v-if="payment.slip_img" class="mobile-slip-view-btn" type="button" @click="openSlip(payment)">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <rect x="3.5" y="4" width="17" height="16" rx="2" />
                    <circle cx="9" cy="9" r="1.5" />
                    <path d="m5.5 17 4.5-4.5 3 3 2-2 3.5 3.5" />
                  </svg>
                  ดูสลิป
                </button>
                <span v-else class="no-slip">ไม่มีไฟล์</span>
              </div>
            </div>

            <div class="mobile-slip-card__actions">
              <template v-if="payment.status === 'Pending'">
                <button
                  class="btn-approve"
                  type="button"
                  @click="updatePaymentStatus(payment.pay_id, 'Approved', payment.order_id)"
                >
                  ✓ อนุมัติ
                </button>
                <button
                  class="btn-reject"
                  type="button"
                  @click="updatePaymentStatus(payment.pay_id, 'Rejected', payment.order_id)"
                >
                  ✕ ปฏิเสธ
                </button>
              </template>
              <div v-else class="mobile-completed-strip">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8 12 2.5 2.5L16 9" />
                </svg>
                {{ mobileCompletedStatusText(payment) }}
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <transition name="fade">
      <div v-if="selectedSlip" class="slip-modal-overlay" @click.self="closeSlip">
        <div class="slip-modal">
          <div class="slip-modal-head">
            <div>
              <h3>สลิปออเดอร์ #{{ String(selectedSlip.order_id).padStart(3, '0') }}</h3>
              <p class="slip-modal-member">รหัสสมาชิก: {{ selectedSlip.username || '-' }}</p>
            </div>
            <button class="close-btn" type="button" @click="closeSlip">✕</button>
          </div>

          <div class="slip-modal-body">
            <img :src="resolveSlipUrl(selectedSlip.slip_img)" class="slip-img-full" alt="slip" />

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
  color: #493765;
  display: grid;
  align-content: start;
  gap: 1rem;
}

.admin-support-page > * {
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

/* ---------- buttons ---------- */
button {
  font: inherit;
}

.btn-primary,
.btn-secondary,
.btn-approve,
.btn-reject,
.slip-view-btn,
.close-btn {
  border: 0;
  border-radius: 10px;
  padding: 0.65rem 1rem;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-primary {
  background: #9b6ad4;
  color: #fff;
}

.btn-secondary {
  background: #f2eaff;
  color: #6f50a0;
}

.slip-view-btn {
  background: #f8f2ff;
  border: 1px solid #dbc8f4;
  color: #6f50a0;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
}

.btn-approve {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #6ee7b7;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
}

.btn-reject {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
}

.close-btn {
  background: transparent;
  padding: 0.3rem 0.5rem;
  font-size: 1.25rem;
  color: #7d6b96;
}

.error-box {
  padding: 0.8rem 1rem;
  border: 1px solid #f0b8c1;
  border-radius: 12px;
  background: #fff0f2;
  color: #9f3346;
}

/* ---------- summary cards ---------- */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.summary-card {
  padding: 1.1rem 1.2rem;
  border: 1px solid #e6d9f3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(75, 45, 106, 0.07);
}

.summary-card span {
  display: block;
  color: #806d98;
  font-size: 0.85rem;
  font-weight: 700;
}

.summary-card strong {
  display: block;
  margin-top: 0.25rem;
  color: #4b3568;
  font-size: 1.9rem;
}

.summary-card--green { border-color: #b9e7d2; background: #f4fff8; }
.summary-card--orange { border-color: #f4dbac; background: #fffaf0; }
.summary-card--purple { border-color: #d9c4f0; background: #faf7ff; }
.summary-card--red { border-color: #f5c6c6; background: #fff6f6; }

/* ---------- filters ---------- */
.filter-panel {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr auto;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid #e6d9f3;
  border-radius: 16px;
  background: #fff;
}

.filter-panel input,
.filter-panel select {
  min-width: 0;
  padding: 0.7rem 0.8rem;
  border: 1px solid #d9cbea;
  border-radius: 10px;
  background: #fff;
  color: #493765;
  font: inherit;
}

.filter-panel input:focus,
.filter-panel select:focus {
  outline: none;
  border-color: #b38ae4;
  box-shadow: 0 0 0 3px rgba(165, 94, 234, 0.12);
}

/* ---------- table card ---------- */
.table-card {
  overflow: hidden;
  border: 1px solid #e6d9f3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(75, 45, 106, 0.06);
}

.empty-state {
  padding: 3rem 1rem;
  text-align: center;
  color: #806d98;
}

.table-scroll {
  overflow-x: auto;
}

.slip-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;
}

.slip-table th:nth-child(1), .slip-table td:nth-child(1) { width: 8%; }
.slip-table th:nth-child(2), .slip-table td:nth-child(2) { width: 8%; }
.slip-table th:nth-child(3), .slip-table td:nth-child(3) { width: 9%; }
.slip-table th:nth-child(4), .slip-table td:nth-child(4) { width: 10%; }
.slip-table th:nth-child(5), .slip-table td:nth-child(5) { width: 11%; }
.slip-table th:nth-child(6), .slip-table td:nth-child(6) { width: 9%; }
.slip-table th:nth-child(7), .slip-table td:nth-child(7) { width: 9%; }
.slip-table th:nth-child(8), .slip-table td:nth-child(8) { width: 12%; }
.slip-table th:nth-child(9), .slip-table td:nth-child(9) { width: 9%; }
.slip-table th:nth-child(10), .slip-table td:nth-child(10) { width: 8%; }
.slip-table th:nth-child(11), .slip-table td:nth-child(11) { width: 7%; }

.slip-table th,
.slip-table td {
  padding: 0.7rem;
  border-bottom: 1px solid #eee7f7;
  font-size: 0.8rem;
  text-align: left;
}

.slip-table th {
  background: #faf7ff;
  color: #826ea1;
  letter-spacing: 0.05em;
  font-size: 0.72rem;
}

.member-code {
  display: inline-block;
  color: #6b7280;
  font-weight: 600;
  font-size: 0.85rem;
  white-space: nowrap;
}

/* ---------- pills / badges ---------- */
.status,
.status-pill,
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
}

.status { padding: 0.2rem 0.6rem; font-size: 0.7rem; }
.status--pending { background: #ffe7d5; color: #b55a1f; }
.status--paid { background: #ddf7ee; color: #277a62; }
.status--pending-import { background: #f3e8ff; color: #a259e6; font-weight: 800; }
.status-pill { padding: 3px 12px; font-size: 0.75rem; white-space: nowrap; }
.badge { padding: 0.34rem 0.72rem; font-size: 0.76rem; }
.badge--import-fee { background: #f3e8ff; color: #7c3aed; }
.badge--order-fee { background: #f0fdf4; color: #16a34a; }

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

/* ---------- mobile / tablet cards ---------- */
.slip-cards {
  display: none;
}

.mobile-slip-cards,
.mobile-filter-heading,
.mobile-filter-button-label {
  display: none;
}

/* ---------- modal ---------- */
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
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 20px;
  width: min(720px, 100%);
  max-height: calc(100dvh - 2rem);
  overflow: hidden;
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.slip-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.slip-modal-head h3 {
  margin: 0;
  color: #432f61;
  font-size: 1.1rem;
}

.slip-modal-member {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #7c5db0;
  font-weight: 600;
}

.slip-modal-body {
  padding: 1rem;
  overflow-y: auto;
  min-height: 0;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------- tablet + mobile (same look as preorder-progress) ---------- */
@media (max-width: 900px) {
  .admin-support-page {
    min-height: auto;
    padding: 0 0 2rem;
    background: none;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-panel {
    grid-template-columns: 1fr;
  }

  .filter-panel .btn-secondary {
    width: 100%;
  }

  .table-scroll {
    display: none;
  }

  .slip-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 0.75rem;
    padding: 0.7rem;
    background: #faf7ff;
  }

  .slip-card {
    overflow: hidden;
    border: 1px solid #e6d9f3;
    border-radius: 15px;
    background: #fff;
    box-shadow: 0 5px 14px rgba(75, 45, 106, 0.06);
  }

  .slip-card--expanded {
    border-color: #cdb1eb;
    box-shadow: 0 7px 18px rgba(121, 78, 163, 0.12);
  }

  .slip-card__summary {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    margin: 0;
    padding: 0.9rem;
    border: 0;
    border-radius: 0;
    background: #fff;
    color: #493765;
    font: inherit;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .slip-card__summary:hover,
  .slip-card__summary:focus-visible {
    background: #fcf9ff;
    outline: none;
  }

  .slip-card__title {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }

  .slip-card__title strong {
    overflow-wrap: anywhere;
    line-height: 1.35;
  }

  .slip-card__title small {
    color: #9a8aaa;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .slip-card__summary-side {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.45rem;
  }

  .slip-card__chevron {
    display: inline-grid;
    width: 1.65rem;
    height: 1.65rem;
    place-items: center;
    border-radius: 999px;
    background: #f2eaff;
    color: #8054aa;
    font-size: 1.2rem;
    line-height: 1;
    transition: transform 0.2s ease;
  }

  .slip-card--expanded .slip-card__chevron {
    transform: rotate(180deg);
  }

  .slip-card__details {
    display: grid;
    gap: 0.1rem;
    padding: 0.2rem 0.9rem 0.85rem;
    border-top: 1px solid #f0e9f7;
  }

  .slip-card__detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    min-height: 2.4rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid #f5eff9;
  }

  .slip-card__detail-row > span:first-child {
    flex: 0 0 auto;
    color: #806d98;
    font-size: 0.82rem;
  }

  .slip-card__detail-row > strong,
  .slip-card__detail-row > span:not(:first-child) {
    min-width: 0;
    color: #493765;
    font-size: 0.86rem;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .slip-card__detail-row > .status,
  .slip-card__detail-row > .badge {
    flex: 0 0 auto;
    font-size: 0.75rem;
  }

  .slip-card__amount {
    color: #4e3672;
    font-weight: 900;
  }

  .slip-card__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    padding-top: 0.75rem;
  }

  .slip-card__actions .btn-approve,
  .slip-card__actions .btn-reject {
    min-height: 2.6rem;
  }

  .slip-card__actions .done-text {
    grid-column: 1 / -1;
    text-align: center;
  }
}

@media (max-width: 600px) {
  .slip-cards {
    grid-template-columns: 1fr;
  }

  .summary-card {
    padding: 0.9rem 1rem;
  }

  .summary-card strong {
    font-size: 1.6rem;
  }

  .slip-modal-overlay {
    padding: 0.5rem;
  }

  .slip-modal {
    max-height: calc(100dvh - 1rem);
    border-radius: 16px;
  }

  .slip-modal-foot {
    flex-direction: column;
  }

  .slip-modal-foot > button,
  .slip-modal-foot > .status-pill {
    width: 100%;
    justify-content: center;
    min-height: 2.6rem;
  }
}

@media (max-width: 767px) {
  .admin-support-page {
    min-height: 100vh;
    padding: 0.75rem;
    gap: 0.7rem;
    background: linear-gradient(180deg, #faf7ff 0%, #f2ecff 100%);
  }

  .admin-support-page > .admin-page-heading {
    margin-bottom: 0;
    padding: 1rem;
    border-radius: 18px;
    gap: 0.7rem;
  }

  .admin-page-heading h1 {
    color: #2f2355;
    font-size: 1.45rem;
    line-height: 1.3;
  }

  .admin-page-heading p {
    margin-top: 0.35rem;
    color: #76658e;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .admin-page-heading__actions,
  .admin-page-heading__actions .btn-primary {
    width: 100%;
  }

  .admin-page-heading__actions .btn-primary {
    min-height: 2.3rem;
    padding: 0.5rem 0.8rem;
    font-size: 0.76rem;
  }

  .error-box {
    margin: 0;
    font-size: 0.78rem;
  }

  .summary-grid {
    display: none;
  }

  .filter-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    padding: 0.85rem;
    border: 0;
    border-radius: 18px;
    background: #f5f0ff;
    box-shadow: inset 0 0 0 1px rgba(225, 211, 244, 0.55);
  }

  .mobile-filter-heading {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 0.55rem;
    padding: 0.05rem 0.1rem 0.1rem;
    color: #4d3471;
    font-size: 1rem;
  }

  .mobile-filter-heading svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .filter-panel input,
  .filter-panel select {
    min-height: 3rem;
    padding: 0.55rem 0.7rem;
    border-color: #d9cbea;
    border-radius: 13px;
    font-size: 0.78rem;
  }

  .filter-panel input {
    grid-column: 1 / -1;
  }

  .filter-panel .btn-secondary {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.7rem;
    border: 1px solid #d9c2f2;
    border-radius: 999px;
    background: #f0e4ff;
    color: #694590;
    font-size: 0.86rem;
  }

  .desktop-filter-reset-label {
    display: none;
  }

  .mobile-filter-button-label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .mobile-filter-button-label strong {
    font-weight: 900;
  }

  .mobile-filter-button-icon {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .table-card {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .table-scroll,
  .slip-cards {
    display: none;
  }

  .mobile-slip-cards {
    display: grid;
    gap: 0.75rem;
  }

  .mobile-slip-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #e4d8f0;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 7px 18px rgba(92, 65, 128, 0.1);
  }

  .mobile-slip-card__head {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.65rem;
    padding: 0.85rem 0.85rem 0.75rem;
    border: 0;
    border-radius: 0;
    background: #fff;
    color: #2f2355;
    text-align: left;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .mobile-slip-card__head:focus-visible {
    outline: 3px solid rgba(183, 136, 234, 0.3);
    outline-offset: -3px;
  }

  .mobile-slip-card__identity {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .mobile-slip-card__identity strong {
    color: #2d2251;
    font-size: 1.25rem;
    font-weight: 900;
    line-height: 1.15;
  }

  .mobile-slip-card__identity small {
    color: #75658c;
    font-size: 0.73rem;
    font-weight: 600;
  }

  .mobile-slip-card__status-side {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
  }

  .mobile-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    max-width: 10.5rem;
    padding: 0.38rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.1;
    white-space: nowrap;
  }

  .mobile-status-pill svg,
  .mobile-slip-member svg,
  .mobile-slip-payment-method svg,
  .mobile-slip-data-block > strong > svg,
  .mobile-slip-view-btn svg,
  .mobile-completed-strip svg {
    flex: 0 0 auto;
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .mobile-slip-card__chevron {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: #7a6b90;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
    transition: transform 0.2s ease;
  }

  .mobile-slip-card__chevron.is-open {
    transform: rotate(180deg);
  }

  .mobile-slip-card__body {
    padding: 0 0.85rem 0.85rem;
  }

  .mobile-slip-divider {
    height: 1px;
    margin: 0 0 0.7rem;
    background: #eee8f4;
  }

  .mobile-slip-order-member {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
    align-items: center;
  }

  .mobile-slip-order,
  .mobile-slip-member {
    min-width: 0;
  }

  .mobile-slip-order {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.28rem;
    color: #8c7b9d;
    font-size: 0.92rem;
  }

  .mobile-slip-order strong {
    color: #2d2251;
    font-size: 1.02rem;
    font-weight: 900;
  }

  .mobile-slip-member {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .mobile-slip-member svg {
    width: 1.45rem;
    height: 1.45rem;
    color: #756494;
  }

  .mobile-slip-member span {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .mobile-slip-member strong,
  .mobile-slip-member small {
    overflow-wrap: anywhere;
  }

  .mobile-slip-member strong {
    color: #45315f;
    font-size: 0.82rem;
    line-height: 1.2;
  }

  .mobile-slip-member small {
    color: #8c7b9d;
    font-size: 0.68rem;
  }

  .mobile-slip-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0.7rem 0 0.85rem;
  }

  .mobile-order-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.1;
  }

  .mobile-order-badge--preorder {
    background: #ffe9d5;
    color: #aa6230;
  }

  .mobile-order-badge--import {
    background: #f0e4ff;
    color: #6d429d;
  }

  .mobile-order-badge--order-fee {
    background: #eef9f1;
    color: #39805a;
  }

  .mobile-slip-two-column-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .mobile-slip-data-block {
    min-width: 0;
    padding-right: 0.6rem;
    border-right: 1px solid #eee8f4;
  }

  .mobile-slip-data-block:last-child {
    padding-right: 0;
    border-right: 0;
  }

  .mobile-slip-data-block > span {
    display: block;
    margin-bottom: 0.28rem;
    color: #89799a;
    font-size: 0.73rem;
    font-weight: 600;
  }

  .mobile-slip-data-block > strong {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.32rem;
    color: #4c3a66;
    font-size: 0.78rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .mobile-slip-data-block > strong svg {
    color: #72638b;
  }

  .mobile-slip-data-block .mobile-slip-amount {
    color: #302252;
    font-size: 1.15rem;
    font-weight: 900;
  }

  .mobile-slip-payment-method strong {
    color: #57466e;
  }

  .mobile-slip-proof-row {
    align-items: start;
  }

  .mobile-slip-proof-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .mobile-slip-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 2rem;
    padding: 0.35rem 0.65rem;
    border: 1px solid #d8c1f3;
    border-radius: 999px;
    background: #f3e8ff;
    color: #71469e;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .mobile-slip-view-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .mobile-slip-card__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.85rem;
  }

  .mobile-slip-card__actions .btn-approve,
  .mobile-slip-card__actions .btn-reject {
    min-height: 2.4rem;
    padding: 0.45rem 0.5rem;
    font-size: 0.76rem;
  }

  .mobile-completed-strip {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.35rem;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    background: #f2eaff;
    color: #70469b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .mobile-completed-strip svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  .empty-state {
    border-radius: 16px;
    background: #fff;
    font-size: 0.82rem;
  }
}
</style>
