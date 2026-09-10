<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const latestProducts = ref([])
const dashboardData = ref(null)
const isLoading = ref(false)
const error = ref('')
let refreshTimerId = null

const kpi = computed(() => {
  return (
    dashboardData.value?.kpi || {
      totalProducts: 0,
      totalCategories: 0,
      totalStockUnits: 0,
      inventoryValue: 0,
      lowStockCount: 0,
      severeLowStockCount: 0,
      orderCount: 0,
    }
  )
})

const thresholds = computed(() => {
  return (
    dashboardData.value?.thresholds || {
      lowStock: 8,
      severeLowStock: 2,
    }
  )
})

const chartColors = ['#a66de6', '#ff93b8', '#42c9a1', '#ffb45e', '#6ea8e6', '#d58be8']

function buildDonutChart(rows) {
  const normalizedRows = rows
    .map((row) => ({ label: row.label || '-', value: Number(row.value) || 0 }))
    .filter((row) => row.value > 0)
  const total = normalizedRows.reduce((sum, row) => sum + row.value, 0)

  if (!total) {
    return { total: 0, rows: [], gradient: '#f0e7fa' }
  }

  let cursor = 0
  const chartRows = normalizedRows.map((row, index) => {
    const percent = (row.value / total) * 100
    const start = cursor
    cursor += percent
    return {
      ...row,
      percent,
      start,
      color: chartColors[index % chartColors.length],
    }
  })

  const segments = chartRows.map((row) => `${row.color} ${row.start}% ${row.start + row.percent}%`)

  return {
    total,
    rows: chartRows,
    gradient: `conic-gradient(${segments.join(', ')})`,
  }
}

const stockChart = computed(() =>
  buildDonutChart(dashboardData.value?.charts?.byCategoryStock || []),
)

const revenueChart = computed(() =>
  buildDonutChart(dashboardData.value?.charts?.byOrderTypeRevenue || []),
)

function formatCurrency(amount) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)
}

function formatNumber(numberValue) {
  return new Intl.NumberFormat('th-TH').format(Number(numberValue) || 0)
}

function resolveStockStatusClass(product) {
  const stock = Number(product.stock) || 0
  if (stock <= thresholds.value.severeLowStock) {
    return 'status status--critical'
  }
  if (stock <= thresholds.value.lowStock) {
    return 'status status--pending'
  }
  return 'status status--paid'
}

function resolveStockStatusText(product) {
  const stock = Number(product.stock) || 0
  if (stock <= thresholds.value.severeLowStock) {
    return 'ใกล้หมดมาก'
  }
  if (stock <= thresholds.value.lowStock) {
    return 'ใกล้หมด'
  }
  return 'ปกติ'
}

async function fetchDashboardOverview() {
  const user = JSON.parse(
    localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user') || '{}',
  )
  const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
    headers: {
      'x-user-role': user.role || 'admin',
      'x-user-id': String(user.id || ''),
    },
  })
  if (!response.ok) {
    throw new Error(`โหลดข้อมูลแดชบอร์ดไม่สำเร็จ (${response.status})`)
  }

  const data = await response.json()
  dashboardData.value = data
  latestProducts.value = Array.isArray(data.latestProducts) ? data.latestProducts : []
}

async function loadDashboardData() {
  isLoading.value = true
  error.value = ''

  try {
    await fetchDashboardOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดขณะโหลดข้อมูล'
  } finally {
    isLoading.value = false
  }
}

// ── SLIP MANAGEMENT ──
const payments = ref([])
const slipLoading = ref(false)
const slipError = ref('')
const selectedSlip = ref(null)

const statusLabel = {
  Pending: { text: 'รอตรวจสอบ', color: '#f59e0b', bg: '#fffbeb' },
  Approved: { text: 'อนุมัติแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Rejected: { text: 'ปฏิเสธ', color: '#ef4444', bg: '#fef2f2' },
}

async function fetchPayments() {
  slipLoading.value = true
  slipError.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/payments`)
    if (!res.ok) throw new Error('โหลดข้อมูลสลิปไม่สำเร็จ')
    payments.value = await res.json()
  } catch (err) {
    slipError.value = err.message
  } finally {
    slipLoading.value = false
  }
}

async function updatePaymentStatus(payId, status) {
  if (status === 'Rejected') {
    const confirmed = window.confirm('ยืนยันปฏิเสธสลิปนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้')
    if (!confirmed) return
  }

  try {
    const res = await fetch(`${API_BASE_URL}/payments/${payId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ')
    await fetchPayments()
    selectedSlip.value = null
  } catch (err) {
    slipError.value = err.message
  }
}

function openSlip(payment) {
  selectedSlip.value = payment
}

function closeSlip() {
  selectedSlip.value = null
}

function resolveSlipUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadDashboardData()
  fetchPayments()
  refreshTimerId = window.setInterval(loadDashboardData, 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  if (refreshTimerId !== null) {
    window.clearInterval(refreshTimerId)
    refreshTimerId = null
  }
})
</script>

<template>
  <div class="home-page">
    <!-- Hero removed per request -->

    <section class="kpi-grid">
      <article class="kpi-card kpi-card--highlight">
        <p class="kpi-label">คำสั่งซื้อทั้งหมด</p>
        <p class="kpi-value">{{ formatNumber(kpi.orderCount) }} รายการ</p>
        <p class="kpi-footnote">นับจากตารางคำสั่งซื้อจริงถ้ามีในฐานข้อมูล</p>
      </article>

      <article class="kpi-card">
        <p class="kpi-label">มูลค่าสต็อกทั้งหมด</p>
        <p class="kpi-value">{{ formatCurrency(kpi.inventoryValue) }}</p>
        <p class="kpi-footnote">คำนวณจาก stock x base price</p>
      </article>

      <article class="kpi-card">
        <p class="kpi-label">สินค้าในระบบ</p>
        <p class="kpi-value">{{ formatNumber(kpi.totalProducts) }} รายการ</p>
        <p class="kpi-footnote">พร้อมใช้งานในฐานข้อมูล</p>
      </article>

      <article class="kpi-card">
        <p class="kpi-label">หมวดหมู่สินค้า</p>
        <p class="kpi-value">{{ formatNumber(kpi.totalCategories) }} หมวด</p>
        <p class="kpi-footnote">จำนวนหมวดหมู่ทั้งหมด</p>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel insight-panel">
        <header class="panel-head">
          <div>
            <h3>สัดส่วนสต็อกตามหมวดหมู่</h3>
            <p>ดูว่าสินค้าคงเหลืออยู่ในหมวดใดมากที่สุด</p>
          </div>
          <span class="panel-chip">ทั้งหมด {{ formatNumber(stockChart.total) }} ชิ้น</span>
        </header>

        <div v-if="stockChart.rows.length === 0" class="chart-empty">
          ยังไม่มีข้อมูลสต็อก
        </div>
        <div v-else class="donut-layout">
          <div
            class="donut-chart"
            :style="{ '--donut-background': stockChart.gradient }"
            role="img"
            aria-label="สัดส่วนสต็อกตามหมวดหมู่"
          >
            <div class="donut-chart__center">
              <strong>{{ formatNumber(stockChart.total) }}</strong>
              <span>ชิ้น</span>
            </div>
          </div>

          <div class="donut-legend" role="list">
            <div v-for="row in stockChart.rows" :key="row.label" class="donut-legend__row" role="listitem">
              <span class="donut-legend__color" :style="{ background: row.color }" />
              <span class="donut-legend__label">{{ row.label }}</span>
              <strong>{{ formatNumber(row.value) }} ชิ้น</strong>
            </div>
          </div>
        </div>
      </article>

      <article class="panel insight-panel">
        <header class="panel-head">
          <div>
            <h3>รายได้แยกตามประเภทออเดอร์</h3>
            <p>ยอดรวมของออเดอร์ที่ชำระเงินแล้ว แยกเป็นพร้อมส่งและพรีออเดอร์</p>
          </div>
          <span class="panel-chip">{{ revenueChart.rows.length }} ประเภท</span>
        </header>

        <div v-if="revenueChart.rows.length === 0" class="chart-empty">
          ยังไม่มีข้อมูลรายได้ของออเดอร์ที่ชำระเงินแล้ว
        </div>
        <div v-else class="donut-layout">
          <div
            class="donut-chart donut-chart--revenue"
            :style="{ '--donut-background': revenueChart.gradient }"
            role="img"
            aria-label="รายได้แยกตามประเภทออเดอร์"
          >
            <div class="donut-chart__center">
              <strong>{{ formatCurrency(revenueChart.total) }}</strong>
              <span>รายได้รวม</span>
            </div>
          </div>

          <div class="donut-legend" role="list">
            <div v-for="row in revenueChart.rows" :key="row.label" class="donut-legend__row" role="listitem">
              <span class="donut-legend__color" :style="{ background: row.color }" />
              <span class="donut-legend__label">{{ row.label }}</span>
              <strong>{{ formatCurrency(row.value) }}</strong>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="panel table-panel">
      <header class="panel-head panel-head--stack">
        <h3>สินค้าเพิ่มล่าสุด</h3>
        <p>อ้างอิงรายการสินค้าล่าสุดจากฐานข้อมูล</p>
      </header>

      <div class="table-scroll">
        <table class="latest-products-table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า</th>
              <th>หมวดหมู่</th>
              <th>สถานะ</th>
              <th>ราคา</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in latestProducts" :key="product.id">
              <td>#{{ product.id }}</td>
              <td>{{ product.name }}</td>
              <td>{{ product.categoryName }}</td>
              <td>
                <span :class="resolveStockStatusClass(product)">{{
                  resolveStockStatusText(product)
                }}</span>
              </td>
              <td>{{ formatCurrency(product.basePrice) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ───── SLIP MANAGEMENT ───── -->
    <section class="panel table-panel slip-section">
      <header class="panel-head panel-head--stack">
        <h3>💳 จัดการสลิปการชำระเงิน</h3>
        <p>ตรวจสอบและอนุมัติหลักฐานการโอนเงินจากลูกค้า</p>
      </header>

      <div v-if="slipError" class="error-banner">{{ slipError }}</div>
      <p v-if="slipLoading" class="loading-message">กำลังโหลดข้อมูล...</p>

      <div v-else-if="payments.length === 0" class="empty-state">
        <p>ยังไม่มีรายการสลิปที่ต้องตรวจสอบ</p>
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
              <th>สลิป</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pay in payments" :key="pay.pay_id">
              <td>#{{ pay.pay_id }}</td>
              <td>#{{ pay.order_id }}</td>
              <td>{{ pay.type }}</td>
              <td>
                ฿{{ Number(pay.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }}
              </td>
              <td>{{ pay.payment_method || '-' }}</td>
              <td>{{ formatDate(pay.Slip_date) }}</td>
              <td>
                <span
                  class="status-pill"
                  :style="{
                    color: (statusLabel[pay.status] || {}).color || '#888',
                    background: (statusLabel[pay.status] || {}).bg || '#f5f5f5',
                  }"
                >
                  {{ (statusLabel[pay.status] || {}).text || pay.status }}
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
                  <button class="btn-approve" @click="updatePaymentStatus(pay.pay_id, 'Approved')">
                    ✓ อนุมัติ
                  </button>
                  <button class="btn-reject" @click="updatePaymentStatus(pay.pay_id, 'Rejected')">
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

    <!-- SLIP MODAL -->
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
            <button
              class="btn-approve"
              @click="updatePaymentStatus(selectedSlip.pay_id, 'Approved')"
            >
              ✓ อนุมัติ
            </button>
            <button
              class="btn-reject"
              @click="updatePaymentStatus(selectedSlip.pay_id, 'Rejected')"
            >
              ✕ ปฏิเสธ
            </button>
          </div>
          <div class="slip-modal-foot" v-else>
            <span
              class="status-pill"
              :style="{
                color: (statusLabel[selectedSlip.status] || {}).color,
                background: (statusLabel[selectedSlip.status] || {}).bg,
              }"
            >
              {{ (statusLabel[selectedSlip.status] || {}).text }}
            </span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.home-page {
  --panel-bg: rgba(255, 255, 255, 0.88);
  --panel-border: #e8dcf3;
  --text-main: #432f61;
  --text-muted: #7a6a96;
  --pink: #ff93b8;
  --grape: #a66de6;
  --mint: #42c9a1;
  --warn: #ff9e5e;

  display: grid;
  gap: 1rem;
}

.hero-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1.2rem;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background:
    radial-gradient(circle at right top, rgba(255, 147, 184, 0.32), transparent 52%),
    radial-gradient(circle at left 5% bottom 10%, rgba(166, 109, 230, 0.2), transparent 44%),
    var(--panel-bg);
}

.eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  font-weight: 800;
  color: #9b7bc2;
  margin-bottom: 0.3rem;
}

.hero-copy h2 {
  color: var(--text-main);
  line-height: 1.18;
  font-size: clamp(1.2rem, 2vw, 1.7rem);
  font-weight: 900;
}

.hero-copy p {
  margin-top: 0.45rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.hero-btn {
  border-radius: 999px;
  padding: 0.46rem 0.92rem;
  font-weight: 700;
  font-size: 0.8rem;
}

.hero-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #b673ee, #ff93b8);
  box-shadow: 0 10px 16px rgba(182, 115, 238, 0.2);
}

.hero-btn--ghost {
  color: #6f5196;
  border: 1px solid #e2d2f3;
  background: #fff;
}

.banner-panel {
  display: grid;
  gap: 0.9rem;
}

.banner-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.95fr) minmax(260px, 1.05fr);
  gap: 0.9rem;
  align-items: stretch;
}

.banner-preview {
  border-radius: 16px;
  border: 1px solid #e8dcf3;
  overflow: hidden;
  background: linear-gradient(160deg, #fff, #f5edff);
  min-height: 220px;
}

.banner-preview img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 220px;
  object-fit: cover;
}

.banner-controls {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.field {
  display: grid;
  gap: 0.35rem;
  color: #7b66a0;
  font-size: 0.8rem;
  font-weight: 700;
}

.field input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #e2d2f3;
  background: #fff;
  color: #4a355e;
  padding: 0.72rem 0.85rem;
  font-size: 0.85rem;
}

.hidden-input {
  display: none;
}

.banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.banner-note {
  margin: 0;
  color: #8d7cad;
  font-size: 0.78rem;
}

.banner-note--error {
  color: #b4452f;
}

.banner-note--success {
  color: #277a62;
}

.kpi-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.kpi-card {
  border-radius: 15px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  padding: 0.9rem;
}

.kpi-card--highlight {
  background:
    radial-gradient(circle at right top, rgba(255, 180, 206, 0.35), transparent 48%),
    linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(247, 239, 255, 0.95));
  border-color: #dbc8f4;
}

.kpi-label {
  font-size: 0.76rem;
  color: #8d7aad;
  font-weight: 700;
}

.kpi-value {
  margin-top: 0.2rem;
  font-size: clamp(1.05rem, 2.5vw, 1.65rem);
  color: var(--text-main);
  font-weight: 900;
}

.kpi-footnote {
  margin-top: 0.18rem;
  color: #9f91b5;
  font-size: 0.74rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 0.85rem;
}

.panel {
  border-radius: 16px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  padding: 0.95rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: center;
  margin-bottom: 0.8rem;
}

.panel-head--stack {
  display: grid;
}

.panel-head h3 {
  color: var(--text-main);
  font-size: 1rem;
  font-weight: 850;
}

.panel-head p {
  color: #8d7cad;
  font-size: 0.8rem;
}

.panel-kpi-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}

.mini-metric {
  border-radius: 14px;
  padding: 0.75rem 0.85rem;
  border: 1px solid #eadff5;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.92));
}

.mini-metric span {
  display: block;
  font-size: 0.72rem;
  color: #8b79a8;
  font-weight: 700;
  line-height: 1.2;
}

.mini-metric strong {
  display: block;
  margin-top: 0.22rem;
  font-size: 1.2rem;
  line-height: 1;
  color: #3f2f5d;
  font-weight: 900;
}

.mini-metric--orders {
  border-color: #dbc8f4;
  background: linear-gradient(160deg, #fff 0%, #f5edff 100%);
}

.mini-metric--stock {
  border-color: #d6ebff;
  background: linear-gradient(160deg, #fff 0%, #eef7ff 100%);
}

.insight-panel {
  min-width: 0;
}

.panel-chip {
  flex: 0 0 auto;
  border: 1px solid #e2d2f3;
  border-radius: 999px;
  padding: 0.3rem 0.62rem;
  color: #76529b;
  background: #f8f0ff;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.donut-layout {
  display: grid;
  grid-template-columns: minmax(145px, 0.9fr) minmax(0, 1.1fr);
  align-items: center;
  gap: 1rem;
  min-height: 220px;
}

.donut-chart {
  position: relative;
  width: min(210px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  background: var(--donut-background);
  box-shadow: 0 10px 24px rgba(109, 70, 147, 0.1);
}

.donut-chart::after {
  position: absolute;
  inset: 22%;
  content: '';
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 1px #f0e5f8;
}

.donut-chart__center {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
}

.donut-chart__center strong {
  color: #4d3271;
  font-size: clamp(1rem, 2vw, 1.45rem);
  font-weight: 900;
  line-height: 1.1;
}

.donut-chart__center span {
  margin-top: 0.18rem;
  color: #8d7aad;
  font-size: 0.72rem;
  font-weight: 700;
}

.donut-legend {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}

.donut-legend__row {
  display: grid;
  grid-template-columns: 0.55rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.42rem 0.5rem;
  border-radius: 9px;
  background: #fcf9ff;
}

.donut-legend__color {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}

.donut-legend__label {
  overflow: hidden;
  color: #5d467e;
  font-size: 0.75rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.donut-legend__row strong {
  color: #4d3271;
  font-size: 0.73rem;
  white-space: nowrap;
}

.chart-empty {
  padding: 1.25rem;
  border: 1px dashed #dfcdf1;
  border-radius: 12px;
  color: #8e7cad;
  font-size: 0.82rem;
  text-align: center;
}

.summary-row {
  display: grid;
  gap: 0.55rem;
}

.summary-card {
  border-radius: 12px;
  background: #f6efff;
  border: 1px solid #ead9fa;
  padding: 0.72rem;
}

.summary-card p {
  color: #7b66a0;
  font-size: 0.76rem;
}

.summary-card strong {
  display: block;
  color: #492e69;
  font-size: 1.65rem;
  line-height: 1.1;
  margin-top: 0.15rem;
}

.summary-card--critical {
  background: #fff0eb;
  border-color: #ffd8cb;
}

.summary-card--critical strong {
  color: #b4452f;
}

.error-banner {
  margin-bottom: 0.6rem;
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  color: #aa4734;
  background: #fff1ed;
  border: 1px solid #ffd8cc;
  font-size: 0.8rem;
}

.table-panel {
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 700px;
  border-collapse: collapse;
}

th,
td {
  padding: 0.58rem 0.45rem;
  border-bottom: 1px solid #eee7f7;
  text-align: left;
  font-size: 0.8rem;
}

th {
  color: #826ea1;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td {
  color: #4d3968;
}

.status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-weight: 700;
  font-size: 0.72rem;
}

.status--pending {
  background: #ffe7d5;
  color: #b55a1f;
}

.status--paid {
  background: #ddf7ee;
  color: #277a62;
}

.status--shipping {
  background: #dbecff;
  color: #2f60a1;
}

.status--critical {
  background: #ffe1da;
  color: #bb4431;
}

.status--neutral {
  background: #ece8f6;
  color: #6d5d85;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.product-cell img,
.thumb-fallback {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
}

.product-cell img {
  object-fit: cover;
}

.thumb-fallback {
  display: grid;
  place-items: center;
  background: #efe5fb;
}

.loading-message,
.empty-state {
  padding: 0.8rem;
  text-align: center;
  font-size: 0.82rem;
  color: #8775a4;
}

@media (max-width: 1080px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .hero-panel {
    padding: 0.9rem;
  }

  .banner-layout {
    grid-template-columns: 1fr;
  }

  .panel-kpi-row {
    grid-template-columns: 1fr;
  }

  .donut-layout {
    grid-template-columns: 1fr;
    gap: 0.8rem;
    min-height: 0;
  }

  .donut-chart {
    width: min(170px, 62vw);
  }

  .donut-legend {
    gap: 0.35rem;
  }
}

@media (max-width: 720px) {
  .table-scroll {
    overflow: visible;
  }

  .table-scroll > table,
  .table-scroll > table thead,
  .table-scroll > table tbody,
  .table-scroll > table tr,
  .table-scroll > table td {
    display: block;
    width: 100%;
  }

  .table-scroll > table thead {
    display: none;
  }

  .table-scroll > table tr {
    margin-bottom: 0.7rem;
    padding: 0.7rem;
    border: 1px solid #eadcf6;
    border-radius: 12px;
    background: #fff;
  }

  .table-scroll > table td {
    display: flex;
    justify-content: space-between;
    gap: 0.65rem;
    padding: 0.4rem 0;
    border: 0;
    text-align: right;
  }

  .table-scroll > table td::before {
    flex: 0 0 auto;
    color: #8a789f;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
  }

  .latest-products-table td:nth-child(1)::before { content: 'รหัส'; }
  .latest-products-table td:nth-child(2)::before { content: 'สินค้า'; }
  .latest-products-table td:nth-child(3)::before { content: 'หมวดหมู่'; }
  .latest-products-table td:nth-child(4)::before { content: 'สถานะ'; }
  .latest-products-table td:nth-child(5)::before { content: 'ราคา'; }

  .slip-table td:nth-child(1)::before { content: 'รหัสชำระเงิน'; }
  .slip-table td:nth-child(2)::before { content: 'ออเดอร์'; }
  .slip-table td:nth-child(3)::before { content: 'ประเภท'; }
  .slip-table td:nth-child(4)::before { content: 'ยอดเงิน'; }
  .slip-table td:nth-child(5)::before { content: 'วิธีชำระ'; }
  .slip-table td:nth-child(6)::before { content: 'วันที่'; }
  .slip-table td:nth-child(7)::before { content: 'สถานะ'; }
  .slip-table td:nth-child(8)::before { content: 'สลิป'; }
  .slip-table td:nth-child(9)::before { content: 'จัดการ'; }

  .slip-table td:last-child {
    display: block;
    padding-top: 0.65rem;
  }

  .slip-table td:last-child::before {
    display: none;
  }

  .slip-table td:last-child .action-btns,
  .slip-table td:last-child button {
    width: 100%;
  }
}
/* ── SLIP SECTION ── */
.slip-section {
  overflow: visible;
}

.status-pill {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 10px;
}

.slip-view-btn {
  border: 1px solid #dbc8f4;
  background: #f8f2ff;
  color: #6f50a0;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.slip-view-btn:hover {
  background: #ede0ff;
}

.no-slip {
  color: #bbb;
  font-size: 0.78rem;
}

.action-btns {
  display: flex;
  gap: 6px;
}

.btn-approve {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-approve:hover {
  background: #d1fae5;
}

.btn-reject {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-reject:hover {
  background: #fee2e2;
}

.done-text {
  font-size: 0.78rem;
  color: #aaa;
}

/* SLIP MODAL */
.slip-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.slip-modal {
  background: #fff;
  border-radius: 18px;
  width: 480px;
  max-width: 95vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.slip-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #eadff5;
}
.slip-modal-head h3 {
  font-weight: 900;
  color: #3f2f5d;
}
.close-btn {
  background: #f5f0ff;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6f50a0;
}
.slip-modal-body {
  padding: 1rem;
  background: #fafafa;
  text-align: center;
}
.slip-img-full {
  max-width: 100%;
  max-height: 420px;
  border-radius: 10px;
  object-fit: contain;
}
.slip-modal-foot {
  padding: 1rem 1.25rem;
  border-top: 1px solid #eadff5;
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (max-width: 720px) {
  .table-scroll > table { min-width: 0; table-layout: fixed; }
  .table-scroll > table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .table-scroll > table td::before { max-width: 40%; }
  .table-scroll > table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
  .latest-products-table td > *, .slip-table td > * { max-width: 100%; }
}
</style>
