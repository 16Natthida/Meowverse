<template>
  <main class="adduser-page">
    <div class="page-orb page-orb--one" aria-hidden="true"></div>
    <div class="page-orb page-orb--two" aria-hidden="true"></div>

    <section class="hero-panel">
      <div>
        <p class="subtitle">เพิ่มบัญชีผู้ใช้</p>
        <h1>สร้างผู้ใช้หรือแอดมินใหม่</h1>
        <p class="hero-copy">
          เพิ่มบัญชีให้ทีมงานหรือผู้ใช้งานได้ในหน้าเดียว พร้อมตรวจข้อมูลก่อนบันทึก
        </p>
      </div>
      <div class="hero-badge">Admin Control</div>
    </section>

    <div class="content-grid">
      <section class="form-panel">
        <div class="panel-header">
          <div>
            <h2>ข้อมูลบัญชี</h2>
            <p>กรอกข้อมูลหลักให้ครบ แล้วระบบจะส่งตรงไปยังฐานข้อมูล</p>
          </div>
          <button class="button-back" @click="goBack">กลับไปแดชบอร์ด</button>
        </div>

        <form class="adduser-form" @submit.prevent="onSubmit">
          <div class="form-row form-row--two">
            <div class="field-group">
              <label>ชื่อผู้ใช้</label>
              <input v-model="form.username" type="text" placeholder="username" required />
            </div>

            <div class="field-group">
              <label>รหัสผ่าน</label>
              <input v-model="form.password" type="password" placeholder="password" required />
            </div>
          </div>

          <div class="field-group">
            <label>ชื่อ-สกุล</label>
            <input v-model="form.full_name" type="text" placeholder="Full name" required />
          </div>

          <div class="form-row form-row--two">
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
            <button type="submit" class="btn-primary" :disabled="loading">
              {{ loading ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
            <button type="button" class="btn-secondary" @click="resetForm">รีเซ็ต</button>
          </div>

          <div class="message">
            <p v-if="error" class="error">{{ error }}</p>
            <p v-if="success" class="success">{{ success }}</p>
          </div>
        </form>
      </section>

      <aside class="info-panel">
        <div class="info-card">
          <p class="info-card__eyebrow">คู่มือเร็ว</p>
          <h3>แนะนำก่อนบันทึก</h3>
          <ul>
            <li>ใช้ username ที่ไม่ซ้ำ</li>
            <li>ตั้ง role ให้ตรงกับสิทธิ์</li>
            <li>ถ้าต้องการให้ติดต่อได้ ใส่เบอร์หรือ LINE ID เพิ่ม</li>
          </ul>
        </div>

        <div class="info-card info-card--accent">
          <p class="info-card__eyebrow">สถานะ</p>
          <div class="status-row">
            <span>ฟอร์มพร้อมใช้งาน</span>
            <strong>{{ loading ? 'กำลังบันทึก' : 'พร้อมบันทึก' }}</strong>
          </div>
        </div>

        <div class="info-card">
          <p class="info-card__eyebrow">Role Preview</p>
          <div class="role-preview">
            <span :class="['role-chip', { 'role-chip--active': form.role === 'user' }]">User</span>
            <span :class="['role-chip', { 'role-chip--active': form.role === 'admin' }]"
              >Admin</span
            >
          </div>
        </div>
      </aside>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'AdminAddUserView' })

const router = useRouter()
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
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function goBack() {
  router.push('/admin/users')
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
    const userRaw =
      localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
    const user = userRaw ? JSON.parse(userRaw) : null

    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': String(user?.role || '').toLowerCase(),
        'x-user-id': String(user?.id || ''),
      },
      body: JSON.stringify(form.value),
    })

    const contentType = String(response.headers.get('content-type') || '')
    const isJson = contentType.includes('application/json')
    const data = isJson ? await response.json() : null
    const rawText = isJson ? '' : await response.text()

    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || rawText || 'ไม่สามารถเพิ่มผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง',
      )
    }

    success.value = data.message || 'เพิ่มผู้ใช้สำเร็จ'
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.adduser-page {
  position: relative;
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(191, 147, 235, 0.28), transparent 30%),
    radial-gradient(circle at top right, rgba(255, 192, 203, 0.22), transparent 24%),
    linear-gradient(180deg, #faf7ff 0%, #f4efff 100%);
  padding: 28px clamp(16px, 2vw, 28px);
}

.page-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(8px);
  pointer-events: none;
}

.page-orb--one {
  width: 220px;
  height: 220px;
  right: -70px;
  top: 40px;
  background: rgba(205, 162, 251, 0.28);
}

.page-orb--two {
  width: 180px;
  height: 180px;
  left: -60px;
  bottom: 70px;
  background: rgba(255, 203, 217, 0.26);
}

.hero-panel {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  max-width: 1240px;
  margin: 0 auto 18px;
  padding: 20px 22px;
  border: 1px solid rgba(222, 205, 241, 0.85);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(250, 245, 255, 0.96));
  box-shadow: 0 16px 36px rgba(111, 80, 160, 0.08);
}

.subtitle {
  margin: 0 0 8px;
  color: #9a7dbf;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.74rem;
}

.hero-panel h1 {
  margin: 0;
  font-size: clamp(1.7rem, 3vw, 2.35rem);
  color: #2f2348;
  line-height: 1.08;
}

.hero-copy {
  margin-top: 10px;
  max-width: 620px;
  color: #6f628d;
  font-size: 0.95rem;
  line-height: 1.6;
}

.hero-badge {
  padding: 0.7rem 1rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  font-weight: 900;
  font-size: 0.82rem;
  box-shadow: 0 10px 20px rgba(132, 86, 179, 0.24);
  white-space: nowrap;
}

.content-grid {
  position: relative;
  z-index: 1;
  max-width: 1240px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.form-panel,
.info-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 212, 243, 0.95);
  border-radius: 24px;
  box-shadow: 0 18px 42px rgba(95, 68, 138, 0.08);
}

.form-panel {
  padding: 28px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 22px;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.45rem;
  color: #2f2348;
}

.panel-header p {
  margin-top: 4px;
  color: #7d6f96;
  font-size: 0.9rem;
}

.button-back,
.btn-secondary,
.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 0.8rem 1.1rem;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.button-back:hover,
.btn-secondary:hover,
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.button-back,
.btn-secondary {
  background: #f4efff;
  color: #6f50a0;
  box-shadow: inset 0 0 0 1px rgba(183, 136, 234, 0.16);
}

.btn-primary {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  box-shadow: 0 10px 18px rgba(132, 86, 179, 0.24);
}

.btn-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.adduser-form {
  display: grid;
  gap: 16px;
}

.form-row {
  display: grid;
  gap: 16px;
}

.form-row--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group label {
  color: #5d4b8c;
  font-weight: 800;
  font-size: 0.9rem;
}

.field-group input,
.field-group select,
.field-group textarea {
  width: 100%;
  padding: 0.9rem 1rem;
  border: 1px solid #e5d8f6;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff, #faf7ff);
  font-size: 0.96rem;
  color: #3b2f57;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.field-group input::placeholder,
.field-group textarea::placeholder {
  color: #a79abd;
}

.field-group input:focus,
.field-group select:focus,
.field-group textarea:focus {
  border-color: #b788ea;
  box-shadow: 0 0 0 4px rgba(183, 136, 234, 0.12);
}

.field-group textarea {
  resize: vertical;
  min-height: 120px;
}

.form-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.message {
  margin-top: 6px;
  min-height: 24px;
}

.error,
.success {
  font-weight: 700;
  font-size: 0.9rem;
}

.error {
  color: #d52f2f;
}

.success {
  color: #0f7d3f;
}

.info-panel {
  display: grid;
  gap: 14px;
}

.info-card {
  padding: 20px;
}

.info-card__eyebrow {
  margin-bottom: 8px;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a7dbf;
}

.info-card h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: #2f2348;
}

.info-card ul {
  margin: 0;
  padding-left: 18px;
  color: #6f628d;
  line-height: 1.7;
}

.info-card--accent {
  background: linear-gradient(135deg, rgba(205, 162, 251, 0.12), rgba(255, 255, 255, 0.96));
}

.status-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  color: #4d3d71;
}

.status-row strong {
  color: #6f50a0;
}

.role-preview {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.role-chip {
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  border: 1px solid #dcc8f5;
  background: #fff;
  color: #6f628d;
  font-weight: 800;
  font-size: 0.82rem;
}

.role-chip--active {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  border-color: #b788ea;
}

@media (max-width: 980px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .hero-panel {
    align-items: start;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .adduser-page {
    padding: 16px;
  }

  .form-panel,
  .info-card,
  .hero-panel {
    border-radius: 20px;
  }

  .form-panel {
    padding: 20px;
  }

  .panel-header,
  .status-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-row--two {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
  }

  .button-back,
  .btn-secondary,
  .btn-primary {
    width: 100%;
    justify-content: center;
  }
}
</style>
