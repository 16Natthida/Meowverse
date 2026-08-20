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
  <main class="preorder-statistics-page">
    <header class="page-hero">
      <div>
        <p class="eyebrow">ADMIN / PREORDER HISTORY</p>
        <h1>สถิติสินค้าพรีออเดอร์ย้อนหลัง</h1>
        <p class="hero-description">
          ตรวจสอบว่าสินค้าแต่ละรหัสถูกสั่งในรอบใดบ้าง จำนวนกี่ชิ้น และมียอดรวมเท่าไร
        </p>
      </div>
      <div class="hero-actions">
        <button class="button button--ghost" type="button" @click="router.push('/admin/preorder-rounds')">
          กลับไปรอบพรีออเดอร์
        </button>
        <button class="button button--primary" type="button" :disabled="loading" @click="loadReport()">
          {{ loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล' }}
        </button>
      </div>
    </header>

    <section class="filter-card">
      <div class="filter-grid">
        <label class="field">
          <span>ค้นหารหัสหรือชื่อสินค้า</span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="เช่น A-001 หรือชื่อสินค้า"
            @keyup.enter="loadReport()"
          />
        </label>

        <label class="field">
          <span>เลือกรอบพรีออเดอร์</span>
          <select v-model="selectedRoundId">
            <option value="">ทุกรอบ</option>
            <option v-for="round in roundOptions" :key="round.round_id" :value="round.round_id">
              {{ round.round_name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>เลือกสินค้า</span>
          <select v-model="selectedProductId">
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
          <button class="button button--ghost" type="button" @click="clearFilters">ล้างตัวกรอง</button>
          <button class="button button--primary" type="button" :disabled="loading" @click="loadReport()">
            ค้นหาสถิติ
          </button>
        </div>
      </div>
      <p class="filter-note">ค่าเริ่มต้นไม่นับออเดอร์ที่มีสถานะยกเลิก เพื่อให้ยอดขายไม่ถูกนับซ้ำ</p>
    </section>

    <div v-if="error" class="state-box state-box--error">{{ error }}</div>
    <div v-else-if="loading" class="state-box">กำลังโหลดสถิติพรีออเดอร์...</div>

    <template v-else>
      <section class="kpi-grid">
        <article class="kpi-card">
          <span>จำนวนชิ้นรวม</span>
          <strong>{{ formatNumber(summary.total_qty) }}</strong>
          <small>จากข้อมูลพรีออเดอร์ที่เลือก</small>
        </article>
        <article class="kpi-card">
          <span>ยอดรวมสินค้า</span>
          <strong>{{ formatMoney(summary.total_amount) }}</strong>
          <small>คำนวณจากราคาในออเดอร์ × จำนวน</small>
        </article>
        <article class="kpi-card">
          <span>จำนวนรอบ</span>
          <strong>{{ formatNumber(summary.round_count) }}</strong>
          <small>รอบที่มีรายการสั่งซื้อ</small>
        </article>
        <article class="kpi-card">
          <span>จำนวนออเดอร์</span>
          <strong>{{ formatNumber(summary.order_count) }}</strong>
          <small>ออเดอร์ที่ไม่ซ้ำกัน</small>
        </article>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">PRODUCT HISTORY</p>
            <h2>ประวัติแยกตามสินค้าและรอบ</h2>
          </div>
          <span class="result-count">{{ history.length }} รายการ</span>
        </div>

        <div v-if="history.length === 0" class="empty-state">
          ยังไม่มีข้อมูลสถิติพรีออเดอร์ตามตัวกรองนี้
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
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
                <td><strong>{{ row.sku || `#${row.prod_id}` }}</strong></td>
                <td>
                  <strong>{{ row.product_name }}</strong>
                  <small v-if="row.flavor_count">{{ formatNumber(row.flavor_count) }} รสชาติ/ตัวเลือก</small>
                </td>
                <td>
                  <strong>{{ row.round_name }}</strong>
                  <span :class="statusClass(row.round_status)">{{ statusLabel(row.round_status) }}</span>
                </td>
                <td>{{ formatDate(row.start_date) }} - {{ formatDate(row.end_date) }}</td>
                <td class="number-cell">{{ formatNumber(row.order_count) }}</td>
                <td class="number-cell"><strong>{{ formatNumber(row.total_qty) }} ชิ้น</strong></td>
                <td class="number-cell">{{ formatMoney(row.average_unit_price) }}</td>
                <td class="number-cell amount-cell">{{ formatMoney(row.total_amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">ROUND HISTORY</p>
            <h2>สรุปข้อมูลย้อนหลังรายรอบ</h2>
          </div>
          <span class="result-count">{{ roundSummaries.length }} รอบ</span>
        </div>

        <div v-if="roundSummaries.length === 0" class="empty-state">ยังไม่มีข้อมูลรายรอบ</div>
        <div v-else class="table-wrap">
          <table class="data-table">
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
                <td>{{ formatDate(round.start_date) }} - {{ formatDate(round.end_date) }}</td>
                <td><span :class="statusClass(round.round_status)">{{ statusLabel(round.round_status) }}</span></td>
                <td class="number-cell">{{ formatNumber(round.product_count) }} รายการ</td>
                <td class="number-cell"><strong>{{ formatNumber(round.total_qty) }} ชิ้น</strong></td>
                <td class="number-cell amount-cell">{{ formatMoney(round.total_amount) }}</td>
                <td class="number-cell">
                  <button class="link-button" type="button" @click="showRound(round.round_id)">ดูรอบนี้</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.preorder-statistics-page {
  min-height: 100vh;
  padding: 32px clamp(18px, 4vw, 64px) 64px;
  color: #1f2937;
  background: #f7f8fc;
}

.page-hero,
.panel-heading,
.filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-hero {
  max-width: 1440px;
  margin: 0 auto 24px;
  padding: 28px 32px;
  color: #fff;
  border-radius: 24px;
  background: linear-gradient(135deg, #312e81, #7c3aed);
  box-shadow: 0 18px 40px rgba(49, 46, 129, 0.18);
}

.eyebrow {
  margin: 0 0 8px;
  color: #7c3aed;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.page-hero .eyebrow { color: #ddd6fe; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(1.55rem, 3vw, 2.2rem); }
h2 { margin-bottom: 0; font-size: 1.25rem; }
.hero-description { margin: 0; color: #ede9fe; }
.hero-actions, .filter-buttons { display: flex; flex-wrap: wrap; gap: 10px; }

.button {
  border: 0;
  border-radius: 10px;
  padding: 10px 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.button:hover:not(:disabled) { transform: translateY(-1px); }
.button:disabled { cursor: wait; opacity: 0.6; }
.button--primary { color: #fff; background: #6d28d9; }
.page-hero .button--primary { background: #fff; color: #5b21b6; }
.button--ghost { color: #4b5563; background: #fff; border: 1px solid #e5e7eb; }
.page-hero .button--ghost { color: #fff; background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); }

.filter-card,
.panel,
.state-box {
  max-width: 1440px;
  margin: 0 auto 24px;
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.filter-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 7px; color: #4b5563; font-size: 0.85rem; font-weight: 700; }
.field input, .field select { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 9px; padding: 11px 12px; color: #111827; background: #fff; font: inherit; }
.field input:focus, .field select:focus { outline: 2px solid #c4b5fd; border-color: #7c3aed; }
.filter-actions { margin-top: 18px; }
.checkbox-label { display: flex; align-items: center; gap: 8px; color: #4b5563; font-size: 0.9rem; }
.checkbox-label input { width: 16px; height: 16px; accent-color: #6d28d9; }
.filter-note { margin: 14px 0 0; color: #6b7280; font-size: 0.8rem; }

.kpi-grid { max-width: 1440px; margin: 0 auto 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.kpi-card { padding: 20px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; }
.kpi-card span { display: block; color: #6b7280; font-size: 0.85rem; font-weight: 700; }
.kpi-card strong { display: block; margin: 10px 0 4px; color: #312e81; font-size: 1.65rem; }
.kpi-card small { color: #9ca3af; }
.panel-heading { margin-bottom: 18px; }
.result-count { color: #6b7280; font-size: 0.85rem; }
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; min-width: 940px; border-collapse: collapse; font-size: 0.88rem; }
.data-table th { padding: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb; background: #f9fafb; text-align: left; white-space: nowrap; }
.data-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.data-table tbody tr:hover { background: #fafafa; }
.data-table td small { display: block; margin-top: 4px; color: #9ca3af; }
.number-cell { text-align: right !important; white-space: nowrap; }
.amount-cell { color: #6d28d9; font-weight: 800; }
.status-badge { display: inline-block; margin-top: 5px; padding: 3px 8px; border-radius: 999px; color: #6b7280; background: #f3f4f6; font-size: 0.72rem; }
.status-badge--active { color: #047857; background: #d1fae5; }
.status-badge--closed { color: #1d4ed8; background: #dbeafe; }
.status-badge--archived { color: #6b21a8; background: #f3e8ff; }
.link-button { padding: 0; border: 0; color: #6d28d9; background: transparent; font: inherit; font-weight: 700; cursor: pointer; }
.link-button:hover { text-decoration: underline; }
.empty-state, .state-box { color: #6b7280; text-align: center; }
.state-box--error { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }

@media (max-width: 900px) {
  .page-hero, .filter-actions { align-items: flex-start; flex-direction: column; }
  .hero-actions { width: 100%; }
  .filter-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 520px) {
  .preorder-statistics-page { padding: 16px 12px 40px; }
  .page-hero, .filter-card, .panel { padding: 18px; border-radius: 14px; }
  .kpi-grid { gap: 10px; }
  .kpi-card { padding: 14px; }
  .kpi-card strong { font-size: 1.25rem; }
  .hero-actions .button, .filter-buttons .button { flex: 1; }
}
</style>
