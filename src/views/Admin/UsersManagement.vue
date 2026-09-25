<template>
  <main class="users-page">
    <AdminPageHeader title="สมาชิก" description="จัดการบัญชีผู้ใช้และผู้ดูแลระบบ"><div class="header-actions">
        <button class="btn-add-user" @click="goToAddUser">
          <span class="add-user-icon add-user-icon--desktop" aria-hidden="true">➕</span>
          <span class="add-user-icon add-user-icon--mobile" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          เพิ่มผู้ใช้ใหม่
        </button>
      </div>
<template #details><div class="member-count">
          <span class="label">สมาชิกทั้งหมด</span>
          <span class="count desktop-member-count">{{ filteredUsers.length }}</span>
          <span class="count mobile-member-count">{{ users.length }}</span>
        </div></template></AdminPageHeader>

    <div class="controls-section">
      <div class="search-box">
        <span class="search-icon search-icon--desktop" aria-hidden="true">🔍</span>
        <span class="search-icon search-icon--mobile" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </span>
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
              <button class="edit-btn" type="button" @click="openEditModal(user)">แก้ไข</button>
              <button class="delete-btn" type="button" @click="deleteUser(user)">ลบ</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="filteredUsers.length > 0" class="mobile-members-list">
      <article
        v-for="user in mobileUsers"
        :key="`mobile-${user.user_id}`"
        class="mobile-member-row"
        :class="{ 'is-expanded': expandedMobileUserId === user.user_id }"
      >
        <button
          type="button"
          class="mobile-member-summary"
          :aria-expanded="expandedMobileUserId === user.user_id"
          @click="toggleMobileUser(user.user_id)"
        >
          <span class="mobile-member-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5.5 19c.7-3.1 2.9-4.8 6.5-4.8s5.8 1.7 6.5 4.8" />
            </svg>
          </span>
          <span class="mobile-member-main">
            <strong>{{ user.username || '-' }}</strong>
            <span>{{ user.full_name || '-' }}</span>
          </span>
          <span
            :class="['mobile-role-badge', String(user.role || 'user').toLowerCase()]"
          >
            {{ String(user.role || 'user').toLowerCase() === 'admin' ? 'Admin' : 'User' }}
          </span>
          <svg
            class="mobile-member-chevron"
            :class="{ expanded: expandedMobileUserId === user.user_id }"
            viewBox="0 0 24 24"
            focusable="false"
            aria-hidden="true"
          >
            <path d="m7 9 5 5 5-5" />
          </svg>
        </button>

        <div v-if="expandedMobileUserId === user.user_id" class="mobile-member-details">
          <dl class="mobile-member-meta">
            <div>
              <dt>เบอร์โทรศัพท์</dt>
              <dd>{{ user.phone_number || '-' }}</dd>
            </div>
            <div>
              <dt>LINE ID</dt>
              <dd>{{ user.line_id || '-' }}</dd>
            </div>
            <div>
              <dt>วันที่สร้าง</dt>
              <dd>{{ user.created_at || '-' }}</dd>
            </div>
          </dl>
          <div class="mobile-member-actions">
            <button type="button" class="mobile-edit-btn" @click="openEditModal(user)">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" />
                <path d="m13.8 6.7 3.5 3.5M4 20.8l3.5-3.5" />
              </svg>
              แก้ไข
            </button>
            <button type="button" class="mobile-delete-btn" @click="deleteUser(user)">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l.8 13h8.4L17 7M10 11v5M14 11v5" />
              </svg>
              ลบ
            </button>
          </div>
        </div>
      </article>

      <div v-if="hasMoreMobileUsers" class="mobile-load-more">
        <span>แสดง {{ mobileUsers.length }} จาก {{ filteredUsers.length }} รายการ</span>
        <button type="button" @click="loadMoreMobileUsers">โหลดเพิ่ม</button>
      </div>
      <p v-else class="mobile-results-count">แสดง {{ mobileUsers.length }} รายการ</p>
    </div>

    <div class="empty-state" v-else>
      <p>ไม่พบผู้ใช้ที่ตรงกับการค้นหา</p>
    </div>

    <!-- Edit User Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>แก้ไขข้อมูลผู้ใช้</h2>
          <button class="close-btn" @click="closeEditModal">✕</button>
        </div>
        <form @submit.prevent="saveUserEdits" class="edit-form">
          <div class="form-group">
            <label for="edit-username">ชื่อผู้ใช้:</label>
            <input v-model="editingUser.username" type="text" id="edit-username" required />
          </div>

          <div class="form-group">
            <label for="edit-password">รหัสผ่าน (ปล่อยว่างไว้เพื่อไม่เปลี่ยนแปลง):</label>
            <input
              v-model="editingUser.password"
              type="password"
              id="edit-password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              minlength="8"
              maxlength="72"
              autocomplete="new-password"
            />
          </div>

          <div class="form-group">
            <label for="edit-full-name">ชื่อจริง:</label>
            <input v-model="editingUser.full_name" type="text" id="edit-full-name" required />
          </div>

          <div class="form-group">
            <label for="edit-phone">เบอร์โทรศัพท์:</label>
            <input v-model="editingUser.phone_number" type="text" id="edit-phone" />
          </div>

          <div class="form-group">
            <label for="edit-line">LINE ID:</label>
            <input v-model="editingUser.line_id" type="text" id="edit-line" />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeEditModal">ยกเลิก</button>
            <button type="submit" class="btn-save">บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { ref, computed, onMounted, watch } from 'vue'
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
const expandedMobileUserId = ref(null)
const mobileDisplayLimit = ref(20)
const MOBILE_BATCH_SIZE = 20
const showEditModal = ref(false)
const editingUser = ref({
  user_id: null,
  username: '',
  password: '',
  full_name: '',
  phone_number: '',
  line_id: '',
})
const currentUser = computed(() => getUser())

const filteredUsers = computed(() => {
  let result = users.value

  if (activeFilter.value !== 'all') {
    result = result.filter((u) => String(u.role || '').toLowerCase() === activeFilter.value)
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((u) => {
      const username = String(u.username || '').toLowerCase()
      const fullName = String(u.full_name || '').toLowerCase()
      return username.includes(query) || fullName.includes(query)
    })
  }

  return result
})

const mobileUsers = computed(() => filteredUsers.value.slice(0, mobileDisplayLimit.value))
const hasMoreMobileUsers = computed(() => mobileDisplayLimit.value < filteredUsers.value.length)

function toggleMobileUser(userId) {
  expandedMobileUserId.value = expandedMobileUserId.value === userId ? null : userId
}

function loadMoreMobileUsers() {
  mobileDisplayLimit.value += MOBILE_BATCH_SIZE
}

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
    if (expandedMobileUserId.value === user.user_id) {
      expandedMobileUserId.value = null
    }
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบผู้ใช้'
  }
}

function openEditModal(user) {
  editingUser.value = {
    user_id: user.user_id,
    username: user.username,
    password: '',
    full_name: user.full_name,
    phone_number: user.phone_number || '',
    line_id: user.line_id || '',
  }
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingUser.value = {
    user_id: null,
    username: '',
    password: '',
    full_name: '',
    phone_number: '',
    line_id: '',
  }
}

async function saveUserEdits() {
  if (!editingUser.value.username || !editingUser.value.full_name) {
    alert('กรุณากรอกชื่อผู้ใช้และชื่อจริง')
    return
  }

  try {
    const payload = {
      username: editingUser.value.username,
      full_name: editingUser.value.full_name,
      phone_number: editingUser.value.phone_number || null,
      line_id: editingUser.value.line_id || null,
    }

    if (editingUser.value.password && editingUser.value.password.trim()) {
      payload.password = editingUser.value.password
    }

    const response = await fetch(`${API_BASE_URL}/admin/users/${editingUser.value.user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': String(currentUser.value?.role || '').toLowerCase() || 'user',
        'x-user-id': String(currentUser.value?.user_id || currentUser.value?.id || ''),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `ไม่สามารถแก้ไขข้อมูลได้ (${response.status})`)
    }

    // Update local data
    const userIndex = users.value.findIndex((u) => u.user_id === editingUser.value.user_id)
    if (userIndex > -1) {
      users.value[userIndex] = {
        ...users.value[userIndex],
        username: editingUser.value.username,
        full_name: editingUser.value.full_name,
        phone_number: editingUser.value.phone_number,
        line_id: editingUser.value.line_id,
      }
    }

    closeEditModal()
    alert('แก้ไขข้อมูลสำเร็จ')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการแก้ไข'
    alert(errorMsg)
    console.error('Error updating user:', err)
  }
}

onMounted(() => {
  fetchUsers()
})

watch([searchQuery, activeFilter], () => {
  mobileDisplayLimit.value = MOBILE_BATCH_SIZE
  expandedMobileUserId.value = null
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

.mobile-member-count,
.add-user-icon--mobile,
.search-icon--mobile {
  display: none;
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

.mobile-members-list {
  display: none;
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
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  box-shadow: 0 4px 12px rgba(111, 80, 160, 0.08);
}

.users-table {
  width: 100%;
  min-width: 760px;
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

.edit-btn {
  border: 1px solid #b788ea;
  background: linear-gradient(180deg, #f3e5f5, #e8d5f2);
  color: #6f50a0;
  font-weight: 700;
  font-size: 0.82rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: 0.5rem;
}

.edit-btn:hover {
  background: #dcc8f5;
  border-color: #9a7dbf;
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #eadff5;
  padding-bottom: 1rem;
}

.modal-header h2 {
  margin: 0;
  color: #2f2348;
  font-size: 1.5rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #9a7dbf;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #6f50a0;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 0.5rem;
  color: #2f2348;
  font-weight: 600;
  font-size: 0.9rem;
}

.form-group input {
  padding: 0.75rem;
  border: 1px solid #eadff5;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #3b2f57;
  transition: all 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #b788ea;
  box-shadow: 0 0 0 4px rgba(183, 136, 234, 0.12);
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
  border-top: 1px solid #eadff5;
  padding-top: 1rem;
}

.btn-cancel {
  padding: 0.7rem 1.5rem;
  border: 1px solid #dcc8f5;
  background: white;
  color: #6f50a0;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f8f5ff;
  border-color: #b788ea;
}

.btn-save {
  padding: 0.7rem 1.5rem;
  border: none;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: white;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(132, 86, 179, 0.24);
}

.btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(132, 86, 179, 0.32);
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

@media (max-width: 600px) {
  .table-container {
    overflow: visible;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .users-table,
  .users-table thead,
  .users-table tbody,
  .users-table tr,
  .users-table td {
    display: block;
    width: 100%;
  }

  .users-table thead {
    display: none;
  }

  .users-table tr {
    margin-bottom: 0.8rem;
    padding: 0.8rem;
    border: 1px solid #eadcf6;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(84, 54, 113, 0.06);
  }

  .users-table td {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.45rem 0;
    border: 0;
    text-align: right;
  }

  .users-table td::before {
    flex: 0 0 auto;
    color: #8a789f;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
  }

  .users-table td:nth-child(1)::before { content: 'ชื่อผู้ใช้'; }
  .users-table td:nth-child(2)::before { content: 'ชื่อจริง'; }
  .users-table td:nth-child(3)::before { content: 'Role'; }
  .users-table td:nth-child(4)::before { content: 'โทรศัพท์'; }
  .users-table td:nth-child(5)::before { content: 'LINE ID'; }
  .users-table td:nth-child(6)::before { content: 'สร้างเมื่อ'; }

  .users-table td:last-child {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem;
    padding-top: 0.7rem;
  }

  .users-table td:last-child::before {
    display: none;
  }

  .users-table td:last-child button {
    width: 100%;
  }
}
@media (max-width: 600px) {
  .users-table { min-width: 0; table-layout: fixed; }
  .users-table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .users-table td::before { max-width: 40%; }
  .users-table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
  .users-table td:last-child > * { max-width: 100%; }
}

@media (max-width: 767px) {
  .users-page {
    padding: 0.75rem;
    background: linear-gradient(180deg, #faf7ff 0%, #f4efff 100%);
  }

  .admin-page-heading {
    align-items: stretch;
    gap: 0.75rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 16px;
  }

  .admin-page-heading__copy {
    flex-basis: auto;
  }

  .admin-page-heading h1 {
    font-size: 1.35rem;
    line-height: 1.35;
  }

  .admin-page-heading p {
    display: none;
  }

  .admin-page-heading__details {
    margin-top: 0.3rem;
  }

  .member-count {
    gap: 0.35rem;
  }

  .member-count .label {
    font-size: 0.75rem;
  }

  .member-count .count {
    font-size: 1.2rem;
  }

  .desktop-member-count {
    display: none;
  }

  .mobile-member-count,
  .add-user-icon--mobile,
  .search-icon--mobile {
    display: inline-flex;
  }

  .add-user-icon--desktop,
  .search-icon--desktop {
    display: none;
  }

  .admin-page-heading__actions,
  .btn-add-user {
    width: 100%;
  }

  .btn-add-user {
    justify-content: center;
    padding: 0.7rem 1rem;
    font-size: 0.9rem;
    border-radius: 10px;
  }

  .add-user-icon--mobile {
    width: 1.05rem;
    height: 1.05rem;
    align-items: center;
    justify-content: center;
  }

  .add-user-icon--mobile svg,
  .search-icon--mobile svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .controls-section {
    gap: 0.65rem;
    margin-bottom: 0.9rem;
  }

  .search-box {
    min-width: 0;
    width: 100%;
  }

  .search-icon--mobile {
    left: 0.85rem;
    width: 1.05rem;
    height: 1.05rem;
    color: #8c68b6;
  }

  .search-input {
    padding: 0.75rem 0.8rem 0.75rem 2.35rem;
    border-radius: 11px;
    font-size: 0.85rem;
  }

  .filter-buttons {
    width: 100%;
    gap: 0.4rem;
  }

  .filter-btn {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0.35rem;
    font-size: 0.82rem;
  }

  .table-container {
    display: none;
  }

  .mobile-members-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .mobile-member-row {
    overflow: hidden;
    border: 1px solid #eadff5;
    border-radius: 15px;
    background: #fff;
    box-shadow: 0 4px 14px rgba(111, 80, 160, 0.07);
  }

  .mobile-member-summary {
    display: grid;
    grid-template-columns: 2.35rem minmax(0, 1fr) auto 1.25rem;
    align-items: center;
    width: 100%;
    gap: 0.65rem;
    padding: 0.8rem 0.75rem;
    border: 0;
    background: transparent;
    color: #3b2f57;
    text-align: left;
    cursor: pointer;
  }

  .mobile-member-summary:focus-visible,
  .mobile-member-actions button:focus-visible,
  .mobile-load-more button:focus-visible {
    outline: 3px solid rgba(183, 136, 234, 0.35);
    outline-offset: 2px;
  }

  .mobile-member-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 11px;
    background: #f1e9fb;
    color: #8055ad;
  }

  .mobile-member-avatar svg,
  .mobile-member-chevron,
  .mobile-member-actions svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
  }

  .mobile-member-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.1rem;
  }

  .mobile-member-main strong,
  .mobile-member-main span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-member-main strong {
    color: #432f61;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .mobile-member-main span {
    color: #81718f;
    font-size: 0.75rem;
  }

  .mobile-role-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .mobile-role-badge.user {
    background: #e8f5f2;
    color: #1b7a6b;
  }

  .mobile-role-badge.admin {
    background: #f3e5f5;
    color: #6f50a0;
  }

  .mobile-member-chevron {
    color: #9a7dbf;
    transition: transform 0.2s ease;
  }

  .mobile-member-chevron.expanded {
    transform: rotate(180deg);
  }

  .mobile-member-details {
    padding: 0 0.75rem 0.8rem;
    border-top: 1px solid #f0e8f8;
  }

  .mobile-member-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    margin: 0;
    padding: 0.75rem 0;
  }

  .mobile-member-meta div {
    min-width: 0;
  }

  .mobile-member-meta dt {
    margin-bottom: 0.15rem;
    color: #9a7dbf;
    font-size: 0.65rem;
  }

  .mobile-member-meta dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #4d3d71;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .mobile-member-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .mobile-member-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 2.25rem;
    border-radius: 9px;
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .mobile-edit-btn {
    border: 1px solid #b788ea;
    background: #f7f0ff;
    color: #6f50a0;
  }

  .mobile-delete-btn {
    border: 1px solid #f5b5c1;
    background: #fff4f6;
    color: #c2415c;
  }

  .mobile-member-actions svg {
    width: 0.95rem;
    height: 0.95rem;
  }

  .mobile-load-more,
  .mobile-results-count {
    margin: 0.2rem 0 0.15rem;
    color: #81718f;
    font-size: 0.75rem;
    text-align: center;
  }

  .mobile-load-more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.2rem 0.15rem;
  }

  .mobile-load-more button {
    flex: 0 0 auto;
    padding: 0.45rem 0.85rem;
    border: 1px solid #b788ea;
    border-radius: 999px;
    background: #fff;
    color: #6f50a0;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
}
</style>
