<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'
const { getUser } = useAuth()

const currentUser = computed(() => getUser())

const intakeOrders = ref([])
const intakeLoading = ref(false)
const intakeError = ref('')
const selectedIntakeOrderId = ref(null)
const savingIntake = ref(false)
const intakeMessage = ref('')
const intakeNote = ref('')
const receivedDraft = ref({})
const moveExcessToStock = ref(true)
const decrementPreorderPool = ref(true)

const selectedIntakeOrder = computed(() => {
  return (
    intakeOrders.value.find(
      (order) => Number(order.order_id) === Number(selectedIntakeOrderId.value),
    ) || null
  )
})

const selectedIntakeSummary = computed(() => selectedIntakeOrder.value?.summary || null)

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

function resolveIntakeStatusClass(status) {
  const key = String(status || '').toLowerCase()
  if (key.includes('ready')) return 'badge badge--ready'
  if (key.includes('partial')) return 'badge badge--partial'
  if (key.includes('missing')) return 'badge badge--missing'
  return 'badge badge--pending'
}

function resolveIntakeStatusLabel(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'ready_to_ship') return 'พร้อมจัดส่ง'
  if (key === 'partially_received') return 'รับไม่ครบ'
  if (key === 'missing') return 'ขาดสินค้า'
  if (key === 'received') return 'รับครบ'
  if (key === 'partial') return 'รับบางส่วน'
  return status || 'Pending'
}

function setSelectedIntakeOrder(orderId) {
  selectedIntakeOrderId.value = orderId
  intakeMessage.value = ''
  intakeNote.value = ''

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
  intakeLoading.value = true
  intakeError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/admin/inventory-intake/orders`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      throw new Error(`โหลดรายการรับสินค้าไม่สำเร็จ (${response.status})`)
    }

    intakeOrders.value = await response.json()

    if (!selectedIntakeOrderId.value && intakeOrders.value.length > 0) {
      setSelectedIntakeOrder(intakeOrders.value[0].order_id)
    }
  } catch (error) {
    intakeError.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    intakeLoading.value = false
  }
}

async function processIntake() {
  if (!selectedIntakeOrder.value) return

  savingIntake.value = true
  intakeMessage.value = ''

  try {
    const payload = {
      note: intakeNote.value.trim(),
      move_excess_to_stock: moveExcessToStock.value,
      decrement_preorder_pool: decrementPreorderPool.value,
      items: (selectedIntakeOrder.value.items || []).map((item) => ({
        detail_id: item.detail_id,
        received_qty: Number(receivedDraft.value[item.detail_id] ?? 0),
      })),
    }

    const response = await fetch(
      `${API_BASE_URL}/admin/inventory-intake/${selectedIntakeOrder.value.order_id}/process`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        data.error || data.message || `บันทึกการรับสินค้าไม่สำเร็จ (${response.status})`,
      )
    }

    intakeMessage.value = `บันทึกสำเร็จ ยอดคืน: ${formatMoney(data.refund_amount || 0)}`
    await fetchIntakeOrders()

    const refreshedOrder = intakeOrders.value.find(
      (order) => Number(order.order_id) === Number(data.order_id),
    )
    if (refreshedOrder) {
      setSelectedIntakeOrder(refreshedOrder.order_id)
    }
  } catch (error) {
    intakeMessage.value = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
  } finally {
    savingIntake.value = false
  }
}

onMounted(() => {
  fetchIntakeOrders()
})
</script>

<template>
  <div class="inventory-intake-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin Operations</p>
        <h1>รับสินค้าเข้าและตรวจนับรายการที่ขาด</h1>
        <p>เลือกออเดอร์พรีออเดอร์และกรอกจำนวนรับจริงทีละรายการ ระบบจะคำนวณรายการที่ขาดอัตโนมัติ</p>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card">
        <p class="kpi-label">ออเดอร์รอรับ</p>
        <p class="kpi-value">{{ intakeOrders.length }}</p>
      </article>
    </section>

    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>รับสินค้าเข้าและตรวจนับรายการที่ขาด</h2>
          <p>เลือกออเดอร์พรีออเดอร์และกรอกจำนวนรับจริงทีละรายการ</p>
        </div>
        <button class="ghost-btn" type="button" @click="fetchIntakeOrders">รีเฟรช</button>
      </header>

      <div v-if="intakeLoading" class="state-box">กำลังโหลดรายการรับสินค้า...</div>
      <div v-else-if="intakeError" class="state-box state-box--error">{{ intakeError }}</div>

      <div v-else class="intake-grid">
        <aside class="order-list-panel">
          <div v-if="intakeOrders.length === 0" class="empty-box">
            ยังไม่มีออเดอร์พรีออเดอร์สำหรับตรวจรับ
          </div>

          <div v-else class="order-list">
            <button
              v-for="order in intakeOrders"
              :key="order.order_id"
              type="button"
              :class="[
                'order-card',
                { active: Number(selectedIntakeOrderId) === Number(order.order_id) },
              ]"
              @click="setSelectedIntakeOrder(order.order_id)"
            >
              <div class="order-card__top">
                <strong>#{{ order.order_id }}</strong>
                <span
                  :class="
                    resolveIntakeStatusClass(order.summary?.fully_received ? 'ready' : order.status)
                  "
                >
                  {{
                    resolveIntakeStatusLabel(
                      order.summary?.fully_received ? 'ready_to_ship' : order.status,
                    )
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
        </aside>

        <main class="detail-panel">
          <template v-if="selectedIntakeOrder">
            <div class="panel-head panel-head--stacked">
              <div>
                <h3>ตรวจรับออเดอร์ #{{ selectedIntakeOrder.order_id }}</h3>
                <p>
                  ลูกค้า:
                  {{ selectedIntakeOrder.full_name || selectedIntakeOrder.username || '-' }} ·
                  {{ formatDate(selectedIntakeOrder.order_date) }}
                </p>
              </div>

              <div class="summary-strip">
                <div>
                  <span>ยอดสั่ง</span>
                  <strong>{{
                    formatMoney(
                      selectedIntakeSummary?.ordered_amount || selectedIntakeOrder.total_amount,
                    )
                  }}</strong>
                </div>
                <div>
                  <span>ยอดรับจริง</span>
                  <strong>{{ formatMoney(selectedIntakeSummary?.received_amount || 0) }}</strong>
                </div>
                <div>
                  <span>ยอดคืน</span>
                  <strong>{{ formatMoney(selectedIntakeSummary?.missing_amount || 0) }}</strong>
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

              <div
                v-for="item in selectedIntakeOrder.items"
                :key="item.detail_id"
                class="items-row"
              >
                <div class="product-col">
                  <div class="product-thumb">{{ item.image_url ? '📦' : '🐾' }}</div>
                  <div>
                    <strong>{{ item.product_name }}</strong>
                    <p v-if="item.flavor">{{ item.flavor }}</p>
                    <small
                      >฿{{ Number(item.unit_price || 0).toLocaleString('th-TH') }} / ชิ้น</small
                    >
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
                  <span :class="resolveIntakeStatusClass(item.arrival_status)">
                    {{ resolveIntakeStatusLabel(item.arrival_status) }}
                  </span>
                </div>
              </div>
            </div>

            <label class="note-field">
              หมายเหตุการตรวจรับ
              <textarea
                v-model="intakeNote"
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
              <button
                class="primary-btn"
                type="button"
                :disabled="savingIntake"
                @click="processIntake"
              >
                {{ savingIntake ? 'กำลังบันทึก...' : 'บันทึกผลตรวจรับ' }}
              </button>
              <p v-if="intakeMessage" class="save-message">{{ intakeMessage }}</p>
            </div>
          </template>

          <div v-else class="empty-box empty-box--tall">
            เลือกรายการออเดอร์ทางซ้ายเพื่อเริ่มตรวจรับสินค้า
          </div>
        </main>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inventory-intake-page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(255, 183, 214, 0.25), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 145, 255, 0.18), transparent 26%), #faf7ff;
  color: #2c2440;
  display: grid;
  gap: 1rem;
}

.hero-panel,
.panel,
.kpi-card,
.state-box,
.empty-box {
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.hero-panel {
  padding: 1.1rem 1.2rem;
  border-radius: 18px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background:
    radial-gradient(circle at right top, rgba(255, 147, 184, 0.32), transparent 52%),
    rgba(255, 255, 255, 0.88);
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  color: #a45bd6;
  font-weight: 700;
}

.hero-copy h1,
.panel-head h2,
.panel-head h3 {
  color: #432f61;
  font-weight: 900;
}

.hero-copy h1 {
  font-size: clamp(1.4rem, 2vw, 1.9rem);
}

.hero-copy p {
  margin-top: 0.45rem;
  color: #6b5a84;
  line-height: 1.6;
}

.kpi-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.kpi-card {
  border-radius: 15px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.88);
  padding: 0.9rem;
}

.kpi-label {
  font-size: 0.76rem;
  color: #8d7aad;
  font-weight: 700;
}

.kpi-value {
  font-size: 1.5rem;
  color: #432f61;
  font-weight: 900;
  margin-top: 0.15rem;
}

.panel {
  border-radius: 16px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.92);
  padding: 0.95rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: center;
  margin-bottom: 0.8rem;
}

.panel-head--stacked {
  flex-direction: column;
  align-items: start;
}

.panel-head p {
  color: #8d7cad;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.ghost-btn,
.primary-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
}

.ghost-btn {
  background: #f3ecff;
  color: #7d4db2;
  padding: 0.8rem 1.1rem;
}

.primary-btn {
  background: linear-gradient(135deg, #a55eea, #ff7eb6);
  color: #fff;
  padding: 0.8rem 1.1rem;
}

.intake-grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1rem;
}

.order-list {
  display: grid;
  gap: 0.8rem;
}

.order-card {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(160, 126, 191, 0.15);
  background: #fff;
  border-radius: 18px;
  padding: 1rem;
  cursor: pointer;
}

.order-card.active,
.order-card:hover {
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

.summary-strip strong {
  color: #432f61;
}

.items-table {
  padding: 1rem 0.1rem 0.6rem;
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
  margin-top: 0.9rem;
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

.transfer-options {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.85rem;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: #64557d;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.save-message {
  color: #7d4db2;
  font-weight: 700;
}

.empty-box,
.state-box {
  padding: 1rem;
  border-radius: 16px;
}

.state-box {
  background: #fff;
}

.state-box--error {
  color: #b42318;
  border: 1px solid #fda29b;
}

.empty-box {
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
  border-radius: 999px;
  padding: 0.34rem 0.72rem;
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

@media (max-width: 900px) {
  .intake-grid {
    grid-template-columns: 1fr;
  }

  .items-head,
  .items-row {
    grid-template-columns: 1fr;
  }
}
</style>
