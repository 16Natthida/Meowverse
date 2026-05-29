<template>
  <div class="intake-management">
    <h2 class="page-title">
      💰 กรอกค่านำเข้าสินค้าพรีออเดอร์
    </h2>
    <div class="section">
      <label class="label">เลือกรอบที่ต้องการกรอกค่านำเข้า</label>
      <div class="dropdown-row">
        <select v-model="selectedRoundId" class="dropdown" :disabled="loading">
          <option value="" disabled>เลือกรอบพรีออเดอร์</option>
          <option v-for="r in rounds" :key="r.round_id" :value="r.round_id">
            {{ r.round_name }}
            <span class="badge" :class="statusBadgeClass(r.round_status)">
              {{ statusLabel(r.round_status) }}
            </span>
          </option>
        </select>
        <span v-if="loading" class="spinner"></span>
      </div>
    </div>

    <div v-if="selectedRound" class="section">
      <div class="round-info">
        <span>ชื่อรอบ: <b>{{ selectedRound.round_name }}</b></span>
        <span> | สถานะ: <span class="badge" :class="statusBadgeClass(selectedRound.round_status)">{{ statusLabel(selectedRound.round_status) }}</span></span>
      </div>
      <div class="table-wrapper">
        <table class="intake-table">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>รสชาติ</th>
              <th>ขายได้</th>
              <th>ราคา/ชิ้น</th>
              <th>ค่านำเข้า</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in selectedRound.products" :key="getFeeKey(item.prod_id, item.flavor)">
              <td>{{ item.product_name }}</td>
              <td>{{ item.flavor || '-' }}</td>
              <td>{{ item.total_sold_qty }} ชิ้น</td>
              <td>{{ formatMoney(item.unit_price) }}</td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  class="input input--fee"
                  v-model.number="feeInputs[getFeeKey(item.prod_id, item.flavor)]"
                  @input="onFeeInput(item.prod_id, item.flavor)"
                  :disabled="saving"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="note warning">
        ⚠️ หมายเหตุ: ค่านำเข้าที่กรอกจะถูกนำไปคิดยอดที่ลูกค้าต้องจ่ายในรอบที่ 2
      </div>
      <div class="actions">
        <button class="btn btn--primary" @click="saveImportFees" :disabled="saving || loading">
          <span v-if="saving" class="spinner spinner--inline"></span>
          บันทึกค่านำเข้า
        </button>
        <span v-if="successMessage" class="success-message">✅ {{ successMessage }}</span>
        <span v-if="errorMessage" class="error-message">❌ {{ errorMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const { getUser } = useAuth()
const currentUser = computed(() => getUser())

const rounds = ref([])
const selectedRoundId = ref('')
const feeInputs = ref({})
const loading = ref(false)
const saving = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const selectedRound = computed(() =>
  rounds.value.find(r => r.round_id === selectedRoundId.value) || null
)

function authHeaders() {
  const user = currentUser.value || {}
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'active') return 'badge badge--ready'
  if (s === 'closed') return 'badge badge--partial'
  return 'badge badge--pending'
}
function statusLabel(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'active') return 'เปิดอยู่'
  if (s === 'closed') return 'ปิดแล้ว'
  return status
}
function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}
function getFeeKey(prod_id, flavor) {
  return `${prod_id}|${flavor || ''}`
}
function onFeeInput(prod_id, flavor) {
  // Autofill all rows with same prod_id if user edits one
  const key = getFeeKey(prod_id, flavor)
  const value = feeInputs.value[key]
  for (const item of selectedRound.value?.products || []) {
    if (item.prod_id === prod_id) {
      const k = getFeeKey(item.prod_id, item.flavor)
      if (k !== key && (feeInputs.value[k] === undefined || feeInputs.value[k] === '')) {
        feeInputs.value[k] = value
      }
    }
  }
}
async function fetchRounds() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/admin/preorder-import-fee/rounds`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`โหลดรอบพรีออเดอร์ไม่สำเร็จ (${res.status})`)
    const data = await res.json()
    rounds.value = data
    // Auto-select first round if not selected
    if (!selectedRoundId.value && data.length > 0) {
      selectedRoundId.value = data[0].round_id
    }
  } catch (e) {
    errorMessage.value = translateError(e)
  } finally {
    loading.value = false
  }
}
watch(selectedRoundId, () => {
  feeInputs.value = {}
  if (selectedRound.value) {
    for (const item of selectedRound.value.products) {
      feeInputs.value[getFeeKey(item.prod_id, item.flavor)] =
        item.current_import_fee != null ? Number(item.current_import_fee) : ''
    }
  }
  successMessage.value = ''
  errorMessage.value = ''
})
onMounted(fetchRounds)

async function saveImportFees() {
  if (!selectedRound.value) return
  errorMessage.value = ''
  successMessage.value = ''
  // Validate all rows
  const fees = []
  for (const item of selectedRound.value.products) {
    const key = getFeeKey(item.prod_id, item.flavor)
    const val = feeInputs.value[key]
    if (val === '' || val == null || isNaN(val) || Number(val) < 0) {
      errorMessage.value = 'กรุณากรอกค่านำเข้าทุกแถว (ต้องไม่ติดลบ)'
      return
    }
    fees.push({ prod_id: item.prod_id, flavor: item.flavor, import_fee: Number(val) })
  }
  saving.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/preorder-import-fee/${selectedRound.value.round_id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ fees }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.message || `บันทึกค่านำเข้าไม่สำเร็จ (${res.status})`)
    }
    successMessage.value = data.message || 'บันทึกค่านำเข้าเรียบร้อย'
    await fetchRounds()
  } catch (e) {
    errorMessage.value = translateError(e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page-title {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.section {
  margin-bottom: 1.5rem;
}
.dropdown-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.dropdown {
  min-width: 220px;
  padding: 0.5rem;
  font-size: 1rem;
}
.table-wrapper {
  overflow-x: auto;
  margin-top: 1rem;
}
.intake-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}
.intake-table th,
.intake-table td {
  padding: 0.5rem 0.75rem;
  border: 1px solid #e0e0e0;
  text-align: left;
}
.input--fee {
  width: 80px;
  text-align: right;
}
.note.warning {
  color: #b67300;
  background: #fffbe6;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  margin: 1rem 0 0.5rem 0;
  font-size: 0.95rem;
}
.actions {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
.success-message {
  color: #2e7d32;
}
.error-message {
  color: #c62828;
}
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid #b673ee;
  border-top: 2px solid #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner--inline {
  width: 1em;
  height: 1em;
  border-width: 2px;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
