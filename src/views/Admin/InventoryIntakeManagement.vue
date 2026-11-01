<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'

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
const previewImage = ref(null)
const selectedLineKeys = ref([])
const splitting = ref(false)

function openImagePreview(url, title, subtitle) {
  if (!url) return
  previewImage.value = { url, title, subtitle }
}

function closeImagePreview() {
  previewImage.value = null
}

function handleKeydown(e) {
  if (e.key === 'Escape') closeImagePreview()
}

const selectedIntakeOrder = computed(() => {
  return (
    intakeOrders.value.find(
      (order) => Number(order.round_id) === Number(selectedIntakeOrderId.value),
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

function intakeConfirmationLabel(order) {
  if (!order?.intake_confirmed) return ''
  return order.last_intake_at ? `ยืนยันล่าสุด ${formatDate(order.last_intake_at)}` : 'ยืนยันแล้ว'
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
  if (key.includes('delayed')) return 'badge badge--missing'
  if (key.includes('missing')) return 'badge badge--missing'
  return 'badge badge--pending'
}

function resolveIntakeStatusLabel(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'ready_to_ship') return 'พร้อมจัดส่ง'
  if (key === 'partially_received') return 'รับไม่ครบ'
  if (key === 'pending') return 'รอรับเข้า'
  if (key === 'delayed') return 'รอของ'
  if (key === 'missing') return 'ขาดสินค้า'
  if (key === 'received') return 'รับครบ'
  if (key === 'partial') return 'รับบางส่วน'
  return status || 'Pending'
}

// รายการที่คืนเงินแล้ว (ส่วนที่ยังไม่ได้รับถูกแยกไปออเดอร์คืนเงินหมดแล้ว)
function isRefundedItem(item) {
  return (
    Boolean(item?.refund_locked) ||
    String(item?.arrival_status || '').trim().toLowerCase() === 'refunded'
  )
}

// ล็อกไม่ให้กรอกรับเพิ่ม: รับครบแล้ว หรือ คืนเงินแล้ว
function isArrivedItem(item) {
  return (
    String(item?.arrival_status || '').trim().toLowerCase() === 'arrived' || isRefundedItem(item)
  )
}

function setSelectedIntakeOrder(orderId) {
  selectedIntakeOrderId.value = orderId
  intakeMessage.value = ''
  intakeNote.value = ''

  const order = intakeOrders.value.find((item) => Number(item.round_id) === Number(orderId))
  const draft = {}

  // receivedDraft เก็บ "จำนวนที่รับเพิ่มในครั้งนี้" เริ่มที่ 0 เสมอ
  // ยอดที่เคยรับไปแล้วอ่านจาก item.received_qty ทำให้ทยอยรับได้หลายครั้งในออเดอร์เดิม
  for (const item of order?.items || []) {
    draft[item.detail_id] = 0
  }

  receivedDraft.value = draft
  selectedLineKeys.value = []
}

// ยอดที่บันทึกรับเข้าไปแล้วจากครั้งก่อน ๆ (สะสม)
function getPreviousReceived(item) {
  const orderedQty = Math.max(Number(item?.ordered_qty) || 0, 0)
  const receivedQty = Math.max(Number(item?.received_qty) || 0, 0)
  return Math.min(receivedQty, orderedQty)
}

// จำนวนที่กรอกรับเพิ่มในครั้งนี้
function getIncomingQty(item) {
  return Math.max(Number(receivedDraft.value[item?.detail_id]) || 0, 0)
}

// ยอดรับรวมหลังบันทึกครั้งนี้ = ยอดเดิม + รับเพิ่ม
function getTotalAfterIntake(item) {
  return getPreviousReceived(item) + getIncomingQty(item)
}

// จำนวนที่ยังค้างรับก่อนกรอกครั้งนี้
function getOutstandingQty(item) {
  return Math.max((Number(item?.ordered_qty) || 0) - getPreviousReceived(item), 0)
}

function clearSelectedIntakeOrder() {
  selectedIntakeOrderId.value = null
  intakeMessage.value = ''
  intakeNote.value = ''
  receivedDraft.value = {}
  selectedLineKeys.value = []
}

function updateDraft(detailId, rawValue) {
  const value = Number(rawValue)
  receivedDraft.value = {
    ...receivedDraft.value,
    [detailId]: Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0,
  }
}

const itemsNeedingAttention = computed(() => {
  if (!selectedIntakeOrder.value) return []
  return selectedIntakeOrder.value.items.filter((item) => {
    if (isArrivedItem(item)) return false
    return getTotalAfterIntake(item) < Number(item.ordered_qty)
  })
})

const editableIntakeItems = computed(() => selectedIntakeOrder.value?.items || [])

function getDraftIntakeStatus(item) {
  if (isArrivedItem(item)) return 'ready'

  const received = getTotalAfterIntake(item)
  const ordered = Number(item.ordered_qty) || 0

  if (received >= ordered) return 'ready'
  // ยังไม่เคยบันทึกรับของและยังไม่ได้กรอกจำนวน = รอรับเข้า (ยังไม่ใช่ตกหล่น)
  if (String(item.arrival_status || '').toLowerCase() === 'pending') {
    return 'pending'
  }
  return 'delayed'
}

const excessReceivedItems = computed(() => {
  if (!selectedIntakeOrder.value) return []
  return selectedIntakeOrder.value.items
    .filter((item) => !isArrivedItem(item))
    .map((item) => {
      const received = getTotalAfterIntake(item)
      const ordered = Number(item.ordered_qty) || 0
      return { ...item, excess_qty: Math.max(received - ordered, 0) }
    })
    .filter((item) => item.excess_qty > 0)
})

const totalExcessReceived = computed(() =>
  excessReceivedItems.value.reduce((sum, item) => sum + item.excess_qty, 0),
)

const totalIncomingQty = computed(() =>
  (selectedIntakeOrder.value?.items || [])
    .filter((item) => !isArrivedItem(item))
    .reduce((sum, item) => sum + getIncomingQty(item), 0),
)

const totalOutstandingQty = computed(() =>
  (selectedIntakeOrder.value?.items || [])
    .filter((item) => !isArrivedItem(item))
    .reduce((sum, item) => sum + getOutstandingQty(item), 0),
)

// ── เลือกหลายรายการเพื่อตั้งเป็นตกหล่น + แยกออเดอร์เพิ่ม ──
function lineKeyOf(item) {
  return String(item?.line_key || item?.detail_id || '')
}

function isFeeLocked(item) {
  return (
    Boolean(item?.fee_confirmed) ||
    String(item?.arrival_status || '').toLowerCase() === 'missing'
  )
}

// จำนวนคงค้างที่ยังไม่ได้แยกเป็นออเดอร์ตกหล่น/คืนเงิน
function getUnsplitOutstandingQty(item) {
  if (item?.unsplit_outstanding_qty === undefined) return getOutstandingQty(item)
  return Math.max(Number(item.unsplit_outstanding_qty) || 0, 0)
}

function formatOrderIds(ids) {
  return (ids || []).map((id) => `#${String(id).padStart(3, '0')}`).join(', ')
}

// แยกได้หลายครั้ง: แม้เคยแยกเป็นออเดอร์ตกหล่นแล้ว ถ้ายังมีของค้างก็แยกต่อเป็นออเดอร์ตกหล่นใบใหม่ได้
function canSelectForSplit(item) {
  return Boolean(item) && !isArrivedItem(item) && getOutstandingQty(item) > 0 && !isFeeLocked(item)
}

function getSplitTimes(item) {
  return (item?.split_delayed_order_ids || []).length
}

function splitDisabledReason(item) {
  if (isRefundedItem(item)) return 'คืนเงินแล้ว — รับเข้าเพิ่มไม่ได้'
  if (isArrivedItem(item)) return 'รับสินค้าครบแล้ว'
  if (isFeeLocked(item)) return 'ยืนยันค่านำเข้าแล้ว — จัดการที่หน้าสินค้าขาด/ตกหล่น'
  if (getOutstandingQty(item) <= 0) return 'ไม่มีจำนวนคงค้าง'
  if (item?.is_split_delayed) return 'เคยแยกแล้ว — เลือกเพื่อแยกเป็นออเดอร์ตกหล่นใบใหม่อีกครั้ง'
  return 'เลือกเพื่อแยกเป็นออเดอร์ตกหล่น'
}

const selectableSplitItems = computed(() => editableIntakeItems.value.filter(canSelectForSplit))

const selectedSplitItems = computed(() => {
  const keys = new Set(selectedLineKeys.value)
  return editableIntakeItems.value.filter((item) => keys.has(lineKeyOf(item)) && canSelectForSplit(item))
})

const selectedSplitQty = computed(() =>
  selectedSplitItems.value.reduce((sum, item) => sum + getOutstandingQty(item), 0),
)

const allSplitSelected = computed(
  () =>
    selectableSplitItems.value.length > 0 &&
    selectableSplitItems.value.every((item) => selectedLineKeys.value.includes(lineKeyOf(item))),
)

function isLineSelected(item) {
  return selectedLineKeys.value.includes(lineKeyOf(item))
}

function toggleLineSelection(item) {
  if (!canSelectForSplit(item)) return
  const key = lineKeyOf(item)
  selectedLineKeys.value = isLineSelected(item)
    ? selectedLineKeys.value.filter((k) => k !== key)
    : [...selectedLineKeys.value, key]
}

function toggleSelectAllSplit() {
  selectedLineKeys.value = allSplitSelected.value
    ? []
    : selectableSplitItems.value.map(lineKeyOf)
}

async function splitSelectedAsMissing() {
  if (!selectedIntakeOrder.value || selectedSplitItems.value.length === 0 || splitting.value) return

  const summary = selectedSplitItems.value
    .map(
      (item) =>
        `• ${item.product_name}${item.flavor ? ` (${item.flavor})` : ''}: ค้าง ${getOutstandingQty(item)} ชิ้น` +
        (item.is_split_delayed ? ' (เคยแยกแล้ว → แยกใหม่อีกครั้ง)' : ''),
    )
    .join('\n')
  const confirmed = window.confirm(
    `ตั้งเป็น "ตกหล่น" และแยกเป็นออเดอร์เพิ่ม ${selectedSplitItems.value.length} รายการ\n\n${summary}\n\n` +
      'ระบบจะสร้างออเดอร์ตกหล่นใบใหม่ให้ลูกค้าแต่ละคน แล้วย้าย "จำนวนที่ยังไม่มา" ไปไว้ในนั้น สถานะ "รอของ"\n' +
      'ส่วนที่รับมาแล้วยังอยู่ในออเดอร์เดิม จัดส่งต่อได้ตามปกติ\n' +
      'รายการที่เคยแยกแล้วแต่ยังไม่มา จะถูกย้ายไปออเดอร์ตกหล่นใบใหม่ (แยกครั้งถัดไป)\n\nยืนยันหรือไม่?',
  )
  if (!confirmed) return

  splitting.value = true
  intakeMessage.value = ''
  const roundId = selectedIntakeOrder.value.round_id

  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/inventory-intake/rounds/${roundId}/split-missing`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ line_keys: selectedSplitItems.value.map(lineKeyOf) }),
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || data.message || `แยกออเดอร์ตกหล่นไม่สำเร็จ (${response.status})`)
    }

    await fetchIntakeOrders()
    window.dispatchEvent(new Event('meowverse:inventory-intake-updated'))
    if (intakeOrders.value.some((order) => Number(order.round_id) === Number(roundId))) {
      setSelectedIntakeOrder(roundId)
    }
    const childIds = (data.split_order_ids || []).map((id) => `#${id}`).join(', ')
    intakeMessage.value =
      `แยกเป็นออเดอร์ตกหล่นแล้ว ${data.split_count} รายการจาก ${data.parent_order_count} ออเดอร์` +
      (childIds ? ` → ออเดอร์ตกหล่น ${childIds}` : '') +
      (data.skipped_count ? ` · ข้าม ${data.skipped_count} รายการที่รับครบ/แยกไปแล้ว` : '')
  } catch (error) {
    intakeMessage.value = translateError(error)
  } finally {
    splitting.value = false
  }
}

async function fetchIntakeOrders() {
  intakeLoading.value = true
  intakeError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/admin/inventory-intake/rounds?status=closed`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      throw new Error(`โหลดรายการรับสินค้าไม่สำเร็จ (${response.status})`)
    }

    intakeOrders.value = await response.json()

    const stillExists = intakeOrders.value.some(
      (order) => Number(order.round_id) === Number(selectedIntakeOrderId.value),
    )
    if (!stillExists) {
      clearSelectedIntakeOrder()
    }
  } catch (error) {
    intakeError.value = translateError(error)
  } finally {
    intakeLoading.value = false
  }
}

async function processIntake() {
  if (!selectedIntakeOrder.value) return

  if (totalExcessReceived.value > 0) {
    const excessSummary = excessReceivedItems.value
      .map((item) => `${item.product_name}${item.flavor ? ` (${item.flavor})` : ''}: ${item.excess_qty} ชิ้น`)
      .join('\n')
    moveExcessToStock.value = window.confirm(
      `พบสินค้ารับเกินยอดสั่งซื้อรวม ${totalExcessReceived.value} ชิ้น\n\n${excessSummary}\n\nกด ตกลง เพื่อนำส่วนเกินเข้าสต็อกพร้อมส่ง\nกด ยกเลิก เพื่อรับเข้าตามยอดออเดอร์เท่านั้นและไม่เพิ่มส่วนเกินเข้าสต็อก`,
    )
  }

  savingIntake.value = true
  intakeMessage.value = ''
  const savedIncomingQty = totalIncomingQty.value

  try {
    const payload = {
      request_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${selectedIntakeOrder.value.round_id}`,
      note: intakeNote.value.trim(),
      move_excess_to_stock: moveExcessToStock.value,
      items: (selectedIntakeOrder.value.items || [])
        .filter((item) => !isArrivedItem(item))
        .map((item) => ({
          detail_id: item.detail_id,
          // ส่งเฉพาะจำนวนที่รับเพิ่มครั้งนี้ ให้ server บวกกับยอดล่าสุดในฐานข้อมูลเอง
          // ป้องกันยอดหาย/ซ้ำเมื่อหน้าเว็บค้างข้อมูลเก่าหรือมีแอดมินอื่นบันทึกไปก่อน
          incoming_qty: getIncomingQty(item),
        })),
    }

    const response = await fetch(
      `${API_BASE_URL}/admin/inventory-intake/rounds/${selectedIntakeOrder.value.round_id}/process`,
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

    const confirmedIncomingQty = Number(data.incoming_qty ?? savedIncomingQty) || 0
    intakeMessage.value = confirmedIncomingQty > 0
      ? `บันทึกรับเพิ่ม ${confirmedIncomingQty} ชิ้นสำเร็จ ยอดคืน: ${formatMoney(data.refund_amount || 0)}`
      : `บันทึกสำเร็จ ยอดคืน: ${formatMoney(data.refund_amount || 0)}`
    if (Number(data.excess_qty) > 0) {
      intakeMessage.value += data.excess_stock_action === 'moved_to_stock'
        ? ` นำส่วนเกิน ${data.excess_qty} ชิ้นเข้าสต็อกพร้อมส่งแล้ว`
        : ` บันทึกส่วนเกิน ${data.excess_qty} ชิ้นไว้ในประวัติแล้ว แต่ไม่ได้เข้าสต็อกพร้อมส่ง`
    }
    await fetchIntakeOrders()
    window.dispatchEvent(new Event('meowverse:inventory-intake-updated'))

    const refreshedOrder = intakeOrders.value.find(
      (order) => Number(order.round_id) === Number(data.round_id),
    )
    if (refreshedOrder) {
      const message = intakeMessage.value
      setSelectedIntakeOrder(refreshedOrder.round_id)
      intakeMessage.value = message
      if (!refreshedOrder.summary?.fully_received) {
        intakeMessage.value += ' · ยังรับไม่ครบ สามารถกรอกรับเพิ่มได้อีกในครั้งถัดไป'
      }
    }
  } catch (error) {
    intakeMessage.value = translateError(error)
  } finally {
    savingIntake.value = false
  }
}

onMounted(() => {
  fetchIntakeOrders()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="inventory-intake-page">
    <AdminPageHeader title="รับสินค้าเข้าตามรอบพรีออเดอร์" description="เลือก “รอบ” แล้วกรอกจำนวนรับจริงรวมทั้งรอบ หากรับไม่ครบสามารถบันทึกเพิ่มได้หลายครั้งโดยไม่แยกออเดอร์ของลูกค้า"></AdminPageHeader>

    <section class="kpi-grid">
      <article class="kpi-card">
        <p class="kpi-label">รอบรอรับ</p>
        <p class="kpi-value">{{ intakeOrders.length }}</p>
      </article>
    </section>

    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>รับสินค้าเข้าตามรอบและตรวจนับสินค้ารวม</h2>
          <p>กรอกจำนวนรับจริงแบบรวมทั้งรอบ บันทึกผลได้หลายครั้งเพื่อทยอยรับสินค้าเข้าโดยคงออเดอร์เดิม</p>
        </div>
        <button class="ghost-btn" type="button" @click="fetchIntakeOrders">รีเฟรช</button>
      </header>

      <div v-if="intakeLoading" class="state-box">กำลังโหลดรายการรับสินค้า...</div>
      <div v-else-if="intakeError" class="state-box state-box--error">{{ intakeError }}</div>

      <div v-else class="intake-grid">
        <aside class="order-list-panel">
          <div v-if="intakeOrders.length === 0" class="empty-box">
            ยังไม่มีรอบพรีออเดอร์สำหรับตรวจรับ
          </div>

          <div v-else class="order-list">
            <button
              v-for="order in intakeOrders"
              :key="order.round_id"
              type="button"
              :class="[
                'order-card',
                { active: Number(selectedIntakeOrderId) === Number(order.round_id) },
              ]"
              @click="setSelectedIntakeOrder(order.round_id)"
            >
              <div class="order-card__top">
                <strong>รอบ #{{ order.round_id }}</strong>
                <div class="order-card__badges">
                  <span
                    :class="
                      resolveIntakeStatusClass(
                        order.summary?.fully_received ? 'ready' : order.round_status || order.status,
                      )
                    "
                  >
                    {{
                      resolveIntakeStatusLabel(
                        order.summary?.fully_received
                          ? 'ready_to_ship'
                          : order.round_status || order.status,
                      )
                    }}
                  </span>
                  <span v-if="order.intake_confirmed" class="badge badge--confirmed">ยืนยันแล้ว</span>
                </div>
              </div>
              <div class="order-card__body">
                <p>{{ order.round_name || `รอบ #${order.round_id}` }}</p>
                <small>{{ formatDate(order.start_date || order.end_date) }}</small>
              </div>
              <div class="order-card__footer">
                <span>{{ order.summary?.total_qty || 0 }} ชิ้น</span>
                <span>{{ order.summary?.total_orders || 0 }} ออเดอร์ในรอบ</span>
              </div>
              <small v-if="order.intake_confirmed" class="order-card__confirmed-at">
                {{ intakeConfirmationLabel(order) }}
              </small>
            </button>
          </div>
        </aside>

        <main class="detail-panel">
          <template v-if="selectedIntakeOrder">
            <div class="panel-head panel-head--stacked">
              <div>
                <h3>ตรวจรับรอบ #{{ selectedIntakeOrder.round_id }}</h3>
                <p>
                  {{ selectedIntakeOrder.round_name || `รอบ #${selectedIntakeOrder.round_id}` }} ·
                  {{ selectedIntakeSummary?.total_orders || 0 }} ออเดอร์ในรอบ ·
                  {{ selectedIntakeSummary?.total_qty || 0 }} ชิ้น
                </p>
              </div>

              <div class="summary-strip">
                <div>
                  <span>ยอดรวมในรอบ</span>
                  <strong>{{ formatMoney(selectedIntakeSummary?.ordered_amount || 0) }}</strong>
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
                <span class="head-product">
                  <input
                    type="checkbox"
                    class="line-check"
                    :checked="allSplitSelected"
                    :disabled="selectableSplitItems.length === 0"
                    title="เลือกทุกรายการที่แยกเป็นตกหล่นได้"
                    @change="toggleSelectAllSplit"
                  />
                  สินค้า
                </span>
                <span>รวมสั่ง</span>
                <span>รับแล้ว</span>
                <span>รับเพิ่มครั้งนี้</span>
                <span>คงค้าง</span>
                <span>สถานะ</span>
              </div>

              <div v-if="editableIntakeItems.length > 0" class="items-section-header">
                <p class="section-title">กรอกจำนวนที่รับเพิ่มในครั้งนี้ (ระบบจะบวกกับยอดที่รับไปแล้ว)</p>
              </div>

              <div v-if="selectableSplitItems.length > 0" :class="['bulk-bar', { 'bulk-bar--active': selectedSplitItems.length > 0 }]">
                <label class="bulk-bar__select">
                  <input
                    type="checkbox"
                    class="line-check"
                    :checked="allSplitSelected"
                    @change="toggleSelectAllSplit"
                  />
                  <span v-if="selectedSplitItems.length === 0">
                    ติ๊กเลือกรายการที่ของไม่มา เพื่อตั้งเป็นตกหล่นและแยกออเดอร์เพิ่ม
                  </span>
                  <span v-else>
                    เลือก <strong>{{ selectedSplitItems.length }}</strong> รายการ · ค้างรวม
                    <strong>{{ selectedSplitQty }}</strong> ชิ้น
                  </span>
                </label>
                <div class="bulk-bar__actions">
                  <button
                    v-if="selectedSplitItems.length > 0"
                    type="button"
                    class="ghost-btn ghost-btn--sm"
                    :disabled="splitting"
                    @click="selectedLineKeys = []"
                  >
                    ล้างที่เลือก
                  </button>
                  <button
                    type="button"
                    class="split-btn"
                    :disabled="splitting || selectedSplitItems.length === 0"
                    @click="splitSelectedAsMissing"
                  >
                    {{ splitting ? 'กำลังแยกออเดอร์...' : 'ตั้งเป็นตกหล่น + แยกออเดอร์เพิ่ม' }}
                  </button>
                </div>
              </div>

              <div
                v-for="item in editableIntakeItems"
                :key="item.detail_id"
                :class="['items-row', { 'items-row--arrived': isArrivedItem(item), 'items-row--refunded': isRefundedItem(item), 'items-row--selected': isLineSelected(item) && canSelectForSplit(item) }]"
              >
                <div class="product-col">
                  <input
                    type="checkbox"
                    class="line-check"
                    :checked="isLineSelected(item) && canSelectForSplit(item)"
                    :disabled="!canSelectForSplit(item) || splitting"
                    :title="splitDisabledReason(item)"
                    :aria-label="`เลือก ${item.product_name} เพื่อแยกเป็นออเดอร์ตกหล่น`"
                    @change="toggleLineSelection(item)"
                  />
                  <button
                    v-if="item.image_url"
                    type="button"
                    class="thumb-btn"
                    @click="openImagePreview(item.image_url, item.product_name, item.flavor)"
                    :aria-label="`ดูรูป ${item.product_name}`"
                  >
                    <img
                      :src="item.image_url"
                      :alt="item.product_name"
                      class="product-thumb product-thumb--img"
                      loading="lazy"
                    />
                  </button>
                  <div v-else class="product-thumb">🐾</div>
                  <div>
                    <strong>{{ item.product_name }}</strong>
                    <p v-if="item.flavor">รสชาติ: {{ item.flavor }}</p>
                    <small
                      >฿{{ Number(item.unit_price || 0).toLocaleString('th-TH') }} / ชิ้น</small
                    >
                    <div v-if="item.is_split_delayed || item.is_split_refund" class="split-badges">
                      <span
                        v-if="item.is_split_delayed"
                        class="split-badge split-badge--delayed"
                        :title="`ออเดอร์ตกหล่น: ${formatOrderIds(item.split_delayed_order_ids)}`"
                      >
                        {{ getUnsplitOutstandingQty(item) > 0 ? 'แยกออเดอร์ตกหล่นบางส่วน' : 'ตกหล่น · แยกออเดอร์แล้ว' }}
                        {{ item.split_delayed_qty }} ชิ้น · {{ getSplitTimes(item) }} ใบ
                        <template v-if="item.split_delayed_order_ids.length <= 3">
                          ({{ formatOrderIds(item.split_delayed_order_ids) }})
                        </template>
                        <template v-else>({{ item.split_delayed_order_ids.length }} ออเดอร์)</template>
                      </span>
                      <span
                        v-if="item.is_split_refund"
                        class="split-badge split-badge--refund"
                        :title="`ออเดอร์คืนเงิน: ${formatOrderIds(item.split_refund_order_ids)}`"
                      >
                        แยกคืนเงินแล้ว {{ item.split_refund_qty }} ชิ้น
                      </span>
                    </div>
                  </div>
                </div>

                <div>{{ item.ordered_qty }}</div>

                <div>
                  <span v-if="isArrivedItem(item)" class="qty-locked">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                    {{ item.received_qty ?? item.ordered_qty }}
                  </span>
                  <span v-else class="qty-previous">{{ getPreviousReceived(item) }}</span>
                </div>

                <div>
                  <template v-if="isArrivedItem(item)">—</template>
                  <div v-else class="qty-incoming">
                    <input
                      :value="receivedDraft[item.detail_id] ?? 0"
                      class="qty-input"
                      min="0"
                      type="number"
                      :aria-label="`จำนวนรับเพิ่ม ${item.product_name}`"
                      @input="updateDraft(item.detail_id, $event.target.value)"
                    />
                    <small v-if="getIncomingQty(item) > 0" class="qty-total-hint">
                      รวมเป็น {{ getTotalAfterIntake(item) }} / {{ item.ordered_qty }}
                    </small>
                  </div>
                </div>

                <div>
                  <template v-if="isArrivedItem(item)">—</template>
                  <template v-else-if="getTotalAfterIntake(item) > item.ordered_qty">
                    เกิน {{ getTotalAfterIntake(item) - item.ordered_qty }}
                  </template>
                  <template v-else>
                    {{ Math.max(item.ordered_qty - getTotalAfterIntake(item), 0) }}
                  </template>
                </div>

                <div>
                  <span v-if="isRefundedItem(item)" class="badge badge--refunded" title="คืนเงินแล้ว — รับเข้าเพิ่มไม่ได้">คืนเงินแล้ว</span>
                  <span v-else-if="isArrivedItem(item)" class="badge badge--arrived">รับสินค้าแล้ว</span>
                  <span v-else :class="resolveIntakeStatusClass(getDraftIntakeStatus(item))">
                    {{ resolveIntakeStatusLabel(getDraftIntakeStatus(item)) }}
                  </span>
                </div>
              </div>

              <div
                v-if="itemsNeedingAttention.length === 0 && selectedIntakeOrder.items.length === 0"
                class="empty-items-box"
              >
                รอบนี้ยังไม่มีออเดอร์ให้ตรวจรับ
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
            </div>

            <p v-if="totalOutstandingQty > 0" class="intake-progress">
              ครั้งนี้รับเพิ่ม <strong>{{ totalIncomingQty }}</strong> ชิ้น ·
              คงค้างก่อนบันทึก {{ totalOutstandingQty }} ชิ้น ·
              หลังบันทึกจะเหลือค้าง
              <strong>{{ Math.max(totalOutstandingQty - totalIncomingQty + totalExcessReceived, 0) }}</strong> ชิ้น
            </p>

            <div class="action-row">
              <button
                class="primary-btn"
                type="button"
                :disabled="savingIntake"
                @click="processIntake"
              >
                {{ savingIntake ? 'กำลังบันทึก...' : selectedIntakeOrder.intake_confirmed ? 'บันทึกรับสินค้าเพิ่ม' : 'บันทึกผลตรวจรับ' }}
              </button>
              <p v-if="intakeMessage" class="save-message">{{ intakeMessage }}</p>
            </div>
          </template>

          <div v-else class="empty-box empty-box--tall">เลือกรอบทางซ้ายเพื่อเริ่มตรวจรับสินค้า</div>
        </main>
      </div>
    </section>

    <div v-if="previewImage" class="modal-overlay" @click.self="closeImagePreview">
      <div class="image-modal-card">
        <button type="button" class="image-modal-close" @click="closeImagePreview" aria-label="ปิด">✕</button>
        <img :src="previewImage.url" :alt="previewImage.title" class="image-modal-img" />
        <p class="image-modal-caption">
          {{ previewImage.title }}<span v-if="previewImage.subtitle"> · {{ previewImage.subtitle }}</span>
        </p>
      </div>
    </div>
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
  grid-template-columns: 1.3fr 70px 70px 150px 80px 110px;
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
  flex: 0 0 auto;
}

.product-thumb--img {
  object-fit: cover;
}

.thumb-btn {
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  display: block;
  line-height: 0;
  border-radius: 16px;
  flex: 0 0 auto;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.thumb-btn:hover,
.thumb-btn:focus-visible {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(84, 54, 113, 0.25);
  outline: none;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(44, 36, 64, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}

.image-modal-card {
  width: min(480px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.1rem;
  position: relative;
  text-align: center;
}

.image-modal-close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #eadcf6;
  background: #fff;
  color: #6d5a8c;
  font-size: 0.9rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.image-modal-close:hover {
  background: #f5efff;
}

.image-modal-img {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 14px;
  background: #f5efff;
}

.image-modal-caption {
  margin: 0.75rem 0 0;
  color: #3f2f5d;
  font-weight: 600;
  font-size: 0.9rem;
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

.items-section-header {
  padding: 1rem 0 0.5rem;
  border-top: 2px solid rgba(160, 126, 191, 0.2);
  margin-top: 1rem;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #432f61;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.items-row--completed {
  opacity: 0.6;
  background: rgba(230, 245, 240, 0.4);
}

.items-row--completed .product-col {
  opacity: 0.75;
}

.items-row--arrived {
  background: #f1eef7;
  border-radius: 14px;
  border-top: 1px solid rgba(160, 126, 191, 0.12);
}

.qty-previous {
  font-weight: 700;
  color: #6b5a86;
}

.qty-incoming {
  display: grid;
  gap: 0.3rem;
  justify-items: start;
}

.qty-total-hint {
  color: #8a7aa3;
  font-size: 0.75rem;
}

.intake-progress {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
  background: #f6efff;
  color: #5a4778;
  font-size: 0.9rem;
}

.qty-locked {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  border-radius: 14px;
  background: #e7e1f2;
  color: #5c4d78;
  font-weight: 700;
}

.qty-locked svg {
  flex: 0 0 auto;
  opacity: 0.8;
}

.head-product {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.line-check {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: #a55eea;
  cursor: pointer;
}

.line-check:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.split-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.split-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.4;
}

.split-badge--delayed {
  background: #fff1e6;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.split-badge--refund {
  background: #fde2e1;
  color: #b42318;
  border: 1px solid #fecaca;
}

.items-row--selected {
  background: #fff3f8;
  border-radius: 14px;
}

.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0.25rem 0 0.6rem;
  padding: 0.65rem 0.85rem;
  border-radius: 14px;
  border: 1px dashed rgba(165, 94, 234, 0.35);
  background: #fbf8ff;
  color: #6b5a84;
  font-size: 0.86rem;
}

.bulk-bar--active {
  position: sticky;
  top: 0.5rem;
  z-index: 5;
  border-style: solid;
  border-color: rgba(229, 72, 77, 0.35);
  background: #fff5f7;
  color: #5a2a3c;
  box-shadow: 0 10px 22px rgba(140, 99, 174, 0.12);
}

.bulk-bar__select {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
}

.bulk-bar__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ghost-btn--sm {
  padding: 0.55rem 0.9rem;
}

.split-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.6rem 1rem;
  font-weight: 700;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, #e5484d, #ff7eb6);
}

.split-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge--refunded {
  background: #b42318;
  color: #fff;
}

.items-row--refunded {
  background: #fdf1f0;
}

.badge--arrived {
  background: #5c4d78;
  color: #fff;
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

@media (max-width: 600px) {
  .summary-strip {
    grid-template-columns: 1fr;
  }

  .items-head {
    display: none;
  }

  .items-row {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0.8rem;
    border: 1px solid rgba(160, 126, 191, 0.18);
    border-radius: 14px;
    margin-bottom: 0.65rem;
  }

  .items-row .product-col {
    grid-column: auto;
    align-items: flex-start;
    padding-bottom: 0.55rem;
  }

  .items-row > div:not(.product-col) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.7rem;
    padding: 0.5rem 0;
    border-top: 1px solid rgba(160, 126, 191, 0.12);
    text-align: right;
  }

  .items-row > div:nth-child(2)::before { content: 'จำนวนที่สั่ง'; }
  .items-row > div:nth-child(3)::before { content: 'รับแล้ว'; }
  .items-row > div:nth-child(4)::before { content: 'รับเพิ่มครั้งนี้'; }
  .items-row > div:nth-child(5)::before { content: 'คงค้าง / เกิน'; }
  .items-row > div:nth-child(6)::before { content: 'สถานะ'; }

  .items-row > div:not(.product-col)::before {
    flex: 0 0 auto;
    color: #8d7aad;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: left;
  }

  .items-row > * {
    min-width: 0;
  }

  .qty-input {
    padding: 0.55rem;
  }

  .action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .action-row button {
    width: 100%;
  }
}
@media (max-width: 600px) {
  .items-row > * { min-width: 0; max-width: 100%; }
  .items-row .product-col { overflow-wrap: anywhere; }
  .items-row input, .items-row select, .items-row button { max-width: 100%; }
  .items-row > div:not(.product-col) > * { min-width: 0; max-width: 65%; }
}
</style>
