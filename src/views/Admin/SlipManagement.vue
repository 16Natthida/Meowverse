<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'
const { getUser } = useAuth()

const intakeOrders = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selectedOrderId = ref(null)
const saving = ref(false)
const saveMessage = ref('')
const note = ref('')
const receivedDraft = ref({})
const moveExcessToStock = ref(true)
const decrementPreorderPool = ref(true)

const currentUser = computed(() => getUser())

const selectedOrder = computed(() => {
  return (
    intakeOrders.value.find((order) => Number(order.order_id) === Number(selectedOrderId.value)) ||
    null
  )
})

const selectedSummary = computed(() => selectedOrder.value?.summary || null)

function authHeaders() {
  const user = currentUser.value || {}
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function resolveStatusClass(status) {
  const key = String(status || '').toLowerCase()
  if (key.includes('ready')) return 'badge badge--ready'
  if (key.includes('partial')) return 'badge badge--partial'
  if (key.includes('missing')) return 'badge badge--missing'
  return 'badge badge--pending'
}

function resolveStatusLabel(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'ready_to_ship') return 'พร้อมจัดส่ง'
  if (key === 'partially_received') return 'รับไม่ครบ'
  if (key === 'missing') return 'ขาดสินค้า'
  if (key === 'received') return 'รับครบ'
  if (key === 'partial') return 'รับบางส่วน'
  return status || 'Pending'
}

function setSelectedOrder(orderId) {
  selectedOrderId.value = orderId
  saveMessage.value = ''
  note.value = ''

  const order = intakeOrders.value.find((item) => Number(item.order_id) === Number(orderId))
  const draft = {}

  for (const item of order?.items || []) {
    draft[item.detail_id] = Number(item.received_qty) || 0
  }

  receivedDraft.value = draft
}

function updateDraft(detailId, rawValue) {
  const value = Number(rawValue)
  receivedDraft.value = {
    ...receivedDraft.value,
    [detailId]: Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0,
  }
}

async function fetchIntakeOrders() {
  loading.value = true
  errorMessage.value = ''

  try {
    const res = await fetch(`${API_BASE_URL}/admin/inventory-intake/orders`, {
      headers: authHeaders(),
    })

    if (!res.ok) {
      throw new Error(`โหลดรายการรับสินค้าไม่สำเร็จ (${res.status})`)
    }

    intakeOrders.value = await res.json()

    if (!selectedOrderId.value && intakeOrders.value.length > 0) {
      setSelectedOrder(intakeOrders.value[0].order_id)
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    loading.value = false
  }
}

async function processIntake() {
  if (!selectedOrder.value) return

  saving.value = true
  saveMessage.value = ''

  try {
    const payload = {
      note: note.value.trim(),
      move_excess_to_stock: moveExcessToStock.value,
      decrement_preorder_pool: decrementPreorderPool.value,
      items: (selectedOrder.value.items || []).map((item) => ({
        detail_id: item.detail_id,
        received_qty: Number(receivedDraft.value[item.detail_id] ?? 0),
      })),
    }

    const res = await fetch(
      `${API_BASE_URL}/admin/inventory-intake/${selectedOrder.value.order_id}/process`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    )

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || data.message || `บันทึกการรับสินค้าไม่สำเร็จ (${res.status})`)
    }

    saveMessage.value = `บันทึกสำเร็จ ยอดคืน: ${formatMoney(data.refund_amount || 0)}`
    await fetchIntakeOrders()

    const refreshedOrder = intakeOrders.value.find(
      (order) => Number(order.order_id) === Number(data.order_id),
    )
    if (refreshedOrder) {
      setSelectedOrder(refreshedOrder.order_id)
    }
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    saving.value = false
  }
}

onMounted(fetchIntakeOrders)
</script>

<template>
  <div class="intake-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Admin Inventory Intake</p>
        <h1>รับสินค้าเข้าและตรวจนับรายการที่ขาด</h1>
        <p class="subtitle">
          เลือกออเดอร์พรีออเดอร์ กรอกจำนวนรับจริงทีละชิ้น แล้วให้ระบบคำนวณยอดขาด สต็อกที่เพิ่ม
          และยอดคืนอัตโนมัติ
        </p>
      </div>

      <div class="header-meta">
        <div class="meta-card">
          <span class="meta-label">ออเดอร์รอรับ</span>
          <strong>{{ intakeOrders.length }}</strong>
        </div>
        <div class="meta-card">
          <span class="meta-label">ผู้ใช้งาน</span>
          <strong>{{ currentUser?.username || 'Admin' }}</strong>
        </div>
      </div>
    </header>

    <div v-if="loading" class="state-box">กำลังโหลดรายการรับสินค้า...</div>
    <div v-else-if="errorMessage" class="state-box state-box--error">{{ errorMessage }}</div>

    <div v-else class="intake-grid">
      <section class="panel list-panel">
        <div class="panel-header">
          <h2>รายการออเดอร์ที่รอรับ</h2>
          <button class="ghost-btn" type="button" @click="fetchIntakeOrders">รีเฟรช</button>
        </div>

        <div v-if="intakeOrders.length === 0" class="empty-box">
          ยังไม่มีออเดอร์พรีออเดอร์สำหรับตรวจรับ
        </div>

        <div v-else class="order-list">
          <button
            v-for="order in intakeOrders"
            :key="order.order_id"
            type="button"
            :class="['order-card', { active: Number(selectedOrderId) === Number(order.order_id) }]"
            @click="setSelectedOrder(order.order_id)"
          >
            <div class="order-card__top">
              <strong>#{{ order.order_id }}</strong>
              <span
                :class="resolveStatusClass(order.summary?.fully_received ? 'ready' : order.status)"
              >
                {{
                  resolveStatusLabel(order.summary?.fully_received ? 'ready_to_ship' : order.status)
                }}
              </span>
            </div>
            <div class="order-card__body">
              <p>{{ order.full_name || order.username || 'ไม่ระบุชื่อ' }}</p>
              <small>{{ formatDate(order.order_date) }}</small>
            </div>
            <div class="order-card__footer">
              <span>{{ order.summary?.total_items || 0 }} รายการ</span>
              <span>{{ formatMoney(order.total_amount) }}</span>
            </div>
          </button>
        </div>
      </section>

      <section class="panel detail-panel">
        <template v-if="selectedOrder">
          <div class="panel-header panel-header--stacked">
            <div>
              <h2>ตรวจรับออเดอร์ #{{ selectedOrder.order_id }}</h2>
              <p>
                ลูกค้า: {{ selectedOrder.full_name || selectedOrder.username || '-' }} ·
                {{ formatDate(selectedOrder.order_date) }}
              </p>
            </div>

            <div class="summary-strip">
              <div>
                <span>ยอดสั่ง</span>
                <strong>{{
                  formatMoney(selectedSummary?.ordered_amount || selectedOrder.total_amount)
                }}</strong>
              </div>
              <div>
                <span>ยอดรับจริง</span>
                <strong>{{ formatMoney(selectedSummary?.received_amount || 0) }}</strong>
              </div>
              <div>
                <span>ยอดคืน</span>
                <strong>{{ formatMoney(selectedSummary?.missing_amount || 0) }}</strong>
              </div>
            </div>
          </div>

          <div class="items-table">
            <div class="items-head">
              <span>สินค้า</span>
              <span>สั่ง</span>
              <span>รับจริง</span>
              <span>ขาด</span>
              <span>สถานะ</span>
            </div>

            <div v-for="item in selectedOrder.items" :key="item.detail_id" class="items-row">
              <div class="product-col">
                <div class="product-thumb">{{ item.image_url ? '📦' : '🐾' }}</div>
                <div>
                  <strong>{{ item.product_name }}</strong>
                  <p v-if="item.flavor">{{ item.flavor }}</p>
                  <small>฿{{ Number(item.unit_price || 0).toLocaleString('th-TH') }} / ชิ้น</small>
                </div>
              </div>

              <div>{{ item.ordered_qty }}</div>

              <div>
                <input
                  :value="receivedDraft[item.detail_id] ?? 0"
                  class="qty-input"
                  min="0"
                  type="number"
                  @input="updateDraft(item.detail_id, $event.target.value)"
                />
              </div>

              <div>
                <template v-if="Number(receivedDraft[item.detail_id] ?? 0) > item.ordered_qty">
                  เกิน {{ Number(receivedDraft[item.detail_id] ?? 0) - item.ordered_qty }}
                </template>
                <template v-else>
                  {{ Math.max(item.ordered_qty - Number(receivedDraft[item.detail_id] ?? 0), 0) }}
                </template>
              </div>

              <div>
                <span :class="resolveStatusClass(item.arrival_status)">
                  {{ resolveStatusLabel(item.arrival_status) }}
                </span>
              </div>
            </div>
          </div>

          <label class="note-field">
            หมายเหตุการตรวจรับ
            <textarea
              v-model="note"
              rows="3"
              placeholder="เช่น ของมาครบยกเว้นรายการ A 2 ชิ้น"
            ></textarea>
          </label>

          <div class="transfer-options">
            <label class="option">
              <input type="checkbox" v-model="moveExcessToStock" />
              ถ้ารับมาเกิน ให้ย้ายส่วนเกินเป็นสต็อกพร้อมส่ง
            </label>
            <label class="option">
              <input type="checkbox" v-model="decrementPreorderPool" />
              เมื่อตรวจรับพรีออเดอร์ ให้ลดจำนวนในรอบพรีออเดอร์อัตโนมัติ
            </label>
          </div>

          <div class="action-row">
            <button class="primary-btn" type="button" :disabled="saving" @click="processIntake">
              {{ saving ? 'กำลังบันทึก...' : 'บันทึกผลตรวจรับ' }}
            </button>
            <p v-if="saveMessage" class="save-message">{{ saveMessage }}</p>
          </div>
        </template>

        <div v-else class="empty-box empty-box--tall">
          เลือกรายการออเดอร์ทางซ้ายเพื่อเริ่มตรวจรับสินค้า
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.intake-page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(255, 183, 214, 0.25), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 145, 255, 0.18), transparent 26%), #faf7ff;
  color: #2c2440;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  color: #a45bd6;
  font-weight: 700;
}

h1,
h2,
p {
  margin: 0;
}

.subtitle {
  margin-top: 0.55rem;
  color: #6b5a84;
  max-width: 780px;
  line-height: 1.6;
}

.header-meta {
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.meta-card {
  min-width: 140px;
  padding: 0.9rem 1rem;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(170, 133, 204, 0.18);
  border-radius: 18px;
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.meta-label {
  display: block;
  font-size: 0.78rem;
  color: #8f7ca8;
  margin-bottom: 0.3rem;
}

.state-box {
  padding: 1rem 1.1rem;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 28px rgba(140, 99, 174, 0.08);
}

.state-box--error {
  color: #b42318;
  border: 1px solid #fda29b;
}

.intake-grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1rem;
}

.panel {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(160, 126, 191, 0.14);
  border-radius: 22px;
  box-shadow: 0 20px 36px rgba(140, 99, 174, 0.08);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
  padding: 1.1rem 1.2rem;
  border-bottom: 1px solid rgba(160, 126, 191, 0.12);
}

.panel-header--stacked {
  align-items: start;
  flex-direction: column;
}

.panel-header p {
  color: #7f6c99;
  margin-top: 0.35rem;
}

.ghost-btn,
.primary-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.8rem 1.1rem;
  cursor: pointer;
  font-weight: 700;
}

.ghost-btn {
  background: #f3ecff;
  color: #7d4db2;
}

.primary-btn {
  background: linear-gradient(135deg, #a55eea, #ff7eb6);
  color: #fff;
}

.list-panel {
  min-height: 72vh;
}

.order-list {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
}

.order-card {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(160, 126, 191, 0.15);
  background: #fff;
  border-radius: 18px;
  padding: 1rem;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}

.order-card:hover,
.order-card.active {
  transform: translateY(-1px);
  border-color: rgba(165, 94, 234, 0.35);
  box-shadow: 0 14px 28px rgba(140, 99, 174, 0.12);
}

.order-card__top,
.order-card__footer {
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: center;
}

.order-card__body {
  margin: 0.7rem 0;
}

.order-card__body p {
  margin-bottom: 0.2rem;
  font-weight: 700;
}

.order-card__body small,
.order-card__footer {
  color: #87759d;
}

.detail-panel {
  padding-bottom: 1rem;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  width: 100%;
}

.summary-strip > div {
  padding: 0.85rem 0.95rem;
  background: linear-gradient(180deg, #faf5ff, #fff);
  border-radius: 18px;
  border: 1px solid rgba(160, 126, 191, 0.12);
}

.summary-strip span {
  display: block;
  font-size: 0.75rem;
  color: #8d7aa7;
  margin-bottom: 0.25rem;
}

.items-table {
  padding: 1rem 1.2rem 0.6rem;
}

.items-head,
.items-row {
  display: grid;
  grid-template-columns: 1.3fr 80px 110px 80px 110px;
  gap: 0.75rem;
  align-items: center;
}

.items-head {
  padding-bottom: 0.75rem;
  font-size: 0.8rem;
  color: #8d7aa7;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.items-row {
  padding: 0.85rem 0;
  border-top: 1px solid rgba(160, 126, 191, 0.12);
}

.product-col {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.product-thumb {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: #f5efff;
  font-size: 1.1rem;
}

.product-col strong {
  display: block;
}

.product-col p,
.product-col small {
  color: #8a78a4;
}

.qty-input {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border-radius: 14px;
  border: 1px solid #d8c7ee;
  background: #fff;
}

.note-field {
  display: block;
  padding: 0 1.2rem 0.8rem;
  color: #6e5f86;
}

.note-field textarea {
  display: block;
  width: 100%;
  margin-top: 0.45rem;
  border-radius: 18px;
  border: 1px solid #d8c7ee;
  padding: 0.9rem;
  resize: vertical;
  min-height: 100px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0 1.2rem 1rem;
  flex-wrap: wrap;
}

.save-message {
  color: #7d4db2;
  font-weight: 700;
}

.empty-box {
  padding: 1.4rem;
  margin: 1rem;
  border-radius: 18px;
  background: #fbf8ff;
  color: #836da0;
  text-align: center;
}

.empty-box--tall {
  min-height: 280px;
  display: grid;
  place-items: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.34rem 0.72rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.badge--pending {
  background: #fff4d9;
  color: #b76b00;
}

.badge--ready {
  background: #e2f8eb;
  color: #16794c;
}

.badge--partial {
  background: #eef2ff;
  color: #5753c9;
}

.badge--missing {
  background: #fde2e1;
  color: #b42318;
}

@media (max-width: 1100px) {
  .intake-grid {
    grid-template-columns: 1fr;
  }

  .list-panel {
    min-height: auto;
  }
}

@media (max-width: 760px) {
  .page-header {
    flex-direction: column;
    align-items: start;
  }

  .summary-strip,
  .items-head,
  .items-row {
    grid-template-columns: 1fr;
  }

  .items-head {
    display: none;
  }

  .items-row > div {
    padding: 0.1rem 0;
  }
}
</style>
