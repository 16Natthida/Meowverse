<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const orders = ref([])
const loading = ref(true)
const error = ref(null)

// ── STATUS CONFIG ──
const statusConfig = {
  Pending: { label: 'รอดำเนินการ', color: '#f59e0b', bg: '#fffbeb' },
  Paid: { label: 'ชำระแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Wait_for_Import_Fee: { label: 'รอค่านำเข้า', color: '#6366f1', bg: '#eef2ff' },
  Ready_to_Ship: { label: 'พร้อมจัดส่ง', color: '#0ea5e9', bg: '#f0f9ff' },
  Cancelled: { label: 'ยกเลิกแล้ว', color: '#ef4444', bg: '#fef2f2' },
}

function getStatus(s) {
  return statusConfig[s] || { label: s, color: '#888', bg: '#f5f5f5' }
}

// ── FETCH ORDERS ──
const fetchOrders = async () => {
  const userId = currentUser.value?.id ?? currentUser.value?.user_id
  if (!userId) return

  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/orders?user_id=${userId}`)
    if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลออเดอร์ได้ (${res.status})`)
    const data = await res.json()
    orders.value = Array.isArray(data) ? data : (data.orders ?? [])
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function goToOrder(orderId) {
  router.push(`/order/${orderId}`)
}

function goBack() {
  router.push('/')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div class="order-list-page">
    <!-- ───── NAVBAR ───── -->
    <nav class="navbar">
      <button class="back-btn" @click="goBack">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          class="back-icon"
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับหน้าหลัก
      </button>
      <div class="navbar__logo">
        <span class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
      <div class="navbar__title">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="title-order-icon"
        >
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        รายการออเดอร์
      </div>
    </nav>

    <div class="content">
      <!-- LOADING -->
      <div v-if="loading" class="state-wrap">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>

      <!-- ERROR -->
      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn-retry" @click="fetchOrders">ลองใหม่</button>
      </div>

      <!-- EMPTY -->
      <div v-else-if="orders.length === 0" class="state-wrap">
        <div class="empty-icon">📦</div>
        <p class="empty-text">ยังไม่มีรายการออเดอร์</p>
      </div>

      <!-- ORDER LIST -->
      <div v-else>
        <div class="list-header">
          <span class="list-count">ทั้งหมด {{ orders.length }} รายการ</span>
        </div>

        <div class="order-cards">
          <div
            v-for="order in orders"
            :key="order.order_id"
            class="section-card order-row"
            @click="goToOrder(order.order_id)"
          >
            <!-- หัวการ์ด -->
            <div class="order-row__head">
              <div class="order-id-badge">#{{ order.order_id }}</div>
              <span
                class="status-badge"
                :style="{
                  color: getStatus(order.status).color,
                  background: getStatus(order.status).bg,
                }"
              >
                {{ getStatus(order.status).label }}
              </span>
            </div>

            <!-- ข้อมูลกลาง -->
            <div class="order-row__meta">
              <div class="meta-item">
                <span class="meta-label">ประเภท</span>
                <span
                  class="type-chip"
                  :class="order.Order_type === 'Preorder' ? 'type-chip--pre' : 'type-chip--ready'"
                >
                  {{ order.Order_type === 'Preorder' ? '🕐 พรีออเดอร์' : '✅ พร้อมส่ง' }}
                </span>
              </div>
              <div class="meta-item">
                <span class="meta-label">วันที่สั่งซื้อ</span>
                <span class="meta-value">{{ formatDate(order.Order_date) }}</span>
              </div>
              <div class="meta-item" v-if="order.deadline">
                <span class="meta-label">กำหนดส่ง</span>
                <span class="meta-value">{{ formatDate(order.deadline) }}</span>
              </div>
            </div>

            <!-- ท้ายการ์ด -->
            <div class="order-row__foot">
              <div class="total-amount">
                ฿{{
                  Number(order.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })
                }}
              </div>
              <button class="detail-btn">
                ดูรายละเอียด
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class="arrow-icon"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-list-page {
  --primary: #6f50a0;
  --bg: #f8f5ff;
  --border: #eadff5;
  --text: #3f2f5d;
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  font-family: 'Kanit', sans-serif;
}

/* ── NAVBAR ── */
.navbar {
  display: flex;
  align-items: center;
  padding: 0 1.5rem;
  height: 60px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  border-radius: 20px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  background: #fff;
  cursor: pointer;
  color: var(--primary);
  font-weight: bold;
}
.back-btn:hover {
  background: #f8f5ff;
}
.navbar__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}
.logo-text {
  font-weight: 900;
  color: var(--primary);
}
.navbar__title {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: bold;
}
.back-icon,
.title-order-icon {
  width: 18px;
  height: 18px;
}

/* ── CONTENT ── */
.content {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.list-header {
  margin-bottom: 1rem;
}
.list-count {
  font-size: 0.88rem;
  color: #9a7dbf;
  font-weight: 700;
}

/* ── CARDS ── */
.section-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 4px 6px rgba(111, 80, 160, 0.05);
}

.order-row {
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}
.order-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(111, 80, 160, 0.12);
  border-color: #c9a8e8;
}

/* ── ORDER ROW HEAD ── */
.order-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.order-id-badge {
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary);
  background: #f0e6ff;
  border-radius: 8px;
  padding: 3px 12px;
}
.status-badge {
  font-size: 0.8rem;
  font-weight: 800;
  border-radius: 999px;
  padding: 4px 14px;
}

/* ── ORDER ROW META ── */
.order-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 0.85rem 1rem;
  background: #faf7ff;
  border-radius: 10px;
  margin-bottom: 1rem;
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.meta-label {
  font-size: 0.72rem;
  color: #9a7dbf;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.meta-value {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}

.type-chip {
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 700;
  border-radius: 8px;
  padding: 2px 10px;
}
.type-chip--ready {
  color: #059669;
  background: #ecfdf5;
}
.type-chip--pre {
  color: #7c3aed;
  background: #f5f3ff;
}

/* ── ORDER ROW FOOT ── */
.order-row__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.total-amount {
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--primary);
}
.detail-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #6f50a0, #9a7dbf);
  color: #fff;
  font-weight: 800;
  font-size: 0.88rem;
  cursor: pointer;
  transition: opacity 0.2s;
}
.detail-btn:hover {
  opacity: 0.88;
}
.arrow-icon {
  width: 15px;
  height: 15px;
}

/* ── STATES ── */
.state-wrap {
  text-align: center;
  padding: 4rem 1rem;
  color: #9a7dbf;
}
.loader {
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.empty-text {
  font-size: 1rem;
  font-weight: 700;
}
.error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 1rem;
  color: #b91c1c;
  margin-bottom: 1rem;
  font-weight: 600;
}
.btn-retry {
  padding: 8px 24px;
  border-radius: 20px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

/* ── RESPONSIVE ── */
@media (max-width: 600px) {
  .order-row__meta {
    gap: 0.8rem;
  }
  .navbar {
    padding: 0 1rem;
  }
  .content {
    padding: 1.2rem 0.75rem;
  }
}
</style>
