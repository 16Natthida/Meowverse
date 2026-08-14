<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const profile = ref({
  user_id: null,
  username: '',
  full_name: '',
  phone_number: '',
  line_id: '',
  notes: '',
})
const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const success = ref(null)

function getStoredUser() {
  const stored = localStorage.getItem('meowverse-user') ? localStorage : sessionStorage
  try {
    return JSON.parse(stored.getItem('meowverse-user') || '{}')
  } catch {
    return null
  }
}

function updateStoredUser(data) {
  const stored = localStorage.getItem('meowverse-user') ? localStorage : sessionStorage
  const existing = getStoredUser() || {}
  stored.setItem('meowverse-user', JSON.stringify({ ...existing, ...data }))
}

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'x-user-role': String(currentUser.value?.role || '').toLowerCase() || 'user',
  'x-user-id': String(currentUser.value?.user_id || currentUser.value?.id || ''),
})

async function fetchProfile() {
  loading.value = true
  error.value = null
  success.value = null

  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      headers: authHeaders(),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`)
    }

    const data = await response.json()
    profile.value = {
      user_id: data.user_id,
      username: data.username,
      full_name: data.full_name || '',
      phone_number: data.phone_number || '',
      line_id: data.line_id || '',
      notes: data.notes || '',
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  error.value = null
  success.value = null

  const sanitizedPhone = String(profile.value.phone_number || '').replace(/\D/g, '')

  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        full_name: profile.value.full_name,
        phone_number: sanitizedPhone,
        line_id: profile.value.line_id,
        notes: profile.value.notes,
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error || `บันทึกไม่สำเร็จ (${response.status})`)
    }

    const body = await response.json()
    success.value = body.message || 'บันทึกข้อมูลเรียบร้อยแล้ว'
    updateStoredUser({ full_name: profile.value.full_name })
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push('/dashboard')
}

onMounted(fetchProfile)
</script>

<template>
  <div class="profile-page">
    <nav class="navbar">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="back-icon">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับหน้าหลัก
      </button>
      <div class="navbar__logo">
        <span class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
      <div class="navbar__title">บัญชีของฉัน</div>
    </nav>

    <div class="content">
      <div v-if="loading" class="state-wrap">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูลบัญชี...</p>
      </div>

      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn-retry" @click="fetchProfile">ลองใหม่</button>
      </div>

      <div v-else class="profile-form-card">
        <div class="profile-section">
          <label>ชื่อผู้ใช้</label>
          <input type="text" v-model="profile.username" readonly />
        </div>

        <div class="profile-section">
          <label class="profile-label">ชื่อ-นามสกุล</label>
          <input type="text" v-model="profile.full_name" />
        </div>

        <div class="profile-section">
          <label class="profile-label">เบอร์โทร</label>
          <input type="text" v-model="profile.phone_number" placeholder="เช่น 0999999999" />
        </div>

        <div class="profile-section">
          <label class="profile-label">LINE ID</label>
          <input type="text" v-model="profile.line_id" placeholder="LINE ID" />
        </div>

        <div class="profile-section">
          <label class="profile-label">หมายเหตุ</label>
          <textarea rows="4" v-model="profile.notes" placeholder="เช่น วิธีติดต่อพิเศษ หรือหมายเหตุอื่น ๆ"></textarea>
        </div>

        <div class="profile-actions">
          <button class="btn btn--primary" type="button" @click="saveProfile" :disabled="saving">
            {{ saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล' }}
          </button>
        </div>

        <div class="message-row">
          <p v-if="success" class="success-box">{{ success }}</p>
          <p v-if="!success && !error" class="hint-text">คุณสามารถแก้ไขข้อมูลส่วนตัวในหน้านี้ได้</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #f8f5ff;
  color: #3f2f5d;
  font-family: 'Kanit', sans-serif;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1.5rem;
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e8dff4;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #5f3d88;
  background: transparent;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
}

.back-icon {
  width: 1.2rem;
  height: 1.2rem;
}

.navbar__logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f0e8ff;
  color: #6f50a0;
}

.navbar__title {
  font-size: 1.1rem;
  font-weight: 700;
}

.content {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1.25rem;
}

.state-wrap,
.profile-form-card {
  background: #fff;
  border: 1px solid #e8dff4;
  border-radius: 24px;
  box-shadow: 0 16px 40px rgba(111, 80, 160, 0.08);
  padding: 2rem;
}

.loader {
  width: 42px;
  height: 42px;
  border: 4px solid #e9dff9;
  border-top-color: #7c4dff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.profile-section {
  display: grid;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.profile-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: #4f3b76;
}

input,
textarea {
  width: 100%;
  border: 1px solid #e3d7f4;
  border-radius: 16px;
  padding: 0.9rem 1rem;
  font-size: 0.95rem;
  color: #3f2f5d;
  background: #fff;
}

input[readonly] {
  background: #f7f2ff;
  opacity: 0.9;
}

textarea {
  min-height: 120px;
  resize: vertical;
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1rem;
}

.btn {
  border: none;
  border-radius: 14px;
  padding: 0.95rem 1.4rem;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
}

.btn--primary {
  background: linear-gradient(160deg, #7d5cff, #5d3aff);
  color: #fff;
}

.success-box,
.error-box,
.hint-text {
  margin-top: 1rem;
  font-size: 0.95rem;
  line-height: 1.6;
}

.success-box {
  color: #0f7c51;
}

.error-box {
  color: #b91c1c;
}

.btn-retry {
  margin-top: 1rem;
  background: #f3e8ff;
  color: #6f50a0;
  border: 1px solid #e9d5ff;
  border-radius: 14px;
  padding: 0.85rem 1.25rem;
  cursor: pointer;
}

@media (max-width: 768px) {
  .content {
    margin: 1.5rem auto;
  }

  .profile-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
