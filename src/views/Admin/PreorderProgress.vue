<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const loading = ref(false)
const error = ref('')
const progress = ref([])
const selectedRound = ref('')
const selectedStatus = ref('all')
const search = ref('')
let refreshTimer = null

function authHeaders() {
  const raw = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  const user = (() => {
    try {
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })()

  return {
    'x-user-id': String(user.user_id || user.id || ''),
    'x-user-role': String(user.role || 'admin'),
  }
}

async function loadProgress() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/admin/preorder-progress`, {
      headers: authHeaders(),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || body.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`)
    progress.value = Array.isArray(body.progress) ? body.progress : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

const rounds = computed(() => {
  const map = new Map()
  progress.value.forEach((row) => {
    if (!map.has(row.roundId)) {
      map.set(row.roundId, {
        id: row.roundId,
        name: row.roundName,
        status: row.roundStatus,
      })
    }
  })
  return Array.from(map.values())
})

const filteredProgress = computed(() => {
  const query = search.value.trim().toLowerCase()
  return progress.value.filter((row) => {
    const matchesRound = !selectedRound.value || String(row.roundId) === String(selectedRound.value)
    const matchesStatus = selectedStatus.value === 'all' || row.minimumStatus === selectedStatus.value
    const matchesSearch = !query || `${row.productName} ${row.sku} ${row.roundName}`.toLowerCase().includes(query)
    return matchesRound && matchesStatus && matchesSearch
  })
})

const summary = computed(() => ({
  total: progress.value.length,
  reached: progress.value.filter((row) => row.minimumStatus === 'reached').length,
  notReached: progress.value.filter((row) => row.minimumStatus === 'not-reached').length,
  rounds: rounds.value.length,
}))

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusLabel(status) {
  if (status === 'reached') return 'ถึงขั้นต่ำ'
  if (status === 'not-reached') return 'ยังไม่ถึงขั้นต่ำ'
  return 'ไม่กำหนดขั้นต่ำ'
}

function roundStatusLabel(status) {
  if (status === 'active') return 'กำลังเปิดรับ'
  if (status === 'closed') return 'ปิดรอบแล้ว'
  if (status === 'scheduled') return 'รอเปิด'
  return status || '-'
}

function startRefresh() {
  stopRefresh()
  refreshTimer = window.setInterval(loadProgress, 15000)
}

function stopRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(async () => {
  await loadProgress()
  startRefresh()
})

onUnmounted(stopRefresh)
</script>

<template>
  <div class="preorder-progress-page">
    <AdminPageHeader
      title="สรุปยอดพรีออเดอร์"
      description="ดูยอดจองเทียบกับขั้นต่ำของสินค้าทุกชิ้นในทุกรอบแบบรวมในหน้าเดียว"
    >
      <div class="header-actions">
        <button class="btn-secondary" type="button" @click="router.push('/admin/preorder-rounds')">
          จัดการรอบ
        </button>
        <button class="btn-primary" type="button" :disabled="loading" @click="loadProgress">
          {{ loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล' }}
        </button>
      </div>
    </AdminPageHeader>

    <div v-if="error" class="error-box">{{ error }}</div>

    <section class="summary-grid">
      <div class="summary-card"><span>รายการสินค้าทั้งหมด</span><strong>{{ summary.total }}</strong></div>
      <div class="summary-card summary-card--green"><span>ถึงขั้นต่ำ</span><strong>{{ summary.reached }}</strong></div>
      <div class="summary-card summary-card--orange"><span>ยังไม่ถึงขั้นต่ำ</span><strong>{{ summary.notReached }}</strong></div>
      <div class="summary-card summary-card--purple"><span>รอบทั้งหมด</span><strong>{{ summary.rounds }}</strong></div>
    </section>

    <section class="filter-panel">
      <input v-model="search" type="search" placeholder="ค้นหาสินค้า หรือชื่อรอบ" />
      <select v-model="selectedRound">
        <option value="">ทุกรอบ</option>
        <option v-for="round in rounds" :key="round.id" :value="round.id">{{ round.name }}</option>
      </select>
      <select v-model="selectedStatus">
        <option value="all">ทุกสถานะขั้นต่ำ</option>
        <option value="reached">ถึงขั้นต่ำ</option>
        <option value="not-reached">ยังไม่ถึงขั้นต่ำ</option>
        <option value="no-minimum">ไม่กำหนดขั้นต่ำ</option>
      </select>
    </section>

    <section class="table-card">
      <div v-if="loading && progress.length === 0" class="empty-state">กำลังโหลดข้อมูล...</div>
      <div v-else-if="filteredProgress.length === 0" class="empty-state">ไม่พบรายการตามตัวกรอง</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>รอบ</th>
              <th>สถานะรอบ</th>
              <th>ขั้นต่ำ</th>
              <th>ยอดจอง/ยอดสั่ง</th>
              <th>ขาดอีก</th>
              <th>สถานะขั้นต่ำ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredProgress" :key="`${row.roundId}-${row.productId}`">
              <td><strong>{{ row.productName }}</strong><small>{{ row.sku || `สินค้า #${row.productId}` }}</small></td>
              <td>{{ row.roundName }}<small>{{ formatDate(row.endDate) }}</small></td>
              <td><span class="round-status">{{ roundStatusLabel(row.roundStatus) }}</span></td>
              <td>{{ row.minimumOrderQty > 0 ? `${row.minimumOrderQty} ชิ้น` : 'ไม่กำหนด' }}</td>
              <td class="qty-cell">{{ row.committedQty }} ชิ้น</td>
              <td>{{ row.shortfall > 0 ? `${row.shortfall} ชิ้น` : '-' }}</td>
              <td>
                <span :class="['status-pill', `status-pill--${row.minimumStatus}`]">
                  {{ statusLabel(row.minimumStatus) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preorder-progress-page { padding: 0 0 2rem; color: #493765; }
.header-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
button { border: 0; border-radius: 10px; padding: .65rem 1rem; font: inherit; font-weight: 800; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
.btn-primary { background: #9b6ad4; color: #fff; }
.btn-secondary { background: #f2eaff; color: #6f50a0; }
.error-box { margin: 1rem 0; padding: .8rem 1rem; border: 1px solid #f0b8c1; border-radius: 12px; background: #fff0f2; color: #9f3346; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1.2rem 0; }
.summary-card { padding: 1.1rem 1.2rem; border: 1px solid #e6d9f3; border-radius: 16px; background: #fff; box-shadow: 0 6px 18px rgba(75, 45, 106, .07); }
.summary-card span { display: block; color: #806d98; font-size: .85rem; font-weight: 700; }
.summary-card strong { display: block; margin-top: .25rem; color: #4b3568; font-size: 1.9rem; }
.summary-card--green { border-color: #b9e7d2; background: #f4fff8; }
.summary-card--orange { border-color: #f4dbac; background: #fffaf0; }
.summary-card--purple { border-color: #d9c4f0; background: #faf7ff; }
.filter-panel { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: .8rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid #e6d9f3; border-radius: 16px; background: #fff; }
.filter-panel input, .filter-panel select { min-width: 0; padding: .7rem .8rem; border: 1px solid #d9cbea; border-radius: 10px; background: #fff; color: #493765; font: inherit; }
.table-card { overflow: hidden; border: 1px solid #e6d9f3; border-radius: 16px; background: #fff; box-shadow: 0 6px 18px rgba(75, 45, 106, .06); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 900px; }
th, td { padding: .85rem 1rem; border-bottom: 1px solid #f0e9f7; text-align: left; white-space: nowrap; }
th { background: #faf7ff; color: #74598f; font-size: .8rem; }
td { color: #56436d; font-size: .88rem; }
td small { display: block; margin-top: .2rem; color: #9a8aaa; font-size: .75rem; }
.qty-cell { font-weight: 900; color: #4e3672; }
.round-status, .status-pill { display: inline-flex; padding: .28rem .6rem; border-radius: 999px; font-size: .75rem; font-weight: 800; }
.round-status { background: #f1eafb; color: #76529b; }
.status-pill--reached { background: #e1f7eb; color: #21744c; }
.status-pill--not-reached { background: #fff0d0; color: #966114; }
.status-pill--no-minimum { background: #edf0f5; color: #687385; }
.empty-state { padding: 3rem 1rem; text-align: center; color: #806d98; }
@media (max-width: 800px) {
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .filter-panel { grid-template-columns: 1fr; }
}
</style>
