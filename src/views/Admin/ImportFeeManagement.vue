<template>
  <div class="import-fee-page">

    <!-- Header -->
    <div class="page-header">
      <div class="page-header__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div>
        <h2 class="page-header__title">กรอกค่านำเข้าสินค้าพรีออเดอร์</h2>
        <p class="page-header__sub">บันทึกค่านำเข้าเพื่อคำนวณยอดชำระรอบที่ 2 ของลูกค้า</p>
      </div>
    </div>

    <!-- Round selector -->
    <div class="card selector-card">
      <label class="field-label">เลือกรอบพรีออเดอร์</label>
      <div class="select-row">
        <div class="select-wrap">
          <select v-model="selectedRoundId" class="round-select" :disabled="loading">
            <option value="" disabled>— เลือกรอบพรีออเดอร์ —</option>
            <option v-for="r in rounds" :key="r.round_id" :value="r.round_id">
              {{ r.round_name }}
            </option>
          </select>
          <svg class="select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <span v-if="selectedRound" class="round-badge" :class="statusBadgeClass(selectedRound.round_status)">
          {{ statusLabel(selectedRound.round_status) }}
        </span>
        <span v-if="loading" class="spinner" aria-label="กำลังโหลด"></span>
      </div>
    </div>

    <!-- Product table -->
    <div v-if="selectedRound" class="card table-card">
      <div class="table-header">
        <span class="table-title">รายการสินค้าในรอบ <b>{{ selectedRound.round_name }}</b></span>
        <span class="table-count">{{ selectedRound.products.length }} รายการ</span>
      </div>

      <div class="table-wrap">
        <table class="fee-table">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>รสชาติ / ขนาด</th>
              <th class="num">ขายได้</th>
              <th class="num">ราคา/ชิ้น</th>
              <th class="num">ค่านำเข้า (฿)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in selectedRound.products"
              :key="getFeeKey(item.prod_id, item.flavor)"
              :class="{ 'row--filled': feeInputs[getFeeKey(item.prod_id, item.flavor)] > 0 }"
            >
              <td class="cell-product">{{ item.product_name }}</td>
              <td class="cell-flavor">
                <span v-if="item.flavor" class="flavor-tag">{{ item.flavor }}</span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="num">
                <span class="qty-badge">{{ item.total_sold_qty }} ชิ้น</span>
              </td>
              <td class="num cell-price">{{ formatMoney(item.unit_price) }}</td>
              <td class="num">
                <div class="fee-input-wrap">
                  <span class="fee-prefix">฿</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    class="fee-input"
                    v-model.number="feeInputs[getFeeKey(item.prod_id, item.flavor)]"
                    @input="onFeeInput(item.prod_id, item.flavor)"
                    :disabled="saving"
                    placeholder="0"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Warning note -->
      <div class="note-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        ค่านำเข้าที่กรอกจะถูกนำไปคิดยอดที่ลูกค้าต้องชำระในรอบที่ 2
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn-save" @click="saveImportFees" :disabled="saving || loading">
          <span v-if="saving" class="spinner spinner--sm" aria-hidden="true"></span>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          {{ saving ? 'กำลังบันทึก...' : 'บันทึกค่านำเข้า' }}
        </button>

        <transition name="fade">
          <div v-if="successMessage" class="toast toast--success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {{ successMessage }}
          </div>
        </transition>

        <transition name="fade">
          <div v-if="errorMessage" class="toast toast--error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            {{ errorMessage }}
          </div>
        </transition>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading" class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      </svg>
      <p>เลือกรอบพรีออเดอร์เพื่อเริ่มกรอกค่านำเข้า</p>
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
  if (s === 'active') return 'badge--active'
  if (s === 'closed') return 'badge--closed'
  return 'badge--default'
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
/* ── Page layout ── */
.import-fee-page {
  padding: 1.5rem 1.75rem;
  width: 100%;
  box-sizing: border-box;
}

/* ── Page header ── */
.page-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 1.75rem;
}
.page-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f0edfd;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7c3aed;
  flex-shrink: 0;
}
.page-header__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 2px 0;
  line-height: 1.3;
}
.page-header__sub {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

/* ── Cards ── */
.card {
  background: #fff;
  border: 1px solid #ede9f8;
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
}

/* ── Selector card ── */
.selector-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.select-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.select-wrap {
  position: relative;
  flex: 1;
  max-width: 400px;
}
.round-select {
  width: 100%;
  appearance: none;
  background: #faf9ff;
  border: 1.5px solid #ddd6fe;
  border-radius: 10px;
  padding: 0.6rem 2.25rem 0.6rem 0.875rem;
  font-size: 0.9375rem;
  color: #1a1a2e;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.round-select:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}
.round-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.select-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: #9ca3af;
}

/* Status badges */
.round-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 600;
}
.badge--active {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.badge--closed {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.badge--default {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

/* ── Table card ── */
.table-card {
  padding: 0;
  overflow: hidden;
  width: 100%;
}
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f3f0fb;
}
.table-title {
  font-size: 0.9375rem;
  color: #374151;
}
.table-title b {
  color: #1a1a2e;
}
.table-count {
  font-size: 0.8125rem;
  color: #9ca3af;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 2px 10px;
}
.table-wrap {
  overflow-x: auto;
}
.fee-table {
  width: 100%;
  border-collapse: collapse;
}
.fee-table thead tr {
  background: #faf9ff;
}
.fee-table th {
  padding: 0.7rem 1.25rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  border-bottom: 1px solid #ede9f8;
  white-space: nowrap;
}
.fee-table th.num,
.fee-table td.num {
  text-align: right;
}
.fee-table tbody tr {
  border-bottom: 1px solid #f5f3ff;
  transition: background 0.1s;
}
.fee-table tbody tr:last-child {
  border-bottom: none;
}
.fee-table tbody tr:hover {
  background: #faf9ff;
}
.fee-table tbody tr.row--filled {
  background: #fdf8ff;
}
.fee-table td {
  padding: 0.75rem 1.25rem;
  font-size: 0.9375rem;
  color: #374151;
  vertical-align: middle;
}
.cell-product {
  font-weight: 500;
  color: #1a1a2e;
}
.cell-muted {
  color: #d1d5db;
}
.flavor-tag {
  display: inline-block;
  background: #f0edfd;
  color: #5b21b6;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 0.8125rem;
}
.qty-badge {
  display: inline-block;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 0.8125rem;
  color: #6b7280;
}
.cell-price {
  font-variant-numeric: tabular-nums;
  color: #374151;
}

/* Fee input */
.fee-input-wrap {
  display: inline-flex;
  align-items: center;
  background: #fff;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fee-input-wrap:focus-within {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}
.fee-prefix {
  padding: 0 6px 0 10px;
  font-size: 0.875rem;
  color: #9ca3af;
  user-select: none;
}
.fee-input {
  width: 80px;
  border: none;
  outline: none;
  padding: 0.45rem 0.5rem 0.45rem 0;
  font-size: 0.9375rem;
  text-align: right;
  color: #1a1a2e;
  background: transparent;
  font-variant-numeric: tabular-nums;
}
.fee-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.fee-input::placeholder {
  color: #d1d5db;
}

/* Warning note */
.note-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0.8rem 1.5rem;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  font-size: 0.875rem;
  color: #92400e;
}

/* Actions */
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 1rem 1.5rem;
  border-top: 1px solid #f3f0fb;
  flex-wrap: wrap;
}
.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0.55rem 1.25rem;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 9px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
}
.btn-save:hover:not(:disabled) {
  background: #6d28d9;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
  transform: translateY(-1px);
}
.btn-save:active:not(:disabled) {
  transform: translateY(0);
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

/* Toast messages */
.toast {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}
.toast--success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.toast--error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem 1rem;
  color: #9ca3af;
  text-align: center;
}
.empty-state svg {
  opacity: 0.4;
}
.empty-state p {
  font-size: 0.9375rem;
  margin: 0;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(124, 58, 237, 0.2);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner--sm {
  width: 15px;
  height: 15px;
  border-color: rgba(255,255,255,0.3);
  border-top-color: #fff;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>