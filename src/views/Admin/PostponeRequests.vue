<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'

const router = useRouter()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const requests = ref([])
const loading = ref(false)
const error = ref('')
const filterStatus = ref('all')
const searchQuery = ref('')

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

function formatStatusLabel(status) {
  if (!status) return '-'
  return status === 'Pending' ? 'รอดำเนินการ' : status === 'Approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'
}

function formatOrderStatus(status) {
  const map = {
    Pending: 'รอชำระ',
    Paid: 'ชำระแล้ว',
    Wait_for_Import_Fee: 'รอค่านำเข้า',
    Ready_to_Ship: 'พร้อมส่ง',
    Cancelled: 'ยกเลิก',
    'Invalid slip': 'สลิปไม่ถูกต้อง',
  }
  return map[status] || status || '-'
}

function orderStatusClass(status) {
  const map = {
    Pending: 'status--pending-order',
    Paid: 'status--paid',
    Wait_for_Import_Fee: 'status--wait-import',
    Ready_to_Ship: 'status--ready',
    Cancelled: 'status--cancelled',
    'Invalid slip': 'status--invalid',
  }
  return map[status] || ''
}

async function fetchRequests() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/orders/postpones`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('โหลดรายการคำขอเลื่อนไม่สำเร็จ')
    requests.value = await res.json()
  } catch (err) {
    error.value = translateError(err)
  } finally {
    loading.value = false
  }
}

async function updateRequestStatus(postId, status) {
  try {
    const res = await fetch(`${API_BASE_URL}/orders/postpones/${postId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null)
      throw new Error(errorBody?.error || errorBody?.message || 'อัปเดตสถานะไม่สำเร็จ')
    }
    await fetchRequests()
  } catch (err) {
    error.value = translateError(err)
  }
}

function goBack() {
  router.push('/admin/home')
}

const kpiStats = computed(() => ({
  total: requests.value.length,
  pending: requests.value.filter((r) => r.status === 'Pending').length,
  approved: requests.value.filter((r) => r.status === 'Approved').length,
  rejected: requests.value.filter((r) => r.status === 'Rejected').length,
}))

const filteredRequests = computed(() => {
  return requests.value.filter((r) => {
    const matchStatus = filterStatus.value === 'all' || r.status === filterStatus.value
    const q = searchQuery.value.toLowerCase()
    const matchSearch =
      !q ||
      String(r.order_id).includes(q) ||
      String(r.post_id).includes(q) ||
      (r.request_reason && r.request_reason.toLowerCase().includes(q)) ||
      (r.contact_phone && r.contact_phone.includes(q))
    return matchStatus && matchSearch
  })
})

onMounted(() => {
  fetchRequests()
})
</script>

<template>
  <div class="postpone-page">

    <!-- ── Hero ── -->
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin · Preorder</p>
        <h2>🗓️ คำขอเลื่อนวันชำระ</h2>
        <p>ดูคำขอเลื่อนทั้งหมดของลูกค้า และอนุมัติหรือปฏิเสธพร้อมอัปเดตกำหนดชำระใหม่</p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="goBack">← กลับ Dashboard</button>
        <button class="hero-btn--primary" type="button" @click="fetchRequests">🔄 รีเฟรช</button>
      </div>
    </section>

    <!-- ── KPI Cards ── -->
    <div class="kpi-grid">
      <div
        class="kpi-card"
        :class="{ active: filterStatus === 'all' }"
        @click="filterStatus = 'all'"
      >
        <p class="kpi-label">คำขอทั้งหมด</p>
        <p class="kpi-value">{{ kpiStats.total }}</p>
      </div>
      <div
        class="kpi-card kpi-card--pending"
        :class="{ active: filterStatus === 'Pending' }"
        @click="filterStatus = 'Pending'"
      >
        <p class="kpi-label">⏳ รอดำเนินการ</p>
        <p class="kpi-value">{{ kpiStats.pending }}</p>
      </div>
      <div
        class="kpi-card kpi-card--approved"
        :class="{ active: filterStatus === 'Approved' }"
        @click="filterStatus = 'Approved'"
      >
        <p class="kpi-label">✅ อนุมัติแล้ว</p>
        <p class="kpi-value">{{ kpiStats.approved }}</p>
      </div>
      <div
        class="kpi-card kpi-card--rejected"
        :class="{ active: filterStatus === 'Rejected' }"
        @click="filterStatus = 'Rejected'"
      >
        <p class="kpi-label">❌ ปฏิเสธ</p>
        <p class="kpi-value">{{ kpiStats.rejected }}</p>
      </div>
    </div>

    <!-- ── Table Panel ── -->
    <section class="panel table-panel">
      <header class="panel-head">
        <div class="panel-head__title">
          <h3>📋 รายการคำขอเลื่อน</h3>
          <p>คลิกอนุมัติหรือปฏิเสธเพื่ออัปเดตสถานะคำขอ</p>
        </div>
        <div class="filter-panel">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="ค้นหา ออเดอร์ / เหตุผล / เบอร์..."
          />
          <label>สถานะ</label>
          <select v-model="filterStatus" class="filter-select">
            <option value="all">ทั้งหมด</option>
            <option value="Pending">รอดำเนินการ</option>
            <option value="Approved">อนุมัติแล้ว</option>
            <option value="Rejected">ปฏิเสธ</option>
          </select>
        </div>
      </header>

      <!-- Loading -->
      <div v-if="loading" class="loading-wrap">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="empty-state empty-state--error">
        <p class="error-title">⚠️ เกิดข้อผิดพลาด</p>
        <p>{{ error }}</p>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredRequests.length === 0" class="empty-state">
        <p>ไม่พบรายการคำขอเลื่อน</p>
      </div>

      <!-- Table -->
      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>รหัสคำขอ</th>
              <th>ออเดอร์</th>
              <th>ยอดรวม</th>
              <th>สถานะออเดอร์</th>
              <th>วันที่ขอเลื่อน</th>
              <th>เหตุผล / รายละเอียด</th>
              <th>เบอร์ติดต่อ</th>
              <th>สถานะคำขอ</th>
              <th>การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="request in filteredRequests" :key="request.post_id">

              <!-- รหัสคำขอ -->
              <td><strong>#{{ request.post_id }}</strong></td>

              <!-- ออเดอร์ -->
              <td>
                <strong>#{{ request.order_id }}</strong><br />
                <small class="text-muted">{{ formatDate(request.created_at) }}</small>
              </td>

              <!-- ยอดรวม (total_amount จาก orders) -->
              <td class="price-text">
                <span v-if="request.total_amount != null">
                  ฿{{ Number(request.total_amount).toLocaleString() }}
                </span>
                <span v-else class="no-data">-</span>
              </td>

              <!-- สถานะออเดอร์ -->
              <td>
                <span :class="['status', orderStatusClass(request.order_status)]">
                  {{ formatOrderStatus(request.order_status) }}
                </span>
              </td>

              <!-- วันที่ขอเลื่อน -->
              <td>{{ formatDate(request.new_deadline) }}</td>

              <!-- เหตุผล -->
              <td class="reason-cell">
                <p class="reason-main">{{ request.request_reason || '-' }}</p>
                <p v-if="request.post_detail" class="reason-detail">{{ request.post_detail }}</p>
              </td>

              <!-- เบอร์ติดต่อ -->
              <td>{{ request.contact_phone || '-' }}</td>

              <!-- สถานะคำขอ -->
              <td>
                <span :class="['status-chip', `status-chip--${(request.status || '').toLowerCase()}`]">
                  {{ formatStatusLabel(request.status) }}
                </span>
              </td>

              <!-- การดำเนินการ -->
              <td>
                <div class="action-btns">
                  <button
                    class="btn-action btn-action--approve"
                    type="button"
                    @click="updateRequestStatus(request.post_id, 'Approved')"
                    :disabled="request.status !== 'Pending'"
                  >
                    ✅ อนุมัติ
                  </button>
                  <button
                    class="btn-action btn-action--reject"
                    type="button"
                    @click="updateRequestStatus(request.post_id, 'Rejected')"
                    :disabled="request.status !== 'Pending'"
                  >
                    ✕ ปฏิเสธ
                  </button>
                </div>
              </td>

            </tr>
          </tbody>
        </table>
      </div>
    </section>

  </div>
</template>

<style scoped>
.postpone-page {
  --panel-bg: rgba(255, 255, 255, 0.88);
  --panel-border: #e8dcf3;
  --text-main: #432f61;
  --text-muted: #7a6a96;
  --grape: #a66de6;
  --pink: #ff93b8;
  max-width: 1280px;
  margin: 2rem auto;
  padding: 0 1rem;
  display: grid;
  gap: 1.2rem;
  font-family: 'Kanit', sans-serif;
}

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
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.ghost-btn {
  background: #fff;
  color: #4b3280;
  border: 1px solid #d8c6f2;
  border-radius: 12px;
  padding: 0.7rem 1.2rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.ghost-btn:hover {
  background: #f7f0ff;
}
.hero-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #b673ee, #ff93b8);
  border: none;
  padding: 0.7rem 1.5rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}
.hero-btn--primary:hover {
  opacity: 0.88;
}

/* ── KPI Grid ── */
.kpi-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, 1fr);
}
.kpi-card {
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  padding: 1.2rem 1.4rem;
  cursor: pointer;
  transition: 0.25s;
}
.kpi-card:hover,
.kpi-card.active {
  border-color: var(--grape);
  background: #fdfaff;
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(166, 109, 230, 0.12);
}
.kpi-card--pending.active  { border-color: #f59e0b; }
.kpi-card--approved.active { border-color: #10b981; }
.kpi-card--rejected.active { border-color: #ef4444; }
.kpi-label {
  font-size: 0.83rem;
  color: var(--text-muted);
  font-weight: 600;
  margin: 0 0 0.4rem;
}
.kpi-value {
  font-size: 1.9rem;
  color: var(--text-main);
  font-weight: 900;
  margin: 0;
}

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
.panel-head__title p {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin: 0;
}

/* ── Filters ── */
.filter-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.filter-panel label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #5f4d85;
}
.search-input {
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid #ddd6fe;
  background: #faf5ff;
  color: var(--text-main);
  width: 220px;
  font-size: 0.9rem;
}
.filter-select {
  border: 1px solid #e5d5f3;
  border-radius: 14px;
  padding: 0.6rem 0.9rem;
  background: #faf5ff;
  color: #432f61;
  font-size: 0.9rem;
}

/* ── Table ── */
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
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
td {
  padding: 1rem;
  border-bottom: 1px solid #f3e8ff;
  font-size: 0.9rem;
  vertical-align: top;
}
tr:last-child td { border-bottom: none; }

/* ── Order Status badges ── */
.status {
  display: inline-block;
  border-radius: 99px;
  padding: 0.25rem 0.8rem;
  font-weight: 700;
  font-size: 0.75rem;
  border: 1px solid transparent;
  white-space: nowrap;
}
.status--pending-order { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.status--paid          { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.status--wait-import   { background: #fefce8; color: #92400e; border-color: #fde68a; }
.status--ready         { background: #ecfdf5; color: #059669; border-color: #6ee7b7; }
.status--cancelled     { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.status--invalid       { background: #fff1f2; color: #9f1239; border-color: #fecdd3; }

/* ── Request Status chips ── */
.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}
.status-chip--pending  { background: #fffbeb; color: #b45309; }
.status-chip--approved { background: #ecfdf5; color: #16a34a; }
.status-chip--rejected { background: #fef2f2; color: #b91c1c; }

/* ── Price ── */
.price-text {
  font-weight: 800;
  color: var(--text-main);
  white-space: nowrap;
}
.text-muted { color: var(--text-muted); font-size: 0.8rem; }
.no-data    { color: #9ca3af; font-size: 0.85rem; }

/* ── Reason ── */
.reason-cell { max-width: 260px; }
.reason-main {
  margin: 0 0 0.25rem;
  font-size: 0.88rem;
}
.reason-detail {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ── Action Buttons ── */
.action-btns {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.btn-action {
  background: white;
  border: 1px solid var(--grape);
  color: var(--grape);
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: 0.2s;
  white-space: nowrap;
}
.btn-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.btn-action--approve { border-color: #10b981; color: #10b981; }
.btn-action--approve:hover:not(:disabled) { background: #10b981; color: white; }
.btn-action--reject  { border-color: #ef4444; color: #ef4444; }
.btn-action--reject:hover:not(:disabled)  { background: #ef4444; color: white; }

/* ── States ── */
.loading-wrap {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted);
}
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

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}
.empty-state--error { color: #b91c1c; }
.error-title { font-weight: 800; margin-bottom: 0.25rem; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .hero-panel { flex-direction: column; align-items: stretch; }
  .panel-head { flex-direction: column; }
}
@media (max-width: 600px) {
  .search-input { width: 100%; }
}
</style>