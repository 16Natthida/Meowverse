<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'

const router = useRouter()
const { getUser } = useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const currentUser = computed(() => getUser())

const orders = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const typeFilter = ref('all')
const statusFilter = ref('all')
const selectedOrder = ref(null)
const selectedOrderLoading = ref(false)
const selectedOrderError = ref('')

const statusConfig = {
  Pending: { label: 'รอดำเนินการ', color: '#f59e0b', bg: '#fffbeb' },
  Paid: { label: 'ชำระแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Wait_for_Import_Fee: { label: 'รอค่านำเข้า', color: '#6366f1', bg: '#eef2ff' },
  Ready_to_Ship: { label: 'พร้อมจัดส่ง', color: '#0ea5e9', bg: '#f0f9ff' },
  Cancelled: { label: 'ยกเลิกแล้ว', color: '#ef4444', bg: '#fef2f2' },
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

function getStatus(status) {
  return statusConfig[status] || { label: status || '-', color: '#888', bg: '#f5f5f5' }
}

function getOrderTypeLabel(orderType) {
  return String(orderType || '').toLowerCase() === 'preorder' ? '🕐 พรีออเดอร์' : '✅ พร้อมส่ง'
}

const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    const matchesType =
      typeFilter.value === 'all' ||
      String(order.Order_type || '').toLowerCase() === typeFilter.value
    const matchesStatus =
      statusFilter.value === 'all' ||
      String(order.status || '').toLowerCase() === statusFilter.value
    const query = searchQuery.value.trim().toLowerCase()
    const matchesSearch =
      !query ||
      String(order.order_id).includes(query) ||
      String(order.username || '')
        .toLowerCase()
        .includes(query) ||
      String(order.full_name || '')
        .toLowerCase()
        .includes(query)

    return matchesType && matchesStatus && matchesSearch
  })
})

const orderStats = computed(() => ({
  all: orders.value.length,
  preorder: orders.value.filter(
    (order) => String(order.Order_type || '').toLowerCase() === 'preorder',
  ).length,
  ready: orders.value.filter((order) => String(order.Order_type || '').toLowerCase() === 'ready')
    .length,
  pending: orders.value.filter((order) => String(order.status || '').toLowerCase() === 'pending')
    .length,
}))

async function fetchOrders() {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams()
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
    if (typeFilter.value !== 'all') params.set('type', typeFilter.value)

    const response = await fetch(`${API_BASE_URL}/admin/orders?${params.toString()}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      throw new Error('โหลดรายการออเดอร์ไม่สำเร็จ')
    }

    orders.value = await response.json()
  } catch (err) {
    error.value = translateError(err)
  } finally {
    loading.value = false
  }
}

async function openOrder(order) {
  selectedOrder.value = order
  selectedOrderError.value = ''
  selectedOrderLoading.value = true

  try {
    const orderSummary = selectedOrder.value
    const response = await fetch(`${API_BASE_URL}/orders/${order.order_id}`, {
      headers: authHeaders(),
    })
    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดรายละเอียดออเดอร์ได้')
    }
    const detail = await response.json()
    selectedOrder.value = {
      ...orderSummary,
      ...detail,
      full_name: detail.full_name || orderSummary?.full_name || '',
      username: detail.username || orderSummary?.username || '',
    }
  } catch (err) {
    selectedOrderError.value = translateError(err)
  } finally {
    selectedOrderLoading.value = false
  }
}

function closeOrder() {
  selectedOrder.value = null
  selectedOrderError.value = ''
}

function goBack() {
  router.push('/admin/home')
}

function viewSlipList() {
  router.push('/admin/slips')
}

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div class="admin-order-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin Operations</p>
        <h1>รายการออเดอร์ทั้งหมด</h1>
        <p>ดูออเดอร์พร้อมส่งและพรีออเดอร์ทุกสถานะในที่เดียว พร้อมเปิดรายละเอียดได้ทันที</p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="goBack">กลับ Dashboard</button>
        <button class="primary-btn" type="button" @click="viewSlipList">ไปหน้าสลิป</button>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card">
        <p class="kpi-label">ทั้งหมด</p>
        <p class="kpi-value">{{ orderStats.all }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">พรีออเดอร์</p>
        <p class="kpi-value">{{ orderStats.preorder }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">พร้อมส่ง</p>
        <p class="kpi-value">{{ orderStats.ready }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">รอดำเนินการ</p>
        <p class="kpi-value">{{ orderStats.pending }}</p>
      </article>
    </section>

    <section class="panel">
      <header class="panel-head panel-head--stacked">
        <div>
          <h2>จัดการรายการออเดอร์</h2>
          <p>ค้นหาและกรองตามประเภทหรือสถานะออเดอร์</p>
        </div>
        <button class="ghost-btn" type="button" @click="fetchOrders">รีเฟรช</button>
      </header>

      <div class="toolbar">
        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="ค้นหาด้วยเลขออเดอร์ / ชื่อผู้ใช้ / ชื่อลูกค้า"
          @keyup.enter="fetchOrders"
        />
        <button class="primary-btn" type="button" @click="fetchOrders">ค้นหา</button>
      </div>

      <div class="filter-row">
        <button
          class="filter-btn"
          :class="{ active: typeFilter === 'all' }"
          @click="
            typeFilter = 'all'
            fetchOrders()
          "
        >
          ทั้งหมด
        </button>
        <button
          class="filter-btn"
          :class="{ active: typeFilter === 'preorder' }"
          @click="
            typeFilter = 'preorder'
            fetchOrders()
          "
        >
          พรีออเดอร์
        </button>
        <button
          class="filter-btn"
          :class="{ active: typeFilter === 'ready' }"
          @click="
            typeFilter = 'ready'
            fetchOrders()
          "
        >
          พร้อมส่ง
        </button>
      </div>

      <div class="filter-row filter-row--muted">
        <button
          class="filter-btn"
          :class="{ active: statusFilter === 'all' }"
          @click="
            statusFilter = 'all'
            fetchOrders()
          "
        >
          ทั้งหมด
        </button>
        <button
          class="filter-btn"
          :class="{ active: statusFilter === 'pending' }"
          @click="
            statusFilter = 'pending'
            fetchOrders()
          "
        >
          รอดำเนินการ
        </button>
        <button
          class="filter-btn"
          :class="{ active: statusFilter === 'paid' }"
          @click="
            statusFilter = 'paid'
            fetchOrders()
          "
        >
          ชำระแล้ว
        </button>
        <button
          class="filter-btn"
          :class="{ active: statusFilter === 'wait_for_import_fee' }"
          @click="
            statusFilter = 'wait_for_import_fee'
            fetchOrders()
          "
        >
          รอค่านำเข้า
        </button>
        <button
          class="filter-btn"
          :class="{ active: statusFilter === 'ready_to_ship' }"
          @click="
            statusFilter = 'ready_to_ship'
            fetchOrders()
          "
        >
          พร้อมจัดส่ง
        </button>
      </div>

      <div v-if="loading" class="state-box">กำลังโหลดรายการออเดอร์...</div>
      <div v-else-if="error" class="state-box state-box--error">{{ error }}</div>
      <div v-else-if="filteredOrders.length === 0" class="empty-box">ไม่พบรายการออเดอร์</div>

      <div v-else class="table-scroll">
        <table class="orders-table">
          <thead>
            <tr>
              <th>ออเดอร์</th>
              <th>ลูกค้า</th>
              <th>ประเภท</th>
              <th>ยอดเงิน</th>
              <th>สถานะ</th>
              <th>รายการ</th>
              <th>วันที่</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filteredOrders" :key="order.order_id">
              <td>
                <strong>#{{ order.order_id }}</strong>
              </td>
              <td>
                <div class="customer-cell">
                  <strong>{{ order.full_name || order.username || '-' }}</strong>
                  <small>{{ order.username || '-' }}</small>
                </div>
              </td>
              <td>
                <span
                  :class="[
                    'type-chip',
                    order.Order_type === 'Preorder' ? 'type-chip--pre' : 'type-chip--ready',
                  ]"
                  >{{ getOrderTypeLabel(order.Order_type) }}</span
                >
              </td>
              <td>{{ formatMoney(order.total_amount) }}</td>
              <td>
                <span
                  class="status-pill"
                  :style="{
                    color: getStatus(order.status).color,
                    background: getStatus(order.status).bg,
                  }"
                  >{{ getStatus(order.status).label }}</span
                >
              </td>
              <td>{{ order.item_count }} ชิ้น</td>
              <td>{{ formatDate(order.Order_date) }}</td>
              <td>
                <button class="slip-view-btn" type="button" @click="openOrder(order)">
                  ดูรายละเอียด
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <transition name="fade">
      <div v-if="selectedOrder" class="modal-overlay" @click.self="closeOrder">
        <div class="modal-card">
          <div class="modal-head">
            <div>
              <h3>ออเดอร์ #{{ selectedOrder.order_id }}</h3>
              <p>
                {{ selectedOrder.full_name || selectedOrder.username || '-' }} ·
                {{ getOrderTypeLabel(selectedOrder.Order_type) }}
              </p>
            </div>
            <button class="close-btn" type="button" @click="closeOrder">✕</button>
          </div>

          <div v-if="selectedOrderLoading" class="state-box">กำลังโหลดรายละเอียด...</div>
          <div v-else-if="selectedOrderError" class="state-box state-box--error">
            {{ selectedOrderError }}
          </div>
          <template v-else>
            <div class="summary-strip">
              <div>
                <span>ยอดรวม</span><strong>{{ formatMoney(selectedOrder.total_amount) }}</strong>
              </div>
              <div>
                <span>สถานะ</span><strong>{{ getStatus(selectedOrder.status).label }}</strong>
              </div>
              <div>
                <span>วันที่</span><strong>{{ formatDate(selectedOrder.Order_date) }}</strong>
              </div>
            </div>

            <div class="items-list">
              <div v-for="item in selectedOrder.items || []" :key="item.detail_id" class="item-row">
                <div>
                  <strong>{{ item.name }}</strong>
                  <p v-if="item.category_name">{{ item.category_name }}</p>
                </div>
                <div>฿{{ Number(item.unit_price || 0).toLocaleString('th-TH') }}</div>
                <div>x{{ item.qty }}</div>
                <div>
                  ฿{{
                    (Number(item.unit_price || 0) * Number(item.qty || 0)).toLocaleString('th-TH')
                  }}
                </div>
                <div>
                  <span
                    :class="[
                      'type-chip',
                      item.item_type === 'preorder' ? 'type-chip--pre' : 'type-chip--ready',
                    ]"
                    >{{ item.item_type === 'preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}</span
                  >
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.admin-order-page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(255, 183, 214, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 145, 255, 0.16), transparent 26%), #faf7ff;
  color: #2c2440;
  display: grid;
  gap: 1rem;
}

.hero-panel,
.panel,
.kpi-card,
.state-box,
.empty-box,
.modal-card {
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.2rem;
  border-radius: 18px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background:
    radial-gradient(circle at right top, rgba(255, 147, 184, 0.22), transparent 52%),
    rgba(255, 255, 255, 0.9);
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
.modal-head h3 {
  color: #432f61;
  font-weight: 900;
}

.hero-copy p {
  margin-top: 0.45rem;
  color: #6b5a84;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.kpi-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.kpi-card {
  border-radius: 15px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.9);
  padding: 0.9rem;
}

.kpi-label {
  margin: 0;
  color: #7b6992;
  font-size: 0.82rem;
}

.kpi-value {
  margin: 0.25rem 0 0;
  font-size: 1.7rem;
  font-weight: 900;
  color: #432f61;
}

.panel {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20px;
  padding: 1.1rem;
  border: 1px solid rgba(160, 126, 191, 0.14);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.panel-head--stacked {
  align-items: flex-start;
}

.toolbar,
.filter-row {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.filter-row--muted {
  padding-bottom: 0.35rem;
}

.search-input {
  flex: 1 1 300px;
  min-width: 0;
  border: 1px solid rgba(160, 126, 191, 0.2);
  border-radius: 999px;
  padding: 0.8rem 1rem;
  background: #fff;
}

.ghost-btn,
.primary-btn,
.filter-btn,
.slip-view-btn,
.close-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
}

.ghost-btn,
.filter-btn {
  background: #fff;
  color: #6f50a0;
  border: 1px solid rgba(160, 126, 191, 0.16);
}

.primary-btn,
.slip-view-btn {
  background: linear-gradient(160deg, #a17df2, #6f50a0);
  color: #fff;
}

.filter-btn {
  padding: 0.45rem 0.8rem;
}

.filter-btn.active {
  background: #efe4ff;
}

.primary-btn,
.ghost-btn,
.slip-view-btn {
  padding: 0.75rem 1rem;
}

.state-box,
.empty-box {
  padding: 1rem;
  border-radius: 14px;
  text-align: center;
  color: #6d5c8f;
}

.state-box--error {
  color: #b42318;
  background: #fff7f8;
}

.table-scroll {
  overflow: auto;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
}

.orders-table th,
.orders-table td {
  padding: 0.9rem 0.75rem;
  border-bottom: 1px solid #f0e8fb;
  text-align: left;
  vertical-align: middle;
}

.orders-table th {
  color: #7b6992;
  font-size: 0.84rem;
  text-transform: uppercase;
}

.customer-cell {
  display: grid;
}

.customer-cell small {
  color: #8b7aa3;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.type-chip--pre {
  background: #fff1dc;
  color: #b45309;
}

.type-chip--ready {
  background: #e5f8ef;
  color: #15803d;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(44, 36, 64, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}

.modal-card {
  width: min(980px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.1rem;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.modal-head p {
  margin: 0.25rem 0 0;
  color: #7b6992;
}

.close-btn {
  width: 36px;
  height: 36px;
  background: #f5ecff;
  color: #6f50a0;
}

.summary-strip {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 1rem;
}

.summary-strip div {
  background: #faf7ff;
  border: 1px solid #ede4fb;
  border-radius: 14px;
  padding: 0.85rem;
}

.summary-strip span {
  display: block;
  color: #7b6992;
  font-size: 0.82rem;
}

.summary-strip strong {
  color: #432f61;
  font-size: 1.05rem;
}

.items-list {
  display: grid;
  gap: 0.65rem;
}

.item-row {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 1.5fr 0.8fr 0.5fr 0.8fr 0.7fr;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid #ede4fb;
  border-radius: 14px;
}

.item-row p {
  margin: 0.15rem 0 0;
  color: #8b7aa3;
  font-size: 0.82rem;
}

@media (max-width: 960px) {
  .hero-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .item-row {
    grid-template-columns: 1fr;
  }
}
</style>
