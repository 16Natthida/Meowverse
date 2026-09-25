<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const router = useRouter()
const latestProducts = ref([])
const productImageMap = ref(new Map())
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
  await hydrateLatestProductImages()
}

async function hydrateLatestProductImages() {
  try {
    const response = await fetch(`${API_BASE_URL}/products`)
    if (!response.ok) return

    const products = await response.json()
    const imageMap = new Map()
    for (const product of Array.isArray(products) ? products : []) {
      const images = Array.isArray(product.imageUrls)
        ? product.imageUrls
        : Array.isArray(product.images)
          ? product.images.map((image) => (typeof image === 'string' ? image : image?.url))
          : []
      const firstImage = images.find(Boolean)
      if (firstImage) imageMap.set(product.id ?? product.prod_id, firstImage)
    }
    productImageMap.value = imageMap
    latestProducts.value = latestProducts.value.map((product) => ({
      ...product,
      imageUrl: product.imageUrl || imageMap.get(product.id) || '',
    }))
  } catch (error) {
    console.warn('โหลดรูปสินค้าล่าสุดไม่สำเร็จ:', error)
  }
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

function resolveProductImage(product) {
  const value = product?.imageUrl || productImageMap.value.get(product?.id) || ''
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }
  return `/${url}`
}

function paymentTypeLabel(payment) {
  if (payment?.type === 'Import_Fee') return 'Import pay'
  if (payment?.type === 'Order_fee') return 'Ready pay'
  return payment?.type || payment?.Order_type || '-'
}

function paymentMethodLabel(payment) {
  return (
    {
      bank_transfer: 'โอนธนาคาร',
      promptpay: 'Thai QR Payment',
    }[payment?.payment_method] ||
    payment?.payment_method ||
    '-'
  )
}

function openLatestProduct(product) {
  if (product?.id) {
    router.push({ path: '/admin/products', query: { product: String(product.id) } })
    return
  }
  router.push('/admin/products')
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
    <AdminPageHeader title="แดชบอร์ด" description="ภาพรวมคำสั่งซื้อ สินค้า และรายได้ของร้าน" />
    <!-- Hero removed per request -->

    <section class="kpi-grid">
      <article class="kpi-card kpi-card--highlight">
        <span class="mobile-kpi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 5h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 9H7" />
            <circle cx="10" cy="20" r="1.2" />
            <circle cx="18" cy="20" r="1.2" />
          </svg>
        </span>
        <p class="kpi-label">คำสั่งซื้อทั้งหมด</p>
        <p class="kpi-value">{{ formatNumber(kpi.orderCount) }} รายการ</p>
        <p class="kpi-footnote">นับจากตารางคำสั่งซื้อจริงถ้ามีในฐานข้อมูล</p>
      </article>

      <article class="kpi-card">
        <span class="mobile-kpi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <ellipse cx="12" cy="5" rx="7" ry="2.8" />
            <path d="M5 5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V5M5 11v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
          </svg>
        </span>
        <p class="kpi-label">มูลค่าสต็อกทั้งหมด</p>
        <p class="kpi-value">{{ formatCurrency(kpi.inventoryValue) }}</p>
        <p class="kpi-footnote">คำนวณจาก stock x base price</p>
      </article>

      <article class="kpi-card">
        <span class="mobile-kpi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="m4 8 8-4 8 4-8 4-8-4Z" />
            <path d="m4 8v8l8 4 8-4V8M12 12v8" />
          </svg>
        </span>
        <p class="kpi-label">สินค้าในระบบ</p>
        <p class="kpi-value">{{ formatNumber(kpi.totalProducts) }} รายการ</p>
        <p class="kpi-footnote">พร้อมใช้งานในฐานข้อมูล</p>
      </article>

      <article class="kpi-card">
        <span class="mobile-kpi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="m4 7 7.5-3 8.5 3-7.5 3L4 7Z" />
            <path d="M4 7v7l8.5 3 7.5-3V7M12.5 10v7" />
          </svg>
          <span class="mobile-kpi-tag-cut"></span>
        </span>
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

    <section class="panel table-panel latest-products-panel">
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

      <div v-if="latestProducts.length" class="mobile-latest-products">
        <button
          v-for="product in latestProducts"
          :key="`mobile-product-${product.id}`"
          type="button"
          class="mobile-latest-product-row"
          @click="openLatestProduct(product)"
        >
          <span class="mobile-latest-product-thumb">
            <img
              v-if="resolveProductImage(product)"
              :src="resolveProductImage(product)"
              :alt="product.name || 'สินค้า'"
            />
            <span v-else aria-hidden="true">📦</span>
          </span>
          <span class="mobile-latest-product-copy">
            <strong>#{{ product.id }}</strong>
            <span class="mobile-latest-product-name">{{ product.name || '-' }}</span>
            <small>หมวดหมู่: {{ product.categoryName || '-' }}</small>
          </span>
          <span class="mobile-latest-product-side">
            <span :class="resolveStockStatusClass(product)">{{ resolveStockStatusText(product) }}</span>
            <strong>{{ formatCurrency(product.basePrice) }}</strong>
          </span>
        </button>
      </div>
      <p v-else-if="!isLoading" class="mobile-dashboard-empty">ยังไม่มีสินค้าใหม่</p>
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
              <td>#{{ String(pay.order_id).padStart(3, '0') }}</td>
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

      <div v-if="payments.length" class="mobile-payment-list">
        <article v-for="pay in payments" :key="`mobile-payment-${pay.pay_id}`" class="mobile-payment-row">
          <button type="button" class="mobile-payment-main" @click="openSlip(pay)">
            <span class="mobile-payment-identifiers">
              <strong>#{{ pay.pay_id }}</strong>
              <span>ออเดอร์ #{{ String(pay.order_id).padStart(3, '0') }}</span>
            </span>
            <span class="mobile-payment-details">
              <span>{{ paymentTypeLabel(pay) }}</span>
              <strong>฿{{ Number(pay.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }}</strong>
              <span>{{ paymentMethodLabel(pay) }}</span>
              <small>{{ formatDate(pay.Slip_date) }}</small>
            </span>
            <span class="mobile-payment-status-side">
              <span
                class="status-pill"
                :style="{
                  color: (statusLabel[pay.status] || {}).color || '#888',
                  background: (statusLabel[pay.status] || {}).bg || '#f5f5f5',
                }"
              >
                {{ (statusLabel[pay.status] || {}).text || pay.status }}
              </span>
              <span class="mobile-payment-slip-button">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <rect x="3.5" y="4" width="17" height="16" rx="2" />
                  <circle cx="9" cy="9" r="1.5" />
                  <path d="m5.5 17 4.5-4.5 3 3 2-2 3.5 3.5" />
                </svg>
                ดูสลิป
              </span>
            </span>
            <svg class="mobile-payment-chevron" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </article>
      </div>
      <p v-else-if="!slipLoading" class="mobile-dashboard-empty">ยังไม่มีรายการสลิปที่ต้องตรวจสอบ</p>
    </section>

    <!-- SLIP MODAL -->
    <transition name="fade">
      <div v-if="selectedSlip" class="slip-modal-overlay" @click.self="closeSlip">
        <div class="slip-modal">
          <div class="slip-modal-head">
            <h3>สลิปออเดอร์ #{{ String(selectedSlip.order_id).padStart(3, '0') }}</h3>
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
.mobile-kpi-icon,
.mobile-latest-products,
.mobile-payment-list {
  display: none;
}

@media (max-width: 767px) {
  .home-page {
    gap: 0.7rem;
    min-width: 0;
  }

  .home-page > .admin-page-heading {
    margin-bottom: 0;
    padding: 1rem;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(87, 63, 122, 0.06);
  }

  .home-page > .admin-page-heading h1 {
    color: #2f2355;
    font-size: 1.45rem;
    line-height: 1.3;
  }

  .home-page > .admin-page-heading p {
    margin-top: 0.35rem;
    color: #76658e;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .kpi-card {
    display: grid;
    grid-template-columns: 2.45rem minmax(0, 1fr);
    column-gap: 0.55rem;
    align-items: start;
    min-width: 0;
    min-height: 8.1rem;
    padding: 0.75rem;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 5px 15px rgba(87, 63, 122, 0.07);
  }

  .mobile-kpi-icon {
    display: grid;
    grid-row: 1 / span 3;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border-radius: 12px;
    background: #f1e8ff;
    color: #8a4de0;
  }

  .mobile-kpi-icon svg {
    width: 1.35rem;
    height: 1.35rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .kpi-label {
    min-width: 0;
    color: #755b91;
    font-size: 0.7rem;
    line-height: 1.25;
  }

  .kpi-value {
    min-width: 0;
    margin-top: 0.15rem;
    color: #302252;
    font-size: clamp(0.95rem, 4.7vw, 1.25rem);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .kpi-footnote {
    min-width: 0;
    margin-top: 0.2rem;
    color: #9282a9;
    font-size: 0.65rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 0.7rem;
  }

  .panel {
    min-width: 0;
    padding: 0.85rem;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(87, 63, 122, 0.06);
  }

  .panel-head {
    align-items: flex-start;
    gap: 0.45rem;
    margin-bottom: 0.65rem;
  }

  .panel-head h3 {
    color: #302252;
    font-size: 1rem;
    line-height: 1.25;
  }

  .panel-head p {
    margin-top: 0.25rem;
    color: #86769d;
    font-size: 0.72rem;
    line-height: 1.35;
  }

  .panel-chip {
    padding: 0.3rem 0.55rem;
    font-size: 0.68rem;
  }

  .donut-layout {
    grid-template-columns: minmax(135px, 0.9fr) minmax(0, 1.1fr);
    gap: 0.55rem;
    min-height: 0;
  }

  .donut-chart {
    width: min(154px, 42vw);
  }

  .donut-chart__center strong {
    font-size: clamp(0.92rem, 4vw, 1.2rem);
  }

  .donut-chart__center span {
    font-size: 0.65rem;
  }

  .donut-legend {
    gap: 0.3rem;
  }

  .donut-legend__row {
    grid-template-columns: 0.45rem minmax(0, 1fr) auto;
    gap: 0.3rem;
    padding: 0.3rem 0.25rem;
  }

  .donut-legend__label {
    font-size: 0.68rem;
    line-height: 1.25;
    white-space: normal;
  }

  .donut-legend__row strong {
    font-size: 0.66rem;
  }

  .latest-products-panel .table-scroll,
  .slip-section .table-scroll {
    display: none;
  }

  .latest-products-panel,
  .slip-section {
    overflow: visible;
  }

  .mobile-latest-products,
  .mobile-payment-list {
    display: grid;
    gap: 0.45rem;
  }

  .mobile-latest-product-row {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 0.45rem;
    border: 1px solid #e7d9f4;
    border-radius: 13px;
    background: #fff;
    color: #4d3968;
    text-align: left;
    cursor: pointer;
  }

  .mobile-latest-product-row:focus-visible,
  .mobile-payment-main:focus-visible {
    outline: 3px solid rgba(183, 136, 234, 0.3);
    outline-offset: 2px;
  }

  .mobile-latest-product-thumb {
    display: grid;
    width: 3.25rem;
    height: 3.25rem;
    place-items: center;
    overflow: hidden;
    border-radius: 11px;
    background: #f2edf8;
    color: #9a82b6;
    font-size: 1.35rem;
  }

  .mobile-latest-product-thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mobile-latest-product-copy,
  .mobile-latest-product-side {
    display: grid;
    min-width: 0;
  }

  .mobile-latest-product-copy {
    gap: 0.08rem;
  }

  .mobile-latest-product-copy > strong {
    color: #786798;
    font-size: 0.7rem;
  }

  .mobile-latest-product-name {
    display: -webkit-box;
    overflow: hidden;
    color: #3c2c5a;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .mobile-latest-product-copy small {
    overflow: hidden;
    color: #89799e;
    font-size: 0.66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-latest-product-side {
    justify-items: end;
    gap: 0.28rem;
  }

  .mobile-latest-product-side .status {
    padding: 0.28rem 0.45rem;
    font-size: 0.62rem;
    white-space: nowrap;
  }

  .mobile-latest-product-side > strong {
    color: #36245b;
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .mobile-payment-row {
    min-width: 0;
    border: 1px solid #e7d9f4;
    border-radius: 13px;
    background: #fff;
  }

  .mobile-payment-main {
    display: grid;
    grid-template-columns: 3.6rem minmax(0, 1fr) auto 0.8rem;
    gap: 0.45rem;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 0.65rem 0.55rem;
    border: 0;
    border-radius: 13px;
    background: transparent;
    color: #4d3968;
    text-align: left;
    cursor: pointer;
  }

  .mobile-payment-identifiers,
  .mobile-payment-details,
  .mobile-payment-status-side {
    display: grid;
    min-width: 0;
  }

  .mobile-payment-identifiers {
    gap: 0.25rem;
  }

  .mobile-payment-identifiers strong {
    color: #302252;
    font-size: 0.95rem;
  }

  .mobile-payment-identifiers span,
  .mobile-payment-details span,
  .mobile-payment-details small {
    overflow: hidden;
    color: #81719a;
    font-size: 0.64rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-payment-details {
    gap: 0.08rem;
  }

  .mobile-payment-details strong {
    color: #3b285d;
    font-size: 0.78rem;
    line-height: 1.25;
  }

  .mobile-payment-status-side {
    justify-items: end;
    gap: 0.32rem;
  }

  .mobile-payment-status-side .status-pill {
    padding: 0.3rem 0.45rem;
    font-size: 0.62rem;
    white-space: nowrap;
  }

  .mobile-payment-slip-button {
    display: inline-flex;
    align-items: center;
    gap: 0.18rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid #d9c3f1;
    border-radius: 999px;
    background: #f5ecff;
    color: #70469b;
    font-size: 0.63rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .mobile-payment-slip-button svg {
    width: 0.8rem;
    height: 0.8rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .mobile-payment-chevron {
    width: 0.85rem;
    height: 0.85rem;
    fill: none;
    stroke: #7f6c9e;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .mobile-dashboard-empty {
    margin: 0;
    padding: 0.8rem;
    color: #8775a4;
    font-size: 0.78rem;
    text-align: center;
  }
}

@media (max-width: 360px) {
  .donut-layout {
    grid-template-columns: 1fr;
  }

  .donut-chart {
    width: min(160px, 58vw);
  }

  .mobile-payment-main {
    grid-template-columns: 3.25rem minmax(0, 1fr) auto 0.65rem;
    gap: 0.3rem;
    padding-inline: 0.4rem;
  }

  .mobile-payment-status-side .status-pill {
    max-width: 4.7rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
