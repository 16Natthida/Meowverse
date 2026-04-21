<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const lowStockAlerts = ref([])
const latestProducts = ref([])
const dashboardData = ref(null)
const isLoading = ref(false)
const error = ref('')
const activeRange = ref('stock')

let refreshTimerId = null

const chartModes = {
  stock: {
    label: 'สต็อกต่อหมวด',
    chartKey: 'byCategoryStock',
  },
  value: {
    label: 'มูลค่าสต็อก',
    chartKey: 'byCategoryValue',
  },
  low: {
    label: 'สินค้าเสี่ยง',
    chartKey: 'byCategoryLowStock',
  },
}

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

const selectedChart = computed(() => {
  const mode = chartModes[activeRange.value] || chartModes.stock
  const rows = dashboardData.value?.charts?.[mode.chartKey] || []

  return {
    label: mode.label,
    rows,
  }
})

const maxChartValue = computed(() => {
  const values = selectedChart.value.rows.map((row) => Number(row.value) || 0)
  return Math.max(...values, 1)
})

const chartBars = computed(() => {
  return selectedChart.value.rows.map((row) => {
    const value = Number(row.value) || 0
    return {
      label: row.label,
      value,
      height: (value / maxChartValue.value) * 100,
    }
  })
})

function getImageOrFallback(product) {
  if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
    return product.imageUrls[0]
  }

  return ''
}

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

function formatChartValue(value) {
  if (activeRange.value === 'value') {
    return formatCurrency(value)
  }

  return formatNumber(value)
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

async function fetchLowStockAlerts() {
  const response = await fetch(`${API_BASE_URL}/products/alerts/low-stock?threshold=8`)
  if (!response.ok) {
    throw new Error(`โหลดข้อมูลแจ้งเตือนไม่สำเร็จ (${response.status})`)
  }
  lowStockAlerts.value = await response.json()
}

async function fetchDashboardOverview() {
  const response = await fetch(`${API_BASE_URL}/dashboard/overview`)
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
    await Promise.all([fetchLowStockAlerts(), fetchDashboardOverview()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดขณะโหลดข้อมูล'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadDashboardData()
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
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Meowverse Admin Console</p>
        <h2>แดชบอร์ดร้าน Pet Shop ที่ดูสถานะได้ครบในหน้าเดียว</h2>
        <p>
          ภาพรวมยอดขาย ออเดอร์ และสต็อกคงเหลือแบบเรียลไทม์ เพื่อให้ทีมแอดมินตัดสินใจได้ไว
          และไม่พลาดสินค้าขาดมือ
        </p>
      </div>

      <div class="hero-actions">
        <RouterLink class="hero-btn hero-btn--primary" to="/admin/products"
          >จัดการสินค้า</RouterLink
        >
        <a class="hero-btn hero-btn--ghost" href="#stock-alerts">ดูสต็อกใกล้หมด</a>
      </div>
    </section>

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

      <article class="kpi-card">
        <p class="kpi-label">สินค้าใกล้หมด</p>
        <p class="kpi-value">{{ formatNumber(kpi.lowStockCount) }} รายการ</p>
        <p class="kpi-footnote">สินค้าที่เหลือ &lt;= {{ thresholds.lowStock }} ชิ้น</p>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel panel--sales">
        <header class="panel-head">
          <div>
            <h3>ภาพรวมจากฐานข้อมูล</h3>
            <p>แสดงข้อมูล {{ selectedChart.label }}</p>
          </div>

          <div class="range-switch">
            <button
              v-for="range in ['stock', 'value', 'low']"
              :key="range"
              :class="['switch-btn', { 'switch-btn--active': activeRange === range }]"
              type="button"
              @click="activeRange = range"
            >
              {{ chartModes[range].label }}
            </button>
          </div>
        </header>

        <div class="panel-kpi-row">
          <div class="mini-metric mini-metric--orders">
            <span>คำสั่งซื้อทั้งหมด</span>
            <strong>{{ formatNumber(kpi.orderCount) }}</strong>
          </div>
          <div class="mini-metric mini-metric--stock">
            <span>สินค้าในระบบ</span>
            <strong>{{ formatNumber(kpi.totalProducts) }}</strong>
          </div>
        </div>

        <div class="sales-chart" role="img" aria-label="กราฟแท่งข้อมูลภาพรวม">
          <div v-for="bar in chartBars" :key="bar.label" class="bar-wrap">
            <p class="bar-value">{{ formatChartValue(bar.value) }}</p>
            <div class="bar-track">
              <div class="bar-fill" :style="{ height: `${bar.height}%` }" />
            </div>
            <p class="bar-label">{{ bar.label }}</p>
          </div>
        </div>
      </article>

      <article class="panel panel--alert-summary" id="stock-alerts">
        <header class="panel-head panel-head--stack">
          <h3>สรุปสต็อกใกล้หมด</h3>
          <p v-if="!error">อ้างอิงข้อมูลจากสินค้าในระบบ</p>
        </header>

        <div v-if="error" class="error-banner">{{ error }}</div>

        <div class="summary-row">
          <div class="summary-card">
            <p>สินค้าคงเหลือน้อยกว่า {{ thresholds.lowStock }}</p>
            <strong>{{ kpi.lowStockCount }}</strong>
          </div>
          <div class="summary-card summary-card--critical">
            <p>เสี่ยงหมดสต็อก (&lt;= {{ thresholds.severeLowStock }})</p>
            <strong>{{ kpi.severeLowStockCount }}</strong>
          </div>
        </div>

        <p v-if="isLoading" class="loading-message">กำลังโหลดข้อมูลสต็อก...</p>
      </article>
    </section>

    <section class="panel table-panel">
      <header class="panel-head panel-head--stack">
        <h3>สินค้าเพิ่มล่าสุด</h3>
        <p>อ้างอิงรายการสินค้าล่าสุดจากฐานข้อมูล</p>
      </header>

      <div class="table-scroll">
        <table>
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

    <section class="panel table-panel">
      <header class="panel-head panel-head--stack">
        <h3>สต็อกสินค้าที่ใกล้หมด</h3>
        <p>สินค้าเรียงตามปริมาณคงเหลือจากน้อยไปมาก</p>
      </header>

      <p v-if="isLoading" class="loading-message">กำลังโหลดข้อมูล...</p>

      <div v-else-if="lowStockAlerts.length === 0" class="empty-state">
        <p>ยังไม่มีสินค้าที่เข้าข่ายใกล้หมดในตอนนี้</p>
      </div>

      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>หมวดหมู่</th>
              <th>SKU</th>
              <th>คงเหลือ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in lowStockAlerts" :key="product.id">
              <td class="product-cell">
                <img
                  v-if="getImageOrFallback(product)"
                  :src="getImageOrFallback(product)"
                  :alt="product.name"
                />
                <span v-else class="thumb-fallback">🐾</span>
                <strong>{{ product.name }}</strong>
              </td>
              <td>{{ product.categoryName || '-' }}</td>
              <td>{{ product.sku || '-' }}</td>
              <td>{{ product.stock }} ชิ้น</td>
              <td>
                <span :class="resolveStockStatusClass(product)">{{
                  resolveStockStatusText(product)
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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

.range-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.switch-btn {
  border-radius: 999px;
  border: 1px solid #deceef;
  background: #fff;
  color: #765b99;
  padding: 0.22rem 0.6rem;
  font-size: 0.73rem;
  font-weight: 700;
}

.switch-btn--active {
  background: #d9b4fc;
  border-color: #d9b4fc;
  color: #5f3788;
}

.sales-chart {
  height: 220px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
  gap: 0.35rem;
}

.bar-wrap {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: end;
  gap: 0.25rem;
}

.bar-value,
.bar-label {
  font-size: 0.66rem;
  text-align: center;
  color: #8e7cad;
}

.bar-track {
  height: 100%;
  border-radius: 11px;
  background: linear-gradient(180deg, #f7ecff 0%, #f3e5ff 100%);
  position: relative;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  border-radius: 11px;
  position: absolute;
  bottom: 0;
  left: 0;
  background: linear-gradient(180deg, var(--pink), var(--grape));
  animation: grow-bar 520ms ease;
}

@keyframes grow-bar {
  from {
    height: 0;
  }
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

  .panel-kpi-row {
    grid-template-columns: 1fr;
  }

  .sales-chart {
    height: 180px;
  }
}
</style>
