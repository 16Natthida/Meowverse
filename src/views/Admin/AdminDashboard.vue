<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { logout, getUser } = useAuth()

const currentUser = computed(() => getUser())
const activeMenu = ref('Dashboard')

const menuItems = [
  { name: 'Dashboard', icon: '📊' },
  { name: 'Orders', icon: '📦' },
  { name: 'Products', icon: '🛍️' },
  { name: 'Categories', icon: '🏷️' },
  { name: 'Users', icon: '👥' },
  { name: 'Reports', icon: '📈' },
  { name: 'Settings', icon: '⚙️' },
]

const stats = [
  { label: 'ยอดขายทั้งหมด', value: '฿55,320', change: '+12% จากเดือนที่แล้ว', color: '#c9a6ff' },
  { label: 'คำสั่งซื้อใหม่', value: '48 ออเดอร์', change: 'สัปดาห์นี้', color: '#ffb4d6' },
  { label: 'ลูกค้าใหม่', value: '19 ราย', change: 'เพิ่มขึ้นวันนี้', color: '#8dd3c7' },
  { label: 'สินค้าใกล้หมด', value: '7 รายการ', change: 'ควรเติมสต็อก', color: '#ffcc80' },
]

function handleLogout() {
  if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
    logout()
    router.push('/login')
  }
}
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-circle">🐱</div>
        <div class="brand-info">
          <h2>Meowverse</h2>
          <p>Admin Panel</p>
        </div>
      </div>

      <nav class="sidebar-menu">
        <div class="menu-group">
          <h3 class="group-label">Main Menu</h3>
          <button
            v-for="item in menuItems"
            :key="item.name"
            :class="['menu-btn', { active: activeMenu === item.name }]"
            @click="activeMenu = item.name"
          >
            <span class="icon">{{ item.icon }}</span>
            <span class="text">{{ item.name }}</span>
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout"><span>🚪</span> ออกจากระบบ</button>
      </div>
    </aside>

    <main class="main-body">
      <header class="top-nav">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="ค้นหาออเดอร์ หรือ สินค้า..." />
        </div>
        <div class="admin-profile">
          <div class="profile-info">
            <span class="name">{{ currentUser?.username || 'Admin' }}</span>
            <span class="role">Administrator</span>
          </div>
          <div class="avatar-box">AD</div>
        </div>
      </header>

      <div class="scroll-content">
        <section class="welcome-section">
          <h1>สวัสดีคุณ {{ currentUser?.username || 'Admin' }} 👋</h1>
          <p>นี่คือภาพรวมของร้าน Meowverse Pet Shop ในวันนี้</p>
        </section>

        <section class="stats-grid">
          <div v-for="(stat, idx) in stats" :key="idx" class="stat-card">
            <div class="stat-top">
              <span class="stat-label">{{ stat.label }}</span>
              <div class="dot" :style="{ backgroundColor: stat.color }"></div>
            </div>
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-footer">{{ stat.change }}</div>
          </div>
        </section>

        <div class="dashboard-row">
          <section class="table-container main-table">
            <div class="table-header">
              <h2>📦 คำสั่งซื้อล่าสุด</h2>
              <button class="view-all">ดูทั้งหมด</button>
            </div>
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>สินค้า</th>
                  <th>ยอดเงิน</th>
                  <th>สถานะ</th>
                  <th>วันที่</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>#220-2-122569</td>
                  <td>อาหารแมว MOJO</td>
                  <td>฿674</td>
                  <td><span class="status pending">รอดำเนินการ</span></td>
                  <td>29 มี.ค. 2026</td>
                </tr>
                <tr>
                  <td>#220-2-122570</td>
                  <td>เสื้อแมว Zeze</td>
                  <td>฿1,230</td>
                  <td><span class="status success">สำเร็จแล้ว</span></td>
                  <td>28 มี.ค. 2026</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="table-container side-table">
            <div class="table-header">
              <h2>⚠️ สินค้าใกล้หมด</h2>
            </div>
            <div class="inventory-list">
              <div class="inventory-item">
                <div class="item-name">เบ็ดตกแมว Cloudy</div>
                <div class="item-stock warning">เหลือ 3 ชิ้น</div>
              </div>
              <div class="inventory-item">
                <div class="item-name">ทรายแมวภูเขาไฟ</div>
                <div class="item-stock warning">เหลือ 5 ชิ้น</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap');

.admin-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #fcd9f3;
  font-family: 'Kanit', sans-serif;
  overflow: hidden;
}

/* SIDEBAR */
.sidebar {
  width: 260px;
  background: white;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 15px rgba(0, 0, 0, 0.02);
  z-index: 10;
}

.sidebar-header {
  padding: 2rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f1f1f1;
}

.logo-circle {
  width: 45px;
  height: 45px;
  background: #f3e5f5;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.brand-info h2 {
  font-size: 1.1rem;
  color: #333;
  margin: 0;
}
.brand-info p {
  font-size: 0.75rem;
  color: #aaa;
  margin: 0;
}

.sidebar-menu {
  flex: 1;
  padding: 1.5rem 1rem;
}

.group-label {
  font-size: 0.7rem;
  color: #ccc;
  letter-spacing: 1px;
  margin-bottom: 1rem;
  padding-left: 0.5rem;
}

.menu-btn {
  width: 100%;
  padding: 0.85rem 1rem;
  margin-bottom: 0.4rem;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: #666;
  font-family: 'Kanit', sans-serif;
}

.menu-btn:hover {
  background: #fcf8ff;
  color: #c9a6ff;
}
.menu-btn.active {
  background: #c9a6ff;
  color: white;
  box-shadow: 0 4px 12px rgba(201, 166, 255, 0.3);
}

.logout-btn {
  margin: 1.5rem;
  padding: 0.8rem;
  border-radius: 12px;
  border: 1px solid #fee2e2;
  background: #fff5f5;
  color: #ef4444;
  cursor: pointer;
  font-family: 'Kanit', sans-serif;
  transition: 0.3s;
}
.logout-btn:hover {
  background: #ef4444;
  color: white;
}

/* MAIN BODY */
.main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-nav {
  height: 70px;
  background: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  border-bottom: 1px solid #f1f1f1;
}

.search-bar {
  background: #f8f9fa;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-bar input {
  border: none;
  background: transparent;
  outline: none;
  width: 250px;
  font-family: 'Kanit';
}

.admin-profile {
  display: flex;
  align-items: center;
  gap: 15px;
}
.profile-info {
  text-align: right;
}
.profile-info .name {
  display: block;
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}
.profile-info .role {
  font-size: 0.75rem;
  color: #aaa;
}
.avatar-box {
  width: 40px;
  height: 40px;
  background: #c9a6ff;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.scroll-content {
  flex: 1;
  padding: 2rem; /* ✅ แก้ไขจุดนี้ให้เหลือแค่นี้ */
  overflow-y: auto;
}

.welcome-section h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #333;
}
.welcome-section p {
  color: #888;
  margin-bottom: 2rem;
}

/* STATS */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}
.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.stat-label {
  color: #888;
  font-size: 0.9rem;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 0.5rem;
}
.stat-footer {
  font-size: 0.75rem;
  color: #4ade80;
}

/* TABLE */
.dashboard-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
}
.table-container {
  background: white;
  padding: 1.5rem;
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.table-header h2 {
  font-size: 1.1rem;
  color: #333;
}
.view-all {
  color: #c9a6ff;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: 'Kanit';
}

.custom-table {
  width: 100%;
  border-collapse: collapse;
}
.custom-table th {
  text-align: left;
  padding: 1rem;
  color: #aaa;
  font-size: 0.8rem;
  border-bottom: 1px solid #f8f9fa;
}
.custom-table td {
  padding: 1rem;
  font-size: 0.9rem;
  color: #555;
  border-bottom: 1px solid #f8f9fa;
}

.status {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 0.75rem;
}
.status.pending {
  background: #fff8e1;
  color: #ffb300;
}
.status.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.inventory-item {
  display: flex;
  justify-content: space-between;
  padding: 1rem 0;
  border-bottom: 1px solid #f8f9fa;
}
.item-stock.warning {
  color: #ef4444;
  font-weight: 600;
}

@media (max-width: 1024px) {
  .dashboard-row {
    grid-template-columns: 1fr;
  }
}
</style>
