<script setup>
import { onMounted, ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const providers = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const editingId = ref(null)
const form = ref({
  provider_code: '',
  provider_name: '',
  tracking_url_template: '',
  is_active: true,
})

function adminHeaders(extra = {}) {
  try {
    const user = JSON.parse(localStorage.getItem('meowverse-user') || '{}')
    return {
      ...extra,
      'x-user-role': 'admin',
      'x-user-id': String(user.id || user.user_id || ''),
    }
  } catch {
    return { ...extra, 'x-user-role': 'admin', 'x-user-id': '' }
  }
}

async function loadProviders() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`${API_BASE_URL}/admin/shipping-providers`, {
      headers: adminHeaders(),
    })
    if (!response.ok) throw new Error('โหลดรายชื่อบริษัทขนส่งไม่สำเร็จ')
    providers.value = await response.json()
  } catch (err) {
    error.value = err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = null
  form.value = {
    provider_code: '',
    provider_name: '',
    tracking_url_template: '',
    is_active: true,
  }
  error.value = ''
  success.value = ''
}

function editProvider(provider) {
  editingId.value = provider.provider_id
  form.value = {
    provider_code: provider.provider_code || '',
    provider_name: provider.provider_name || '',
    tracking_url_template: provider.tracking_url_template || '',
    is_active: Number(provider.is_active) === 1,
  }
  error.value = ''
  success.value = ''
}

async function saveProvider() {
  if (!form.value.provider_code.trim() || !form.value.provider_name.trim()) {
    error.value = 'กรุณากรอกรหัสและชื่อบริษัทขนส่ง'
    return
  }

  saving.value = true
  error.value = ''
  success.value = ''
  const isEditing = Boolean(editingId.value)

  try {
    const endpoint = isEditing
      ? `${API_BASE_URL}/admin/shipping-providers/${editingId.value}`
      : `${API_BASE_URL}/admin/shipping-providers`
    const response = await fetch(endpoint, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        provider_code: form.value.provider_code,
        provider_name: form.value.provider_name,
        tracking_url_template: form.value.tracking_url_template,
        is_active: form.value.is_active,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'บันทึกบริษัทขนส่งไม่สำเร็จ')

    await loadProviders()
    resetForm()
    success.value = isEditing ? 'แก้ไขบริษัทขนส่งสำเร็จ' : 'เพิ่มบริษัทขนส่งสำเร็จ'
  } catch (err) {
    error.value = err.message || 'เกิดข้อผิดพลาดในการบันทึก'
  } finally {
    saving.value = false
  }
}

onMounted(loadProviders)
</script>

<template>
  <div class="shipping-providers-page">
    <header class="page-header">
      <h1>บริษัทขนส่ง</h1>
      <p>เพิ่มและจัดการบริษัทขนส่งที่ใช้ในระบบจัดส่ง</p>
    </header>

    <section class="panel provider-panel">
      <header class="panel-head">
        <div>
          <h2>{{ editingId ? 'แก้ไขบริษัทขนส่ง' : 'เพิ่มบริษัทขนส่งใหม่' }}</h2>
          <p>บริษัทที่เปิดใช้งานจะแสดงในช่องเลือกของลูกค้าและแอดมิน</p>
        </div>
      </header>

      <form class="provider-form" @submit.prevent="saveProvider">
        <div class="provider-form-grid">
          <label class="field">
            รหัสบริษัท
            <input v-model="form.provider_code" placeholder="เช่น kerry" maxlength="50" :disabled="saving" />
          </label>
          <label class="field">
            ชื่อบริษัทขนส่ง
            <input v-model="form.provider_name" placeholder="เช่น Kerry Express" maxlength="255" :disabled="saving" />
          </label>
          <label class="field provider-form-grid__wide">
            ลิงก์ติดตามพัสดุ (ถ้ามี)
            <input
              v-model="form.tracking_url_template"
              placeholder="เช่น https://example.com/track/{tracking_number}"
              maxlength="500"
              type="url"
              :disabled="saving"
            />
          </label>
        </div>

        <label class="provider-active-toggle">
          <input v-model="form.is_active" type="checkbox" :disabled="saving" />
          <span>เปิดให้เลือกใช้งาน</span>
        </label>

        <div class="form-actions">
          <button class="btn btn--primary" type="submit" :disabled="saving">
            {{ saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มบริษัทขนส่ง' }}
          </button>
          <button v-if="editingId" class="btn btn--ghost" type="button" :disabled="saving" @click="resetForm">
            ยกเลิกการแก้ไข
          </button>
        </div>
      </form>

      <p v-if="error" class="notice notice--error">{{ error }}</p>
      <p v-if="success" class="notice notice--success">{{ success }}</p>
    </section>

    <section class="panel provider-panel">
      <header class="panel-head">
        <div>
          <h2>รายชื่อบริษัทขนส่ง</h2>
          <p>จัดการสถานะการใช้งานของแต่ละบริษัท</p>
        </div>
        <button class="btn btn--ghost" type="button" :disabled="loading" @click="loadProviders">รีเฟรช</button>
      </header>

      <div v-if="loading" class="empty-state">กำลังโหลดข้อมูล...</div>
      <div v-else-if="providers.length" class="provider-list">
        <div v-for="provider in providers" :key="provider.provider_id" class="provider-row">
          <div class="provider-row__main">
            <strong>{{ provider.provider_name }}</strong>
            <span>{{ provider.provider_code }}</span>
            <small v-if="provider.tracking_url_template">มีลิงก์ติดตามพัสดุ</small>
          </div>
          <div class="provider-row__actions">
            <span class="provider-status" :class="{ 'provider-status--inactive': Number(provider.is_active) !== 1 }">
              {{ Number(provider.is_active) === 1 ? 'เปิดใช้งาน' : 'ปิดใช้งาน' }}
            </span>
            <button class="btn btn--ghost" type="button" @click="editProvider(provider)">แก้ไข</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">ยังไม่มีบริษัทขนส่ง</div>
    </section>
  </div>
</template>

<style scoped>
.shipping-providers-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header h1,
.panel-head h2 {
  margin: 0;
  color: #432f61;
}

.page-header p,
.panel-head p {
  margin: 0.35rem 0 0;
  color: #6d5a82;
}

.page-header h1 { font-size: 1.75rem; }
.panel-head h2 { font-size: 1.25rem; }

.panel {
  border: 1px solid #e4d4f2;
  border-radius: 16px;
  background: #fff;
  padding: 1.25rem;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.provider-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e4d4f2;
  border-radius: 12px;
  background: #fcf9ff;
}

.provider-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.provider-form-grid__wide { grid-column: 1 / -1; }

.field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  color: #432f61;
  font-size: 0.9rem;
}

.field input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 1px solid #d0bfe0;
  border-radius: 8px;
  background: #fff;
  color: #432f61;
  font: inherit;
}

.field input:focus {
  outline: none;
  border-color: #9876c0;
  box-shadow: 0 0 0 3px rgba(152, 118, 192, 0.1);
}

.provider-active-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #432f61;
  font-size: 0.9rem;
}

.provider-active-toggle input { accent-color: #9876c0; }

.form-actions,
.provider-row__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn {
  border: 1px solid #d0bfe0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  color: #432f61;
  background: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled { cursor: not-allowed; opacity: 0.6; }
.btn--primary { border-color: transparent; color: #fff; background: linear-gradient(135deg, #c9a6ff, #9876c0); }
.btn--ghost:hover { background: #f4eefb; border-color: #9876c0; }

.notice,
.empty-state {
  margin: 1rem 0 0;
  padding: 0.75rem;
  border-radius: 8px;
  color: #6d5a82;
  background: #f9f3fc;
}

.notice--error { color: #c00; background: #ffe8e8; }
.notice--success { color: #2e7d32; background: #e8f5e9; }

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #eadcf5;
  border-radius: 12px;
}

.provider-row__main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  color: #432f61;
}

.provider-row__main span,
.provider-row__main small { color: #8a78a0; font-size: 0.82rem; }

.provider-status {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: #e8f7ed;
  color: #2e7d4f;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.provider-status--inactive { background: #f1edf5; color: #8a78a0; }

@media (max-width: 768px) {
  .provider-form-grid { grid-template-columns: 1fr; }
  .provider-form-grid__wide { grid-column: auto; }
  .panel-head,
  .provider-row { align-items: stretch; flex-direction: column; }
  .provider-row__actions { justify-content: space-between; }
  .btn { width: 100%; }
  .form-actions { flex-direction: column; }
}
</style>
