<template>
  <div class="admin-page">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">M</div>
        <div>
          <h1>Meowverse</h1>
          <p>Pet shop</p>
        </div>
      </div>

      <div class="search-box">
        <input type="text" placeholder="ค้นหาออเดอร์หรือผู้ใช้" />
      </div>

      <nav class="nav-group">
        <p class="section-title">GENERAL</p>
        <button class="nav-item active">Dashboard</button>
        <button class="nav-item" @click="goToAddUser">เพิ่มผู้ใช้</button>
        <button class="nav-item">คำสั่งซื้อ</button>
        <button class="nav-item">รอบนำเข้า</button>
        <button class="nav-item">ลูกค้า</button>
      </nav>

      <nav class="nav-group">
        <p class="section-title">TOOLS</p>
        <button class="nav-item">ตั้งค่าระบบ</button>
        <button class="nav-item">จัดการแอดมิน</button>
        <button class="nav-item">วิธีใช้งาน</button>
      </nav>
    </aside>

    <main class="content">
      <div class="top-bar">
        <div>
          <p class="subtitle">แดชบอร์ดผู้ดูแลระบบ</p>
          <h2>สรุปยอดขายและคำสั่งซื้อล่าสุด</h2>
        </div>
        <div class="top-actions">
          <button class="secondary" @click="goToAddUser">เพิ่มผู้ใช้</button>
          <button class="logout-btn" @click="handleLogout">ออกจากระบบ</button>
        </div>
      </div>

      <section class="summary-cards">
        <div class="summary-card">
          <p>ยอดขายรวม</p>
          <strong>฿{{ formatAmount(summary.totalRevenue) }}</strong>
        </div>
        <div class="summary-card">
          <p>คำสั่งซื้อทั้งหมด</p>
          <strong>{{ summary.totalOrders }}</strong>
        </div>
        <div class="summary-card">
          <p>คำสั่งรอดำเนินการ</p>
          <strong>{{ summary.pendingOrders }}</strong>
        </div>
        <div class="summary-card">
          <p>คำสั่งจ่ายแล้ว</p>
          <strong>{{ summary.paidOrders }}</strong>
        </div>
      </section>

      <section class="card">
        <div class="section-heading">
          <div>
            <p class="label">รายการ Order ล่าสุด</p>
            <p class="description">ดูคำสั่งซื้อจากตาราง order_details พร้อมสรุปยอด</p>
          </div>
        </div>

        <div v-if="loading" class="loading">กำลังดึงข้อมูล...</div>
        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="!loading && !error">
          <table class="order-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>วันที่</th>
                <th>สถานะ</th>
                <th>ประเภท</th>
                <th>ยอดรวม</th>
                <th>จำนวนสินค้า</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.order_id">
                <td>{{ order.order_id }}</td>
                <td>{{ formatDate(order.order_date) }}</td>
                <td>{{ order.status }}</td>
                <td>{{ order.order_type }}</td>
                <td>฿{{ formatAmount(order.total_amount) }}</td>
                <td>{{ order.items }}</td>
              </tr>
              <tr v-if="orders.length === 0">
                <td colspan="6" class="empty-state">ไม่มีคำสั่งซื้อในขณะนี้</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import axios from 'axios'

const router = useRouter()
const { currentUser, logout } = useAuth()

const summary = ref({
  totalOrders: 0,
  totalRevenue: 0,
  pendingOrders: 0,
  paidOrders: 0,
  preorderOrders: 0,
  totalItems: 0,
})
const orders = ref([])
const loading = ref(false)
const error = ref('')

onMounted(() => {
  checkAuth()
  if (currentUser.value?.role === 'admin') {
    fetchDashboard()
  }
})

function checkAuth() {
  if (!currentUser.value || currentUser.value.role !== 'admin') {
    router.push('/login')
  }
}

function handleLogout() {
  logout()
  router.push('/login')
}

function goToAddUser() {
  router.push('/admin/adduser')
}

async function fetchDashboard() {
  loading.value = true
  error.value = ''

  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const [summaryRes, listRes] = await Promise.all([
      axios.get('http://localhost:3000/api/admin/orders-summary', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get('http://localhost:3000/api/admin/order-list', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])

    summary.value = summaryRes.data
    orders.value = listRes.data
  } catch (err) {
    error.value = err.response?.data?.error || 'ไม่สามารถดึงข้อมูลคำสั่งซื้อได้'
  } finally {
    loading.value = false
  }
}

function formatAmount(value) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
</script>

<style scoped>
.admin-page {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  min-height: calc(100vh - 40px);
  padding: 20px;
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  color: #333;
}

.sidebar {
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(124, 95, 255, 0.12);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.brand {
  display: flex;
  gap: 16px;
  align-items: center;
}

.brand-icon {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  background: linear-gradient(135deg, #936dff, #6b81ff);
  color: white;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.5rem;
}

.brand h1 {
  margin: 0;
  font-size: 1.25rem;
}

.brand p {
  margin: 2px 0 0;
  color: #666;
  font-size: 0.95rem;
}

.search-box input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #ece8f5;
  border-radius: 16px;
  background: #f8f6ff;
  outline: none;
  font-size: 0.95rem;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #9a87d1;
  letter-spacing: 0.14em;
  margin-bottom: 8px;
}

.nav-item {
  text-align: left;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 0.95rem;
  color: #4a4a4a;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.25s ease;
}

.nav-item:hover,
.nav-item.active {
  background: #f6efff;
  color: #5e3ff2;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.subtitle {
  color: #7b6cf6;
  margin: 0 0 10px;
  font-size: 0.9rem;
}

.top-bar h2 {
  margin: 0;
  font-size: 2rem;
  line-height: 1.2;
}

.top-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.logout-btn,
.secondary {
  padding: 12px 22px;
  border-radius: 16px;
  border: none;
  background: #f4f1ff;
  color: #5e3ff2;
  font-weight: 700;
  cursor: pointer;
}

.secondary {
  background: white;
  color: #5e3ff2;
  border: 1px solid #dcd5ff;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}

.summary-card {
  background: #fff;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(124, 95, 255, 0.08);
}

.summary-card p {
  margin: 0 0 8px;
  color: #7b6cf6;
  font-weight: 700;
}

.summary-card strong {
  font-size: 1.8rem;
  display: block;
  margin-top: 4px;
  color: #241f47;
}

.card {
  background: #fff;
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 60px rgba(124, 95, 255, 0.12);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}

.label {
  font-weight: 700;
  margin: 0 0 8px;
}

.description {
  margin: 0;
  color: #78739a;
  line-height: 1.7;
}

.order-table {
  width: 100%;
  border-collapse: collapse;
}

.order-table thead th {
  text-align: left;
  padding: 16px;
  color: #5e3ff2;
  border-bottom: 1px solid #eee;
}

.order-table tbody td {
  padding: 16px;
  border-bottom: 1px solid #f0eff9;
  color: #4a4a4a;
}

.order-table tbody tr:hover {
  background: #f8f6ff;
}

.empty-state {
  text-align: center;
  padding: 28px;
  color: #7b6cf6;
}

.loading,
.error {
  padding: 18px 0;
  color: #5e3ff2;
}

.error {
  color: #d52f2f;
}

@media (max-width: 1100px) {
  .admin-page {
    grid-template-columns: 1fr;
  }

  .summary-cards {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .top-bar {
    flex-direction: column;
  }

  .summary-cards {
    grid-template-columns: 1fr;
  }
}
</style>