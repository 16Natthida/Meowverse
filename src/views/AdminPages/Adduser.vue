<template>
  <main class="adduser-page">
    <section class="form-panel">
      <div class="panel-header">
        <div>
          <p class="subtitle">เพิ่มบัญชีผู้ใช้</p>
          <h1>สร้างผู้ใช้หรือแอดมินใหม่</h1>
        </div>
        <button class="button-back" @click="goBack">กลับไปแดชบอร์ด</button>
      </div>

      <form class="adduser-form" @submit.prevent="onSubmit">
        <div class="field-group">
          <label>ชื่อผู้ใช้</label>
          <input v-model="form.username" type="text" placeholder="username" required />
        </div>

        <div class="field-group">
          <label>รหัสผ่าน</label>
          <input v-model="form.password" type="password" placeholder="password" required />
        </div>

        <div class="field-group">
          <label>ชื่อ-สกุล</label>
          <input v-model="form.full_name" type="text" placeholder="Full name" required />
        </div>

        <div class="field-group">
          <label>Role</label>
          <select v-model="form.role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div class="field-group">
          <label>เบอร์โทรศัพท์</label>
          <input v-model="form.phone_number" type="text" placeholder="Phone number" />
        </div>

        <div class="field-group">
          <label>LINE ID</label>
          <input v-model="form.line_id" type="text" placeholder="LINE ID" />
        </div>

        <div class="field-group">
          <label>หมายเหตุเพิ่มเติม</label>
          <textarea v-model="form.notes" placeholder="Notes" rows="4"></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary" :disabled="loading">บันทึก</button>
          <button type="button" class="btn-secondary" @click="resetForm">รีเซ็ต</button>
        </div>

        <div class="message">
          <p v-if="error" class="error">{{ error }}</p>
          <p v-if="success" class="success">{{ success }}</p>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import axios from 'axios'

const router = useRouter()
const { logout } = useAuth()
const form = ref({
  username: '',
  password: '',
  full_name: '',
  role: 'user',
  phone_number: '',
  line_id: '',
  notes: '',
})
const loading = ref(false)
const error = ref('')
const success = ref('')

function goBack() {
  router.push('/admin')
}

function resetForm() {
  form.value = {
    username: '',
    password: '',
    full_name: '',
    role: 'user',
    phone_number: '',
    line_id: '',
    notes: '',
  }
  error.value = ''
  success.value = ''
}

async function onSubmit() {
  error.value = ''
  success.value = ''
  if (!form.value.username || !form.value.password || !form.value.full_name) {
    error.value = 'กรุณากรอกข้อมูลให้ครบทุกช่อง'
    return
  }

  loading.value = true
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const response = await axios.post('http://localhost:3000/api/users', form.value, {
      headers: { Authorization: `Bearer ${token}` },
    })

    success.value = response.data.message || 'เพิ่มผู้ใช้สำเร็จ'
    resetForm()
  } catch (err) {
    error.value = err.response?.data?.error || 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.adduser-page {
  min-height: 100vh;
  width: 100%;
  max-width: 950px;
  margin: 0 auto;
  background: #f7f5ff;
  padding: 30px 20px;
}

.form-panel {
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(124, 95, 255, 0.08);
  padding: 32px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}

.subtitle {
  margin: 0 0 8px;
  color: #7b6cf6;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.8rem;
}

.panel-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #241f47;
}

.button-back,
.btn-secondary,
.btn-primary {
  border: none;
  border-radius: 14px;
  padding: 12px 24px;
  font-weight: 700;
  cursor: pointer;
}

.button-back,
.btn-secondary {
  background: #f4f1ff;
  color: #5e3ff2;
}

.btn-primary {
  background: #5e3ff2;
  color: #fff;
}

.adduser-form {
  display: grid;
  gap: 18px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group label {
  color: #5b4cae;
  font-weight: 600;
}

.field-group input,
.field-group select,
.field-group textarea {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #ece8f5;
  border-radius: 16px;
  background: #faf7ff;
  font-size: 1rem;
}

.field-group textarea {
  resize: vertical;
  min-height: 110px;
}

.form-actions {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.message {
  margin-top: 14px;
}

.error {
  color: #d52f2f;
}

.success {
  color: #0f7d3f;
}
</style>
