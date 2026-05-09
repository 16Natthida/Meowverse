<template>
  <main class="users-page">
    <div class="page-header">
      <div class="header-content">
        <h1>สมาชิก</h1>
        <p>จัดการบัญชีผู้ใช้และผู้ดูแลระบบ</p>
        <div class="member-count">
          <span class="label">สมาชิกทั้งหมด</span>
          <span class="count">{{ filteredUsers.length }}</span>
        </div>
      </div>
      <button class="btn-add-user" @click="goToAddUser"><span>➕</span> เพิ่มผู้ใช้ใหม่</button>
    </div>

    <div class="controls-section">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาชื่อผู้ใช้หรือชื่อจริง..."
          class="search-input"
        />
      </div>

      <div class="filter-buttons">
        <button
          :class="['filter-btn', { active: activeFilter === 'all' }]"
          @click="activeFilter = 'all'"
        >
          ทั้งหมด
        </button>
        <button
          :class="['filter-btn', { active: activeFilter === 'user' }]"
          @click="activeFilter = 'user'"
        >
          Users
        </button>
        <button
          :class="['filter-btn', { active: activeFilter === 'admin' }]"
          @click="activeFilter = 'admin'"
        >
          Admins
        </button>
      </div>
    </div>

    <div class="table-container" v-if="filteredUsers.length > 0">
      <table class="users-table">
        <thead>
          <tr>
            <th>ชื่อผู้ใช้</th>
            <th>ชื่อจริง</th>
            <th>Role</th>
            <th>เบอร์โทรศัพท์</th>
            <th>LINE ID</th>
            <th>วันที่สร้าง</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in filteredUsers"
            :key="user.user_id"
            :class="['user-row', user.role.toLowerCase()]"
          >
            <td class="username-cell">
              <span class="username">{{ user.username }}</span>
            </td>
            <td>{{ user.full_name }}</td>
            <td>
              <span :class="['role-badge', user.role.toLowerCase()]">
                {{ user.role === 'admin' ? '👨‍💼 Admin' : '👤 User' }}
              </span>
            </td>
            <td>{{ user.phone_number || '-' }}</td>
            <td>{{ user.line_id || '-' }}</td>
            <td class="date-cell">{{ user.created_at }}</td>
            <td class="actions-cell">
              <button class="delete-btn" type="button" @click="deleteUser(user)">ลบ</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="empty-state" v-else>
      <p>ไม่พบผู้ใช้ที่ตรงกับการค้นหา</p>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { getUser } = useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const users = ref([])
const searchQuery = ref('')
const activeFilter = ref('all')
const loading = ref(false)
const fetchError = ref('')
const currentUser = computed(() => getUser())

const filteredUsers = computed(() => {
  let result = users.value

  if (activeFilter.value !== 'all') {
    result = result.filter((u) => u.role.toLowerCase() === activeFilter.value)
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (u) => u.username.toLowerCase().includes(query) || u.full_name.toLowerCase().includes(query),
    )
  }

  return result
})

async function fetchUsers() {
  loading.value = true
  fetchError.value = ''
  try {
    const user = getUser()
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      headers: {
        'x-user-role': String(user?.role || '').toLowerCase() || 'user',
        'x-user-id': String(user?.user_id || user?.id || ''),
      },
    })

    if (!response.ok) {
      throw new Error(`ไม่สามารถโหลดรายชื่อผู้ใช้ได้ (${response.status})`)
    }

    users.value = await response.json()
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
    console.error('Error fetching users:', err)
  } finally {
    loading.value = false
  }
}

function goToAddUser() {
  router.push('/admin/users/add')
}

async function deleteUser(user) {
  if (!confirm(`ต้องการลบผู้ใช้ ${user.username} ใช่หรือไม่?`)) {
    return
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${user.user_id}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': String(currentUser.value?.role || '').toLowerCase() || 'user',
        'x-user-id': String(currentUser.value?.user_id || currentUser.value?.id || ''),
      },
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `ไม่สามารถลบผู้ใช้ได้ (${response.status})`)
    }

    users.value = users.value.filter((item) => item.user_id !== user.user_id)
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบผู้ใช้'
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<style scoped>
.users-page {
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, #faf7ff 0%, #f4efff 100%);
  font-family: 'Kanit', sans-serif;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 20px;
  border: 1px solid #eadff5;
  box-shadow: 0 4px 12px rgba(111, 80, 160, 0.08);
}

.header-content h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  color: #2f2348;
}

.header-content p {
  margin: 0 0 1rem 0;
  color: #6f628d;
  font-size: 0.95rem;
}

.member-count {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.member-count .label {
  color: #9a7dbf;
  font-size: 0.85rem;
}

.member-count .count {
  font-size: 1.8rem;
  font-weight: 800;
  color: #6f50a0;
}

.btn-add-user {
  padding: 0.85rem 1.5rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: white;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 8px 16px rgba(132, 86, 179, 0.24);
}

.btn-add-user:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 20px rgba(132, 86, 179, 0.32);
}

.controls-section {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 250px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  font-size: 1rem;
  color: #b8a8ca;
}

.search-input {
  width: 100%;
  padding: 0.9rem 1rem 0.9rem 2.5rem;
  border: 1px solid #eadff5;
  border-radius: 12px;
  background: white;
  font-size: 0.95rem;
  color: #3b2f57;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: #b788ea;
  box-shadow: 0 0 0 4px rgba(183, 136, 234, 0.12);
}

.filter-buttons {
  display: flex;
  gap: 0.5rem;
}

.filter-btn {
  padding: 0.7rem 1.2rem;
  border: 1px solid #dcc8f5;
  border-radius: 999px;
  background: white;
  color: #6f628d;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: #b788ea;
  color: #6f50a0;
}

.filter-btn.active {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: white;
  border-color: #b788ea;
}

.table-container {
  background: white;
  border-radius: 16px;
  border: 1px solid #eadff5;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(111, 80, 160, 0.08);
}

.users-table {
  width: 100%;
  border-collapse: collapse;
}

.users-table thead {
  background: linear-gradient(180deg, #f8f5ff, #f3e5f5);
  border-bottom: 2px solid #eadff5;
}

.users-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 700;
  color: #5d4b8c;
  font-size: 0.9rem;
}

.users-table tbody tr {
  border-bottom: 1px solid #f0e8f8;
  transition: background-color 0.2s;
}

.users-table tbody tr:hover {
  background-color: #faf7ff;
}

.user-row.admin {
  background-color: rgba(205, 162, 251, 0.04);
}

.username-cell {
  font-weight: 600;
}

.username {
  color: #2f2348;
  padding: 0.3rem 0.6rem;
  background: #f3e5f5;
  border-radius: 6px;
  font-size: 0.9rem;
}

.users-table td {
  padding: 1rem;
  color: #4d3d71;
  font-size: 0.95rem;
}

.role-badge {
  display: inline-block;
  padding: 0.5rem 0.8rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85rem;
}

.role-badge.user {
  background: #e8f5f2;
  color: #1b7a6b;
}

.role-badge.admin {
  background: #f3e5f5;
  color: #6f50a0;
}

.date-cell {
  font-size: 0.9rem;
  color: #9a7dbf;
}

.actions-cell {
  width: 92px;
}

.delete-btn {
  border: 1px solid #f5b5c1;
  background: linear-gradient(180deg, #fff, #fff4f6);
  color: #c2415c;
  font-weight: 700;
  font-size: 0.82rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn:hover {
  background: #ffe7ec;
  border-color: #ef9aaa;
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  background: white;
  border-radius: 16px;
  border: 1px dashed #eadff5;
  color: #9a7dbf;
  font-size: 1rem;
}

.error-state {
  margin-bottom: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #9f1239;
  font-weight: 600;
}

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-add-user {
    width: 100%;
    justify-content: center;
  }

  .controls-section {
    flex-direction: column;
  }

  .search-box {
    flex: 1 100%;
  }

  .filter-buttons {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .users-page {
    padding: 1rem;
  }

  .users-table {
    font-size: 0.85rem;
  }

  .users-table th,
  .users-table td {
    padding: 0.75rem;
  }

  .search-input {
    padding: 0.7rem 0.8rem 0.7rem 2.2rem;
  }
}
</style>
