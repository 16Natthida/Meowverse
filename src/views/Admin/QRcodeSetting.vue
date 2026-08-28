<template>
  <main class="qr-page">
    <div class="page-header">
      <div>
        <h1>ตั้งค่า QR Codes</h1>
        <p>อัปโหลด QR สำหรับการชำระเงิน และจัดการรายการ QR ทั้งหมด</p>
      </div>
    </div>

    <section class="upload-section">
      <form @submit.prevent="uploadQr">
        <div class="form-row">
          <label>วิธีชำระเงิน</label>
          <input v-model="paymentMethod" type="text" placeholder="ตัวอย่าง: PromptPay / Rabbit LINE Pay" />
        </div>
        <div class="form-row">
          <label>เลือกไฟล์ QR (PNG/JPG)</label>
          <input ref="fileInput" type="file" @change="onFileChange" accept="image/*" />
        </div>
        <div class="form-row actions">
          <button class="btn" :disabled="uploading">อัปโหลด</button>
        </div>
      </form>
      <div v-if="uploadError" class="error">{{ uploadError }}</div>
      <div v-if="uploading" class="muted">กำลังอัปโหลด...</div>
    </section>

    <section class="list-section">
      <h2>รายการ QR ที่ใช้งาน</h2>
      <div v-if="loading" class="muted">กำลังโหลด...</div>
      <div v-else-if="qrcodes.length === 0" class="muted">ไม่มี QR ในระบบ</div>
      <ul class="qr-list">
        <li v-for="qr in qrcodes" :key="qr.qr_id" class="qr-item">
          <img v-if="qr.qr_image" :src="qr.qr_image" alt="qr" class="qr-thumb" />
          <div class="qr-info">
            <div class="method">{{ qr.payment_method || 'ไม่ระบุ' }}</div>
            <div class="meta">โดย: {{ qr.full_name || qr.username || qr.user_id || '-' }}</div>
            <div class="meta">อัปเดต: {{ formatDate(qr.updated_at) }}</div>
          </div>
          <div class="qr-actions">
            <button class="btn-small" @click="toggleActive(qr)">{{ qr.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}</button>
            <button class="btn-small danger" @click="deleteQr(qr)">ลบ</button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { getUser } = useAuth()
const currentUser = getUser()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const paymentMethod = ref('')
const file = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const qrcodes = ref([])
const loading = ref(false)

function onFileChange(e) {
  const f = e.target.files && e.target.files[0]
  file.value = f || null
}

function authHeaders() {
  return {
    'x-user-role': String(currentUser?.role || '').toLowerCase() || 'user',
    'x-user-id': String(currentUser?.user_id || currentUser?.id || ''),
  }
}

async function fetchQRCodes() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes`, { headers: authHeaders() })
    if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้')
    qrcodes.value = await res.json()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function uploadQr() {
  if (!file.value) {
    uploadError.value = 'กรุณาเลือกไฟล์ QR'
    return
  }

  uploading.value = true
  uploadError.value = ''

  try {
    const form = new FormData()
    form.append('image', file.value)
    form.append('payment_method', paymentMethod.value || '')

    const res = await fetch(`${API_BASE_URL}/admin/qrcodes`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'อัปโหลดไม่สำเร็จ')
    }

    paymentMethod.value = ''
    file.value = null
    // reset input
    const input = document.querySelector('input[type=file]')
    if (input) input.value = ''

    await fetchQRCodes()
  } catch (err) {
    uploadError.value = err.message || String(err)
    console.error(err)
  } finally {
    uploading.value = false
  }
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

async function toggleActive(qr) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes/${qr.qr_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ is_active: !qr.is_active }),
    })
    if (!res.ok) throw new Error('อัปเดตไม่สำเร็จ')
    const updated = await res.json()
    const idx = qrcodes.value.findIndex((x) => x.qr_id === updated.qr_id)
    if (idx > -1) qrcodes.value[idx] = { ...qrcodes.value[idx], ...updated }
  } catch (err) {
    console.error(err)
  }
}

async function deleteQr(qr) {
  if (!confirm('ต้องการลบ QR นี้หรือไม่?')) return
  try {
    const res = await fetch(`${API_BASE_URL}/admin/qrcodes/${qr.qr_id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('ลบไม่สำเร็จ')
    qrcodes.value = qrcodes.value.filter((x) => x.qr_id !== qr.qr_id)
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  fetchQRCodes()
})
</script>

<style scoped>
.qr-page { padding: 1.5rem; font-family: Kanit, sans-serif; }
.page-header { background: white; padding: 1rem; border-radius: 12px; margin-bottom: 1rem; border: 1px solid #eadff5 }
.upload-section { background: white; padding: 1rem; border-radius: 12px; border: 1px solid #eadff5; margin-bottom: 1rem }
.form-row { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem }
.form-row.actions { flex-direction: row; justify-content: flex-end }
.btn { padding: 0.6rem 1rem; background: linear-gradient(180deg,#cda2fb,#bc8aed); color: white; border: none; border-radius: 8px }
.muted { color: #6f628d }
.error { color: #9f1239; font-weight: 600 }
.list-section { background: white; padding: 1rem; border-radius: 12px; border: 1px solid #eadff5 }
.qr-list { list-style: none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.75rem }
.qr-item { display:flex; gap:1rem; align-items:center; padding:0.75rem; border-radius:8px; border:1px solid #f0e8f8 }
.qr-thumb { width:84px; height:84px; object-fit:contain; background:#fff }
.qr-info { flex:1 }
.qr-actions { display:flex; gap:0.5rem }
.btn-small { padding:0.4rem 0.75rem; border-radius:8px; background:#f3e5f5; border:1px solid #b788ea; color:#6f50a0 }
.btn-small.danger { background:#fff4f6; border:1px solid #f5b5c1; color:#c2415c }

/* ── Responsive (page had no @media at all) ── */
@media (max-width: 640px) {
  .qr-page { padding: 1rem; }
  .qr-item {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .qr-thumb {
    width: 64px;
    height: 64px;
  }
  .qr-info {
    flex: 1 1 100%;
    min-width: 0;
    order: 2;
  }
  .qr-actions {
    flex-wrap: wrap;
    width: 100%;
    order: 3;
  }
  .btn-small {
    flex: 1;
    text-align: center;
  }
  .form-row.actions {
    flex-direction: column;
  }
  .form-row.actions .btn {
    width: 100%;
  }
}
</style>
