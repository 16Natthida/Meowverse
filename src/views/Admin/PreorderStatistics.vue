<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const loading = ref(false)
const error = ref('')
const report = ref({ summary: {}, history: [], products: [], rounds: [] })
const filterOptions = ref({ products: [], rounds: [] })
const searchQuery = ref('')
const selectedRoundId = ref('')
const selectedProductId = ref('')
const includeCancelled = ref(false)

const summary = computed(() => report.value.summary || {})
const history = computed(() => report.value.history || [])
const roundSummaries = computed(() => report.value.rounds || [])

const productOptions = computed(() => filterOptions.value.products || [])
const roundOptions = computed(() => filterOptions.value.rounds || [])

function authHeaders() {
  const rawUser = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  const user = (() => {
    try {
      return rawUser ? JSON.parse(rawUser) : {}
    } catch {
      return {}
    }
  })()

  return {
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH').format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusLabel(status) {
  const labels = {
    active: 'เปิดอยู่',
    closed: 'ปิดแล้ว',
    archived: 'เก็บถาวร',
    scheduled: 'รอตามกำหนด',
    unknown: 'ไม่พบข้อมูลรอบ',
  }
  return labels[String(status || '').toLowerCase()] || status || '-'
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'status-badge status-badge--active'
  if (normalized === 'closed') return 'status-badge status-badge--closed'
  if (normalized === 'archived') return 'status-badge status-badge--archived'
  return 'status-badge'
}

async function loadReport({ preserveOptions = true } = {}) {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams()
    if (selectedRoundId.value) params.set('roundId', selectedRoundId.value)
    if (selectedProductId.value) params.set('productId', selectedProductId.value)
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())
    if (includeCancelled.value) params.set('includeCancelled', 'true')

    const response = await fetch(`${API_BASE_URL}/admin/preorder-statistics?${params.toString()}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || body.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`)
    }

    const data = await response.json()
    report.value = data

    if (!preserveOptions || filterOptions.value.products.length === 0) {
      filterOptions.value = {
        products: data.products || [],
        rounds: data.rounds || [],
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
    report.value = { summary: {}, history: [], products: [], rounds: [] }
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  searchQuery.value = ''
  selectedRoundId.value = ''
  selectedProductId.value = ''
  loadReport()
}

function showRound(roundId) {
  selectedRoundId.value = String(roundId)
  selectedProductId.value = ''
  searchQuery.value = ''
  loadReport()
}

onMounted(() => loadReport({ preserveOptions: false }))
</script>

<template>
  <div class="preorder-statistics-page">

    <!-- ── Hero ── -->
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin · Preorder</p>
        <h2>📊 สถิติสินค้าพรีออเดอร์ย้อนหลัง</h2>
        <p>ตรวจสอบว่าสินค้าแต่ละรหัสถูกสั่งในรอบใดบ้าง จำนวนกี่ชิ้น และมียอดรวมเท่าไร</p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="router.push('/admin/preorder-rounds')">
          ← กลับไปรอบพรีออเดอร์
        </button>
        <button class="hero-btn--primary" type="button" :disabled="loading" @click="loadReport()">
          {{ loading ? '⏳ กำลังโหลด...' : '🔄 รีเฟรชข้อมูล' }}
        </button>
      </div>
    </section>

    <!-- ── Filter Panel ── -->
    <section class="panel filter-card">
      <div class="filter-grid">
        <label class="field">
          <span>ค้นหารหัสหรือชื่อสินค้า</span>
          <input
            v-model="searchQuery"
            type="search"
            class="search-input"
            placeholder="เช่น A-001 หรือชื่อสินค้า"
            @keyup.enter="loadReport()"
          />
        </label>

        <label class="field">
          <span>เลือกรอบพรีออเดอร์</span>
          <select v-model="selectedRoundId" class="filter-select">
            <option value="">ทุกรอบ</option>
            <option v-for="round in roundOptions" :key="round.round_id" :value="round.round_id">
              {{ round.round_name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>เลือกสินค้า</span>
          <select v-model="selectedProductId" class="filter-select">
            <option value="">ทุกสินค้า</option>
            <option v-for="product in productOptions" :key="product.prod_id" :value="product.prod_id">
              {{ product.sku || `รหัส #${product.prod_id}` }} - {{ product.product_name }}
            </option>
          </select>
        </label>
      </div>

      <div class="filter-actions">
        <label class="checkbox-label">
          <input v-model="includeCancelled" type="checkbox" />
          รวมออเดอร์ที่ยกเลิก
        </label>
        <div class="filter-buttons">
          <button class="ghost-btn" type="button" @click="clearFilters">ล้างตัวกรอง</button>
          <button class="hero-btn--primary" type="button" :disabled="loading" @click="loadReport()">
            ค้นหาสถิติ
          </button>
        </div>
      </div>
      <p class="filter-note">ค่าเริ่มต้นไม่นับออเดอร์ที่มีสถานะยกเลิก เพื่อให้ยอดขายไม่ถูกนับซ้ำ</p>
    </section>

    <!-- Loading -->
    <div v-if="loading" class="loading-wrap">
      <div class="loader"></div>
      <p>กำลังโหลดสถิติพรีออเดอร์...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="empty-state empty-state--error">
      <p class="error-title">⚠️ เกิดข้อผิดพลาด</p>
      <p>{{ error }}</p>
    </div>

    <template v-else>
      <!-- ── KPI Grid ── -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <p class="kpi-label">จำนวนชิ้นรวม</p>
          <p class="kpi-value">{{ formatNumber(summary.total_qty) }}</p>
          <p class="kpi-note">จากข้อมูลพรีออเดอร์ที่เลือก</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">ยอดรวมสินค้า</p>
          <p class="kpi-value">{{ formatMoney(summary.total_amount) }}</p>
          <p class="kpi-note">คำนวณจากราคาในออเดอร์ × จำนวน</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">จำนวนรอบ</p>
          <p class="kpi-value">{{ formatNumber(summary.round_count) }}</p>
          <p class="kpi-note">รอบที่มีรายการสั่งซื้อ</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">จำนวนออเดอร์</p>
          <p class="kpi-value">{{ formatNumber(summary.order_count) }}</p>
          <p class="kpi-note">ออเดอร์ที่ไม่ซ้ำกัน</p>
        </div>
      </div>

      <!-- ── Product History Panel ── -->
      <section class="panel table-panel">
        <header class="panel-head">
          <div class="panel-head__title">
            <p class="eyebrow">Product History</p>
            <h3>🧾 ประวัติแยกตามสินค้าและรอบ</h3>
          </div>
          <span class="result-count">{{ history.length }} รายการ</span>
        </header>

        <div v-if="history.length === 0" class="empty-state">
          ยังไม่มีข้อมูลสถิติพรีออเดอร์ตามตัวกรองนี้
        </div>
        <div v-else class="table-scroll">
          <table class="history-table">
            <thead>
              <tr>
                <th>รูปภาพ</th>
                <th>รหัสสินค้า</th>
                <th>ชื่อสินค้า</th>
                <th>รอบ</th>
                <th>ช่วงเวลา</th>
                <th class="number-cell">ออเดอร์</th>
                <th class="number-cell">จำนวนสั่ง</th>
                <th class="number-cell">ราคาเฉลี่ย</th>
                <th class="number-cell">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in history" :key="`${row.round_id}-${row.prod_id}`">
                <td class="image-cell">
                  <img
                    v-if="row.image_url"
                    :src="row.image_url"
                    :alt="row.product_name"
                    class="product-thumb"
                    loading="lazy"
                  />
                  <div v-else class="product-thumb product-thumb--placeholder">ไม่มีรูป</div>
                </td>
                <td><strong>{{ row.sku || `#${row.prod_id}` }}</strong></td>
                <td>
                  <p class="cell-title">{{ row.product_name }}</p>
                  <small v-if="row.flavor_count" class="text-muted">{{ formatNumber(row.flavor_count) }} รสชาติ/ตัวเลือก</small>
                </td>
                <td>
                  <p class="cell-title">{{ row.round_name }}</p>
                  <span :class="statusClass(row.round_status)">{{ statusLabel(row.round_status) }}</span>
                </td>
                <td class="text-muted">{{ formatDate(row.start_date) }} - {{ formatDate(row.end_date) }}</td>
                <td class="number-cell">{{ formatNumber(row.order_count) }}</td>
                <td class="number-cell"><strong>{{ formatNumber(row.total_qty) }} ชิ้น</strong></td>
                <td class="number-cell">{{ formatMoney(row.average_unit_price) }}</td>
                <td class="number-cell amount-cell">{{ formatMoney(row.total_amount) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="history-cards" aria-label="สถิติสินค้าแยกตามรอบ">
            <article v-for="row in history" :key="`card-${row.round_id}-${row.prod_id}`" class="history-card">
              <section class="history-card__section history-card__product">
                <p class="history-card__section-title">สินค้า / รอบ</p>
                <div class="history-card__product-body">
                  <img
                    v-if="row.image_url"
                    :src="row.image_url"
                    :alt="row.product_name"
                    class="history-card__image"
                    loading="lazy"
                  />
                  <div v-else class="history-card__image history-card__image--placeholder">🖼️</div>
                  <div class="history-card__product-info">
                    <strong class="history-card__sku">{{ row.sku || `#${row.prod_id}` }}</strong>
                    <p>{{ row.product_name }}</p>
                    <small v-if="row.flavor_count">{{ formatNumber(row.flavor_count) }} รสชาติ/ตัวเลือก</small>
                  </div>
                </div>
              </section>

              <section class="history-card__section history-card__round">
                <div class="history-card__round-row">
                  <span><b>รอบ:</b> {{ row.round_name || '-' }}</span>
                  <span :class="statusClass(row.round_status)">{{ statusLabel(row.round_status) }}</span>
                </div>
                <p class="history-card__date"><b>วันที่:</b> {{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</p>
              </section>

              <section class="history-card__section history-card__stats">
                <p class="history-card__section-title">สถิติ</p>
                <div class="history-card__stat-row">
                  <span>จำนวนชิ้นที่สั่ง</span>
                  <strong>{{ formatNumber(row.total_qty) }} ชิ้น</strong>
                </div>
                <div class="history-card__stat-row">
                  <span>ราคาเฉลี่ย</span>
                  <strong>{{ formatMoney(row.average_unit_price) }}</strong>
                </div>
                <div class="history-card__stat-row">
                  <span>ยอดรวม</span>
                  <strong class="amount-cell">{{ formatMoney(row.total_amount) }}</strong>
                </div>
              </section>
            </article>
          </div>
        </div>
      </section>

      <!-- ── Round History Panel ── -->
      <section class="panel table-panel">
        <header class="panel-head">
          <div class="panel-head__title">
            <p class="eyebrow">Round History</p>
            <h3>📦 สรุปข้อมูลย้อนหลังรายรอบ</h3>
          </div>
          <span class="result-count">{{ roundSummaries.length }} รอบ</span>
        </header>

        <div v-if="roundSummaries.length === 0" class="empty-state">ยังไม่มีข้อมูลรายรอบ</div>
        <div v-else class="table-scroll">
          <table class="rounds-table">
            <thead>
              <tr>
                <th>รอบ</th>
                <th>วันที่</th>
                <th>สถานะ</th>
                <th class="number-cell">จำนวนสินค้า</th>
                <th class="number-cell">จำนวนชิ้นรวม</th>
                <th class="number-cell">ยอดรวม</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="round in roundSummaries" :key="round.round_id">
                <td><strong>{{ round.round_name }}</strong></td>
                <td class="text-muted">{{ formatDate(round.start_date) }} - {{ formatDate(round.end_date) }}</td>
                <td><span :class="statusClass(round.round_status)">{{ statusLabel(round.round_status) }}</span></td>
                <td class="number-cell">{{ formatNumber(round.product_count) }} รายการ</td>
                <td class="number-cell"><strong>{{ formatNumber(round.total_qty) }} ชิ้น</strong></td>
                <td class="number-cell amount-cell">{{ formatMoney(round.total_amount) }}</td>
                <td class="number-cell">
                  <button class="link-button" type="button" @click="showRound(round.round_id)">ดูรอบนี้ →</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.preorder-statistics-page {
  --panel-bg: rgba(255, 255, 255, 0.88);
  --panel-border: #e8dcf3;
  --text-main: #432f61;
  --text-muted: #7a6a96;
  --grape: #a66de6;
  --pink: #ff93b8;
  max-width: 1440px;
  margin: 2rem auto;
  padding: 0 1rem 2rem;
  display: grid;
  gap: 1.2rem;
  font-family: 'Kanit', sans-serif;
  color: var(--text-main);
}

h2, h3, p { margin-top: 0; }

/* ── Hero ── */
.hero-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background: radial-gradient(circle at right top, rgba(255, 147, 184, 0.18), transparent),
    var(--panel-bg);
}
.eyebrow {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--grape);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.3rem;
}
.hero-copy h2 {
  color: var(--text-main);
  font-weight: 900;
  margin: 0 0 0.3rem;
  font-size: 1.6rem;
}
.hero-copy p {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin: 0;
}
.hero-actions, .filter-buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; }

.ghost-btn {
  background: #faf5ff;
  color: #4b3280;
  border: 1px solid #d8c6f2;
  border-radius: 12px;
  padding: 0.7rem 1.2rem;
  font-weight: 700;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(166, 109, 230, 0.1);
  transition: background 0.2s, box-shadow 0.2s;
}
.ghost-btn:hover { background: #f0e4fc; box-shadow: 0 4px 12px rgba(166, 109, 230, 0.18); }
.hero-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #b673ee, #ff93b8);
  border: none;
  padding: 0.7rem 1.5rem;
  border-radius: 12px;
  font-weight: 700;
  font: inherit;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}
.hero-btn--primary:hover:not(:disabled) { opacity: 0.88; }
.hero-btn--primary:disabled { cursor: wait; opacity: 0.6; }

/* ── Panel ── */
.panel {
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  padding: 1.5rem;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.panel-head__title h3 {
  color: var(--text-main);
  font-weight: 800;
  margin: 0 0 0.25rem;
}
.result-count { color: var(--text-muted); font-size: 0.85rem; }

/* ── Filters ── */
.filter-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; color: #5f4d85; font-size: 0.85rem; font-weight: 700; }
.field input, .field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd6fe;
  border-radius: 12px;
  padding: 0.6rem 0.9rem;
  color: var(--text-main);
  background: #faf5ff;
  font: inherit;
}
.field input:focus, .field select:focus { outline: none; border-color: var(--grape); box-shadow: 0 0 0 3px rgba(166, 109, 230, 0.15); }
.filter-actions {
  margin-top: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.checkbox-label { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.88rem; font-weight: 500; }
.checkbox-label input { width: 16px; height: 16px; accent-color: var(--grape); }
.filter-note { margin: 0.9rem 0 0; color: var(--text-muted); font-size: 0.8rem; }

/* ── KPI Grid ── */
.kpi-grid { display: grid; gap: 1rem; grid-template-columns: repeat(4, 1fr); }
.kpi-card {
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  padding: 1.2rem 1.4rem;
}
.kpi-label { font-size: 0.83rem; color: var(--text-muted); font-weight: 600; margin: 0 0 0.4rem; }
.kpi-value { font-size: 1.9rem; color: var(--text-main); font-weight: 900; margin: 0 0 0.25rem; }
.kpi-note { color: #9ca3af; font-size: 0.78rem; margin: 0; }

/* ── Table ── */
.table-scroll { overflow-x: auto; }
table { width: 100%; min-width: 940px; border-collapse: collapse; }
th {
  text-align: left;
  padding: 0.9rem 1rem;
  color: #826ea1;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 2px solid #f3e8ff;
  white-space: nowrap;
}
td { padding: 1rem; border-bottom: 1px solid #f3e8ff; font-size: 0.9rem; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tbody tr:hover { background: #fdfaff; }
.number-cell { text-align: right !important; white-space: nowrap; }
.cell-title { margin: 0 0 0.2rem; font-weight: 700; color: var(--text-main); }
.text-muted { color: var(--text-muted); font-size: 0.85rem; }

.image-cell { width: 64px; }
.product-thumb {
  display: block;
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  background: #f6f0fb;
}
.product-thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b6a8cc;
  font-size: 0.65rem;
  text-align: center;
  line-height: 1.2;
}
.amount-cell { color: var(--grape); font-weight: 800; }

/* ── Round status badges ── */
.status-badge { display: inline-block; margin-top: 5px; padding: 0.25rem 0.8rem; border-radius: 999px; color: var(--text-muted); background: #f3e8ff; font-size: 0.72rem; font-weight: 700; }
.status-badge--active { color: #16a34a; background: #ecfdf5; }
.status-badge--closed { color: #4b3280; background: #f3e8ff; }
.status-badge--archived { color: #b45309; background: #fffbeb; }

.link-button { padding: 0; border: 0; color: var(--grape); background: transparent; font: inherit; font-weight: 700; cursor: pointer; }
.link-button:hover { text-decoration: underline; }

/* ── States ── */
.loading-wrap { text-align: center; padding: 3rem; color: var(--text-muted); }
.loader {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 4px solid rgba(166, 109, 230, 0.18);
  border-top-color: var(--grape);
  animation: spin 0.9s linear infinite;
  margin: 0 auto 0.85rem;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state { text-align: center; padding: 3rem; color: #6b7280; }
.empty-state--error { color: #b91c1c; }
.error-title { font-weight: 800; margin-bottom: 0.25rem; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .hero-panel, .filter-actions { align-items: flex-start; flex-direction: column; }
  .hero-actions { width: 100%; }
  .filter-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .panel-head { flex-direction: column; }
}

@media (max-width: 520px) {
  .preorder-statistics-page { padding: 0 0.6rem 2.5rem; margin-top: 1rem; }
  .hero-panel, .panel { padding: 1.1rem; border-radius: 16px; }
  .kpi-grid { gap: 0.6rem; }
  .kpi-card { padding: 0.9rem; }
  .kpi-value { font-size: 1.25rem; }
  .hero-actions .ghost-btn, .hero-actions .hero-btn--primary,
  .filter-buttons .ghost-btn, .filter-buttons .hero-btn--primary { flex: 1; }
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
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 1px solid #eadcf6;
    border-radius: 14px;
    background: #fff;
  }

  .table-scroll > table td {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.42rem 0;
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

  .table-scroll > table td:nth-child(1)::before { content: 'สินค้า / รอบ'; }
  .table-scroll > table td:nth-child(2)::before { content: 'วันที่'; }
  .table-scroll > table td:nth-child(3)::before { content: 'สถานะ'; }
  .table-scroll > table td:nth-child(4)::before { content: 'จำนวนสินค้า'; }
  .table-scroll > table td:nth-child(5)::before { content: 'จำนวนชิ้น'; }
  .table-scroll > table td:nth-child(6)::before { content: 'ยอดรวม'; }
}
@media (max-width: 720px) {
  .table-scroll > table { min-width: 0; table-layout: fixed; }
  .table-scroll > table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .table-scroll > table td::before { max-width: 40%; }
  .table-scroll > table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
}

@media (max-width: 720px) {
  .history-table td:nth-child(1)::before { content: 'รูปภาพ'; }
  .history-table td:nth-child(2)::before { content: 'รหัสสินค้า'; }
  .history-table td:nth-child(3)::before { content: 'ชื่อสินค้า'; }
  .history-table td:nth-child(4)::before { content: 'รอบพรีออเดอร์'; }
  .history-table td:nth-child(5)::before { content: 'ช่วงเวลา'; }
  .history-table td:nth-child(6)::before { content: 'ออเดอร์'; }
  .history-table td:nth-child(7)::before { content: 'จำนวนสั่ง'; }
  .history-table td:nth-child(8)::before { content: 'ราคาเฉลี่ย'; }
  .history-table td:nth-child(9)::before { content: 'ยอดรวม'; }

  .rounds-table td:nth-child(1)::before { content: 'รอบ'; }
  .rounds-table td:nth-child(2)::before { content: 'วันที่'; }
  .rounds-table td:nth-child(3)::before { content: 'สถานะ'; }
  .rounds-table td:nth-child(4)::before { content: 'จำนวนสินค้า'; }
  .rounds-table td:nth-child(5)::before { content: 'จำนวนชิ้นรวม'; }
  .rounds-table td:nth-child(6)::before { content: 'ยอดรวม'; }
  .rounds-table td:nth-child(7)::before { content: 'จัดการ'; }
  .rounds-table td:last-child { display: block; padding-top: 0.65rem; }
  .rounds-table td:last-child::before { display: block; }
  .rounds-table td:last-child > * { max-width: 100%; }
}

.history-cards {
  display: none;
}

.history-card {
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(84, 54, 113, 0.07);
}

.history-card__section {
  padding: 1rem;
}

.history-card__section + .history-card__section {
  border-top: 1px solid #eee4f7;
}

.history-card__section-title {
  margin: 0 0 0.7rem;
  color: var(--grape);
  font-size: 0.82rem;
  font-weight: 800;
}

.history-card__product-body {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

.history-card__image {
  width: 68px;
  height: 68px;
  flex: 0 0 68px;
  border-radius: 14px;
  object-fit: cover;
  background: #f5efff;
}

.history-card__image--placeholder {
  display: grid;
  place-items: center;
  font-size: 1.5rem;
}

.history-card__product-info {
  min-width: 0;
  color: var(--text-main);
}

.history-card__sku {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--text-main);
  font-size: 1rem;
}

.history-card__product-info p {
  margin: 0;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.history-card__product-info small {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-muted);
}

.history-card__round-row,
.history-card__date {
  margin: 0;
  line-height: 1.5;
}

.history-card__round-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.history-card__round-row > span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.history-card__date {
  margin-top: 0.55rem;
  color: var(--text-muted);
  font-size: 0.86rem;
}

.history-card__stat-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.55rem 0;
  border-top: 1px solid #f0e8f8;
}

.history-card__stat-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.history-card__stat-row span {
  color: var(--text-muted);
  font-size: 0.86rem;
}

.history-card__stat-row strong {
  color: var(--text-main);
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .history-table {
    display: none !important;
  }

  .history-cards {
    display: grid;
    gap: 0.8rem;
  }
}

@media (max-width: 420px) {
  .history-card__section {
    padding: 0.85rem;
  }

  .history-card__round-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .history-card__stat-row {
    gap: 0.5rem;
  }
}
</style>
