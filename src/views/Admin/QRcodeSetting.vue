<template>
  <main class="payment-page">
    <AdminPageHeader
      title="ตั้งค่าการชำระเงิน"
      description="จัดการ QR Code และบัญชีธนาคารสำหรับรับชำระเงิน"
    />

    <section class="form-card">
      <div class="section-heading">
        <div>
          <h2>{{ editingId ? 'แก้ไขช่องทางการชำระเงิน' : 'เพิ่มช่องทางการชำระเงิน' }}</h2>
          <p>เลือกประเภทข้อมูลที่ต้องการให้ลูกค้าเห็นในหน้าชำระเงิน</p>
        </div>
        <button v-if="editingId" type="button" class="btn-secondary" @click="resetForm">ยกเลิกแก้ไข</button>
      </div>

      <form @submit.prevent="submitForm">
        <div class="form-row">
          <label for="payment-type">ประเภทการชำระเงิน</label>
          <select id="payment-type" v-model="form.type" :disabled="submitting">
            <option value="qr">QR Code / PromptPay</option>
            <option value="bank">บัญชีธนาคาร</option>
          </select>
        </div>

        <template v-if="form.type === 'qr'">
          <div class="form-row">
            <label for="payment-name">ชื่อวิธีการชำระเงิน</label>
            <input id="payment-name" v-model.trim="form.payment_method" type="text" placeholder="ตัวอย่าง: PromptPay" required />
          </div>
        </template>

        <template v-else>
          <div class="form-row">
            <label for="bank-name">ธนาคาร</label>
            <input id="bank-name" v-model.trim="form.bank_name" type="text" placeholder="ตัวอย่าง: ธนาคารกสิกรไทย" required />
          </div>
          <div class="form-row">
            <label for="account-name">ชื่อบัญชี</label>
            <input id="account-name" v-model.trim="form.account_name" type="text" placeholder="ตัวอย่าง: นางสาว XXXXX XXXXX" required />
          </div>
          <div class="form-row">
            <label for="account-number">เลขที่บัญชี</label>
            <input id="account-number" v-model="form.account_number" type="text" inputmode="numeric" placeholder="ตัวอย่าง: 1234567890" required />
            <small class="hint">ระบบจะลบขีดและช่องว่างก่อนบันทึก</small>
          </div>
        </template>

        <div v-if="form.type === 'qr'" class="form-row">
          <label for="qr-file">ไฟล์ QR Code</label>
          <input id="qr-file" ref="fileInput" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" @change="onFileChange" />
          <small v-if="selectedFileName" class="hint">ไฟล์ที่เลือก: {{ selectedFileName }}</small>
          <small v-else-if="editingId && form.qr_image" class="hint">มี QR เดิมแล้ว หากไม่เลือกไฟล์ใหม่ ระบบจะใช้ไฟล์เดิม</small>
        </div>

        <div class="form-actions">
          <button class="btn-primary" type="submit" :disabled="submitting">
            {{ submitting ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : form.type === 'qr' ? 'เพิ่มช่องทางการชำระเงิน' : 'เพิ่มบัญชีธนาคาร' }}
          </button>
        </div>
      </form>

      <p v-if="formError" class="error-message">{{ formError }}</p>
      <p v-if="successMessage" class="success-message">{{ successMessage }}</p>
    </section>

    <section class="list-section">
      <div class="section-heading">
        <div>
          <h2>ช่องทางการชำระเงินที่ใช้งาน</h2>
          <p>ข้อมูลที่เปิดใช้งานจะแสดงบนหน้าชำระเงินของลูกค้า</p>
        </div>
      </div>

      <div v-if="loading" class="muted">กำลังโหลด...</div>
      <div v-else-if="channels.length === 0" class="empty-state">ยังไม่มีช่องทางการชำระเงิน</div>

      <ul v-else class="channel-list">
        <li v-for="channel in channels" :key="channel.qr_id" class="channel-item">
          <img v-if="channel.qr_image" :src="getImageUrl(channel.qr_image)" alt="QR Code" class="channel-thumb" />
          <div v-else class="channel-thumb channel-thumb--empty">ไม่มี QR</div>

          <div class="channel-info">
            <span class="channel-type">{{ channel.type === 'bank' ? 'บัญชีธนาคาร' : 'QR Code / PromptPay' }}</span>
            <h3 v-if="channel.type === 'bank'">{{ channel.bank_name }}</h3>
            <h3 v-else>{{ channel.payment_method || 'ไม่ระบุชื่อ' }}</h3>
            <p v-if="channel.type === 'bank'">ชื่อบัญชี: {{ channel.account_name }}</p>
            <p v-if="channel.type === 'bank'">เลขบัญชี: {{ formatAccountNumber(channel.account_number) }}</p>
            <p class="meta">อัปเดต: {{ formatDate(channel.updated_at) }}</p>
            <span :class="['status-badge', channel.is_active ? 'status-badge--active' : 'status-badge--inactive']">
              {{ channel.is_active ? 'กำลังใช้งาน' : 'ปิดใช้งาน' }}
            </span>
          </div>

          <div class="channel-actions">
            <button type="button" class="btn-small" @click="startEdit(channel)">แก้ไข</button>
            <button type="button" class="btn-small" @click="toggleActive(channel)">
              {{ channel.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}
            </button>
            <button type="button" class="btn-small btn-small--danger" @click="deleteChannel(channel)">ลบ</button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { useAuth } from '../../composables/useAuth'

const { getUser } = useAuth()
const currentUser = getUser()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const fileInput = ref(null)
const channels = ref([])
const loading = ref(false)
const submitting = ref(false)
const editingId = ref(null)
const selectedFile = ref(null)
const formError = ref('')
const successMessage = ref('')

const form = reactive({
  type: 'qr',
  payment_method: '',
  bank_name: '',
  account_name: '',
  account_number: '',
  qr_image: null,
})

const selectedFileName = ref('')

function authHeaders() {
  return {
    'x-user-role': String(currentUser?.role || '').toLowerCase() || 'user',
    'x-user-id': String(currentUser?.user_id || currentUser?.id || ''),
  }
}

function getImageUrl(src) {
  if (!src) return null
  if (src.startsWith('/uploads') && API_BASE_URL.startsWith('http')) {
    return `${new URL(API_BASE_URL).origin}${src}`
  }
  return src
}

function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null
  selectedFileName.value = selectedFile.value?.name || ''
  formError.value = ''
}

function resetForm() {
  editingId.value = null
  form.type = 'qr'
  form.payment_method = ''
  form.bank_name = ''
  form.account_name = ''
  form.account_number = ''
  form.qr_image = null
  selectedFile.value = null
  selectedFileName.value = ''
  formError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function startEdit(channel) {
  editingId.value = channel.qr_id
  form.type = channel.type === 'bank' ? 'bank' : 'qr'
  form.payment_method = channel.payment_method || ''
  form.bank_name = channel.bank_name || ''
  form.account_name = channel.account_name || ''
  form.account_number = channel.account_number || ''
  form.qr_image = channel.qr_image || null
  selectedFile.value = null
  selectedFileName.value = ''
  formError.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function buildFormData() {
  const data = new FormData()
  data.append('type', form.type)
  if (form.type === 'qr') {
    data.append('payment_method', form.payment_method)
  } else {
    data.append('payment_method', 'bank_transfer')
    data.append('bank_name', form.bank_name)
    data.append('account_name', form.account_name)
    data.append('account_number', form.account_number)
  }
  if (selectedFile.value) data.append('image', selectedFile.value)
  return data
}

async function submitForm() {
  formError.value = ''
  successMessage.value = ''
  if (form.type === 'qr' && !selectedFile.value && !form.qr_image) {
    formError.value = 'กรุณาเลือกไฟล์ QR Code'
    return
  }

  submitting.value = true
  try {
    const url = editingId.value
      ? `${API_BASE_URL}/admin/qrcodes/${editingId.value}`
      : `${API_BASE_URL}/admin/qrcodes`
    const res = await fetch(url, {
      method: editingId.value ? 'PATCH' : 'POST',
      headers: authHeaders(),
      body: buildFormData(),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'บันทึกข้อมูลไม่สำเร็จ')

    successMessage.value = editingId.value ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มช่องทางการชำระเงินสำเร็จ'
    resetForm()
    await fetchChannels()
  } catch (error) {
    formError.value = error.message || 'บันทึกข้อมูลไม่สำเร็จ'
  } finally {
    submitting.value = false
  }
}

async function fetchChannels() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes`, { headers: authHeaders() })
    const body = await res.json().catch(() => [])
    if (!res.ok) throw new Error(body.error || 'ไม่สามารถโหลดข้อมูลได้')
    channels.value = Array.isArray(body) ? body : []
  } catch (error) {
    formError.value = error.message || 'ไม่สามารถโหลดข้อมูลได้'
  } finally {
    loading.value = false
  }
}

async function toggleActive(channel) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes/${channel.qr_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ is_active: !channel.is_active }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'อัปเดตสถานะไม่สำเร็จ')
    await fetchChannels()
  } catch (error) {
    formError.value = error.message || 'อัปเดตสถานะไม่สำเร็จ'
  }
}

async function deleteChannel(channel) {
  if (!window.confirm('คุณต้องการลบช่องทางการชำระเงินนี้หรือไม่?')) return
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes/${channel.qr_id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'ลบข้อมูลไม่สำเร็จ')
    }
    if (editingId.value === channel.qr_id) resetForm()
    await fetchChannels()
  } catch (error) {
    formError.value = error.message || 'ลบข้อมูลไม่สำเร็จ'
  }
}

function formatAccountNumber(value) {
  const digits = String(value || '').replace(/[\s-]/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9)}`
  return digits || '-'
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

onMounted(fetchChannels)
</script>

<style scoped>
.payment-page { max-width: 1100px; margin: 0 auto; padding: 1.5rem; font-family: Kanit, sans-serif; }
.form-card, .list-section { background: #fff; border: 1px solid #eadff5; border-radius: 18px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 12px 28px rgba(111, 80, 160, 0.06); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.section-heading h2 { margin: 0; color: #35235b; font-size: 1.15rem; }
.section-heading p { margin: .3rem 0 0; color: #7d6e9a; font-size: .85rem; }
.form-row { display: grid; gap: .4rem; margin-bottom: .85rem; }
.form-row label { color: #5a487c; font-weight: 700; font-size: .88rem; }
.form-row input, .form-row select { width: 100%; box-sizing: border-box; border: 1.5px solid #dbcdef; border-radius: 12px; padding: .75rem .85rem; font: inherit; color: #342552; background: #fff; }
.form-row input:focus, .form-row select:focus { outline: none; border-color: #7c63d8; box-shadow: 0 0 0 4px rgba(124, 99, 216, .12); }
.hint { color: #7d6e9a; font-size: .78rem; }
.checkbox-row { display: flex; align-items: center; gap: .5rem; margin: .3rem 0 1rem; color: #5a487c; font-size: .88rem; }
.form-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
.btn-primary, .btn-secondary, .btn-small { border-radius: 10px; padding: .65rem .9rem; font: inherit; font-weight: 700; cursor: pointer; }
.btn-primary { border: 0; color: #fff; background: linear-gradient(160deg, #a17df2, #6f50a0); }
.btn-primary:disabled { opacity: .65; cursor: wait; }
.btn-secondary { border: 1px solid #c9b4eb; color: #6f50a0; background: #faf7ff; }
.error-message, .success-message { margin: .85rem 0 0; font-weight: 700; }
.error-message { color: #b4233c; }
.success-message { color: #087f5b; }
.channel-list { display: grid; gap: .75rem; padding: 0; margin: 0; list-style: none; }
.channel-item { display: flex; align-items: center; gap: 1rem; padding: .85rem; border: 1px solid #eee4f8; border-radius: 14px; min-width: 0; }
.channel-thumb { width: 88px; height: 88px; flex: 0 0 88px; object-fit: contain; border-radius: 12px; background: #fff; border: 1px solid #f0e8f8; }
.channel-thumb--empty { display: grid; place-items: center; color: #8a7a9f; font-size: .75rem; }
.channel-info { min-width: 0; flex: 1; }
.channel-info h3 { margin: .15rem 0; color: #35235b; font-size: 1rem; overflow-wrap: anywhere; }
.channel-info p { margin: .16rem 0; color: #5f507f; font-size: .85rem; overflow-wrap: anywhere; }
.channel-type { color: #6f50a0; font-size: .75rem; font-weight: 800; }
.channel-info .meta { color: #8a7a9f; font-size: .76rem; }
.status-badge { display: inline-flex; margin-top: .25rem; padding: .2rem .55rem; border-radius: 999px; font-size: .72rem; font-weight: 800; }
.status-badge--active { color: #087f5b; background: #e7f8f0; }
.status-badge--inactive { color: #8a5a00; background: #fff4d6; }
.channel-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .4rem; }
.btn-small { border: 1px solid #c9b4eb; color: #6f50a0; background: #f8f3ff; }
.btn-small--danger { border-color: #f3b6c3; color: #b4233c; background: #fff7f8; }
.muted, .empty-state { color: #7d6e9a; padding: 1rem 0; }
@media (max-width: 680px) {
  .payment-page { padding: 1rem; }
  .section-heading { flex-direction: column; }
  .form-actions, .form-actions .btn-primary { width: 100%; }
  .channel-item { align-items: flex-start; flex-wrap: wrap; }
  .channel-info { flex: 1 1 calc(100% - 104px); }
  .channel-actions { width: 100%; justify-content: stretch; }
  .channel-actions .btn-small { flex: 1; min-width: 0; }
}
</style>
