<template>
  <div class="user-home">
    <header class="user-header">
      <div class="welcome">
        <h1>ยินดีต้อนรับ, {{ currentUser?.username || 'User' }}</h1>
        <p>จัดการคำสั่งซื้อและสินค้าของคุณ</p>
      </div>
      <button class="logout-btn" @click="handleLogout">ออกจากระบบ</button>
    </header>

    <main class="user-content">
      <section class="dashboard-cards">
        <div class="card">
          <h3>คำสั่งซื้อของฉัน</h3>
          <p>ดูและติดตามสถานะคำสั่งซื้อ</p>
          <button class="card-btn">ดูคำสั่งซื้อ</button>
        </div>
        <div class="card">
          <h3>สินค้าแนะนำ</h3>
          <p>ค้นหาสินค้าใหม่ๆ สำหรับแมวของคุณ</p>
          <button class="card-btn">ดูสินค้า</button>
        </div>
        <div class="card">
          <h3>ข้อมูลส่วนตัว</h3>
          <p>จัดการข้อมูลและที่อยู่จัดส่ง</p>
          <button class="card-btn">แก้ไขข้อมูล</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { currentUser, logout } = useAuth()

onMounted(() => {
  if (!currentUser.value) {
    router.push('/login')
  }
})

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style scoped>
.user-home {
  min-height: 100vh;
  background: #f7f5ff;
  padding: 20px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(124, 95, 255, 0.08);
  margin-bottom: 24px;
}

.welcome h1 {
  margin: 0;
  font-size: 2rem;
  color: #241f47;
}

.welcome p {
  margin: 8px 0 0;
  color: #6f6b8d;
}

.logout-btn {
  padding: 12px 24px;
  background: #f4f1ff;
  color: #5e3ff2;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.3s;
}

.logout-btn:hover {
  background: #e2d9ff;
}

.user-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.card {
  background: #ffffff;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(124, 95, 255, 0.08);
  text-align: center;
}

.card h3 {
  margin: 0 0 8px;
  color: #241f47;
  font-size: 1.25rem;
}

.card p {
  margin: 0 0 16px;
  color: #6f6b8d;
  line-height: 1.5;
}

.card-btn {
  padding: 10px 20px;
  background: #5e3ff2;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.3s;
}

.card-btn:hover {
  background: #4c2ae0;
}
</style>