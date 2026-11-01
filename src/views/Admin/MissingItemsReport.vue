<template>
  <div class="missing-items-page">
    <!-- Header -->
    <AdminPageHeader title="รายงานสินค้าที่ขาด / ตกหล่น" description="ดูรายละเอียดสินค้าที่ขาด เลือกรอบ และลูกค้าที่ได้รับผลกระทบ"></AdminPageHeader>

    <!-- Filters -->
    <section class="panel">
      <div class="filter-row">
        <div class="filter-group">
          <label>เลือกรอบพรีออเดอร์</label>
          <select v-model="selectedRoundId" :disabled="loading">
            <option value="">— ทั้งหมด —</option>
            <option v-for="r in rounds" :key="r.round_id" :value="r.round_id">
              {{ r.round_name }} ({{ r.missing_count || 0 }} รายการ)
            </option>
          </select>
        </div>

        <button class="ghost-btn" @click="fetchData" :disabled="loading">
          {{ loading ? 'กำลังโหลด...' : '🔄 รีเฟรช' }}
        </button>
      </div>
    </section>

    <!-- Stats -->
    <section class="kpi-grid">
      <article class="kpi-card">
        <p class="kpi-label">รวมรายการที่ขาด</p>
        <p class="kpi-value">{{ totalMissingItems }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">รวมรอบที่ได้รับผล</p>
        <p class="kpi-value">{{ affectedRounds.length }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">ยอดรวมคืนเงิน</p>
        <p class="kpi-value">฿{{ totalRefundAmount.toLocaleString() }}</p>
      </article>
    </section>

    <!-- Missing Items Table -->
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>รายการสินค้าที่ขาด</h2>
          <p class="panel-sub">ติ๊กเลือกได้หลายรายการ แล้วกดคืนเงิน — รายการที่คืนเงินจะถูกแยกออกจากออเดอร์เดิมไปเป็น "ออเดอร์คืนเงิน" ส่วนรายการที่มาช้ายังอยู่ในออเดอร์ตกหล่นตามเดิม</p>
        </div>
      </header>

      <div v-if="selectableItems.length > 0" :class="['bulk-bar', { 'bulk-bar--active': selectedItems.length > 0 }]">
        <label class="bulk-bar__select">
          <input type="checkbox" class="row-check" :checked="allSelected" @change="toggleSelectAll" />
          <span v-if="selectedItems.length === 0">เลือกทั้งหมดที่คืนเงินได้ ({{ selectableItems.length }} รายการ)</span>
          <span v-else>
            เลือก <strong>{{ selectedItems.length }}</strong> รายการ · ยอดคืน
            <strong>฿{{ selectedRefundTotal.toLocaleString() }}</strong>
          </span>
        </label>
        <div class="bulk-bar__actions">
          <button
            v-if="selectedItems.length > 0"
            type="button"
            class="ghost-btn"
            :disabled="bulkLoading"
            @click="selectedDetailIds = []"
          >
            ล้างที่เลือก
          </button>
          <button
            type="button"
            class="refund-btn"
            :disabled="bulkLoading || selectedNotSplit.length === 0"
            :title="selectedNotSplit.length === 0 ? 'รายการที่เลือกแยกเป็นออเดอร์คืนเงินแล้ว' : ''"
            @click="handleBulkRefund('pending')"
          >
            {{ bulkLoading ? 'กำลังบันทึก...' : `คืนเงิน + แยกออเดอร์ (${selectedNotSplit.length})` }}
          </button>
          <button
            type="button"
            class="paid-btn"
            :disabled="bulkLoading || selectedItems.length === 0"
            @click="handleBulkRefund('paid')"
          >
            บันทึกว่าโอนแล้ว ({{ selectedItems.length }})
          </button>
        </div>
      </div>
      <p v-if="bulkMessage" class="bulk-message">{{ bulkMessage }}</p>

      <div v-if="loading" class="state-box">กำลังโหลด...</div>
      <div v-else-if="missingItemsList.length === 0" class="empty-box">ไม่มีสินค้าที่ขาด</div>

      <div v-else class="table-wrap">
         <table class="data-table data-table--items">
          <thead>
            <tr>
              <th class="check-col">
                <input
                  type="checkbox"
                  class="row-check"
                  :checked="allSelected"
                  :disabled="selectableItems.length === 0"
                  aria-label="เลือกทั้งหมด"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="image-col">รูปภาพ</th>
              <th>สินค้า</th>
              <th>รสชาติ</th>
              <th class="num">ราคา/ชิ้น</th>
              <th class="num">รวมสั่ง</th>
              <th class="num">รับจริง</th>
              <th class="num">ขาด</th>
              <th class="num">ยอดคืน</th>
              <th>สถานะคืนเงิน</th>
              <th>รับตกหล่นเพิ่ม</th>
              <th>การจัดการ</th>
              <th>ลูกค้า (สั่งซื้อ)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in missingItemsList"
              :key="`${item.detail_id}-${item.order_id}`"
              :class="['missing-row', { 'missing-row--selected': isSelected(item) }]"
            >
              <td class="check-col">
                <input
                  type="checkbox"
                  class="row-check"
                  :checked="isSelected(item)"
                  :disabled="!canSelect(item) || bulkLoading"
                  :title="canSelect(item) ? 'เลือกเพื่อคืนเงิน' : 'โอนเงินคืนแล้ว'"
                  :aria-label="`เลือก ${item.product_name}`"
                  @change="toggleSelect(item)"
                />
              </td>
              <td class="image-col">
                <button
                  v-if="item.image_url"
                  type="button"
                  class="item-thumb-btn"
                  @click="openImagePreview(item)"
                  :aria-label="`ดูรูป ${item.product_name}`"
                >
                  <img
                    :src="item.image_url"
                    :alt="item.product_name"
                    class="item-thumb"
                    loading="lazy"
                  />
                </button>
                <div v-else class="item-thumb item-thumb--placeholder">🐾</div>
              </td>
              <td class="product-name">{{ item.product_name }}</td>
              <td class="flavor">{{ item.flavor || '—' }}</td>
              <td class="num">฿{{ Number(item.unit_price).toLocaleString() }}</td>
              <td class="num">{{ item.ordered_qty }}</td>
              <td class="num">{{ item.received_qty }}</td>
              <td class="num" style="color: #ef4444; font-weight: 600">{{ item.missing_qty }}</td>
              <td class="num" style="color: #ef4444">฿{{ item.refund_amount.toLocaleString() }}</td>
              <td>
                <span :class="['status-badge', refundStatusClass(item)]">
                  {{ refundStatusLabel(item) }}
                </span>
              </td>
              <td>
                <div class="missing-receive-control">
                  <input
                    v-model.number="missingReceiveDraft[item.detail_id]"
                    type="number"
                    min="1"
                    :max="item.missing_qty"
                    :disabled="isItemActionPending(item) || isRefundPaid(item)"
                    :placeholder="`สูงสุด ${item.missing_qty}`"
                  />
                  <button
                    type="button"
                    class="delay-btn"
                    :disabled="isItemActionPending(item) || isRefundPaid(item) || Number(missingReceiveDraft[item.detail_id] || 0) <= 0"
                    @click="handleMissingReceive(item)"
                  >
                    รับเข้า
                  </button>
                </div>
              </td>
              <td>
                <div class="action-buttons">
                  <button
                    v-if="!isDelayed(item) && !isRefundRequested(item)"
                    class="delay-btn"
                    type="button"
                    :disabled="isItemActionPending(item) || Number(item.missing_qty) <= 0"
                    @click="handleDelayAction(item)"
                  >
                    เลื่อนรอของ
                  </button>
                  <button
                    v-if="!isRefundPaid(item)"
                    class="refund-btn"
                    type="button"
                    :disabled="isItemActionPending(item) || !canPerformRefundAction(item)"
                    @click="handleRefundAction(item)"
                  >
                    {{ isRefundRequested(item) ? 'บันทึกว่าโอนแล้ว' : 'คืนเงิน' }}
                  </button>
                  <span v-else class="refund-completed-label">โอนแล้ว</span>
                </div>
              </td>
              <td class="customer">
                <div class="customer-name">{{ item.username }}</div>
                <small class="order-id">คำสั่ง #{{ String(item.order_id).padStart(3, '0') }}</small>
                <small v-if="isRefundOrderItem(item)" class="order-id refund-tag">
                  ออเดอร์คืนเงิน (แยกจาก #{{ String(item.parent_order_id).padStart(3, '0') }})
                </small>
                <small v-else-if="item.is_split_order" class="order-id split-tag">
                  ออเดอร์ตกหล่น (แยกจาก #{{ String(item.parent_order_id).padStart(3, '0') }})
                </small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Refund by Order -->
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>คืนเงินตามออเดอร์</h2>
          <p class="panel-sub">รวมรายการที่ขาดของแต่ละออเดอร์ กดครั้งเดียวเพื่อบันทึกว่าโอนเงินคืนครบทั้งออเดอร์</p>
        </div>
      </header>

      <div v-if="missingOrders.length === 0" class="empty-box">ไม่มีออเดอร์ที่ต้องคืนเงิน</div>

      <div v-else class="table-wrap">
        <table class="data-table data-table--orders">
          <thead>
            <tr>
              <th>ออเดอร์ / ลูกค้า</th>
              <th>รายการที่ขาด</th>
              <th class="num">ชิ้นที่ขาด</th>
              <th class="num">ยอดคืนทั้งหมด</th>
              <th class="num">ค้างโอน</th>
              <th>สถานะ</th>
              <th>การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in missingOrders" :key="order.order_id" class="affected-row">
              <td class="customer">
                <div class="customer-name">คำสั่ง #{{ String(order.order_id).padStart(3, '0') }}</div>
                <small class="order-id">{{ order.username || order.full_name || '—' }}</small>
                <small v-if="order.round_name" class="order-id"> · {{ order.round_name }}</small>
                <small v-if="order.split_kind === 'refund'" class="order-id refund-tag">
                  ออเดอร์คืนเงิน (แยกจาก #{{ String(order.parent_order_id).padStart(3, '0') }})
                </small>
                <small v-else-if="order.split_kind" class="order-id split-tag">
                  ออเดอร์ตกหล่น (แยกจาก #{{ String(order.parent_order_id).padStart(3, '0') }})
                </small>
              </td>
              <td>
                <ul class="order-item-list">
                  <li v-for="it in order.items" :key="it.detail_id">
                    {{ it.product_name }}<span v-if="it.flavor"> ({{ it.flavor }})</span> × {{ it.missing_qty }}
                    <span v-if="isRefundPaid(it)" class="mini-paid">โอนแล้ว</span>
                  </li>
                </ul>
              </td>
              <td class="num">{{ order.missing_qty }}</td>
              <td class="num">฿{{ order.total_refund.toLocaleString() }}</td>
              <td class="num" :style="{ color: order.pending_refund > 0 ? '#ef4444' : '#16794c', fontWeight: 600 }">
                ฿{{ order.pending_refund.toLocaleString() }}
              </td>
              <td>
                <span
                  :class="[
                    'status-badge',
                    order.pending_count > 0
                      ? 'status-refund-pending'
                      : order.delayed_count > 0
                        ? 'status-delayed'
                        : 'status-refund-paid',
                  ]"
                >
                  {{
                    order.pending_count > 0
                      ? order.paid_count > 0
                        ? `โอนแล้ว ${order.paid_count}/${order.paid_count + order.pending_count}`
                        : 'รอโอนคืน'
                      : order.delayed_count > 0
                        ? `รอของ ${order.delayed_count} รายการ`
                        : 'โอนครบแล้ว'
                  }}
                </span>
              </td>
              <td>
                <button
                  v-if="order.pending_count > 0"
                  type="button"
                  class="refund-btn"
                  :disabled="Boolean(orderRefundLoading[order.order_id])"
                  @click="handleOrderRefund(order)"
                >
                  {{ orderRefundLoading[order.order_id] ? 'กำลังบันทึก...' : `บันทึกโอนคืนทั้งออเดอร์ ฿${order.pending_refund.toLocaleString()}` }}
                </button>
                <span v-else-if="order.delayed_count > 0" class="hint-text">เลือกรายการด้านบนเพื่อคืนเงิน</span>
                <span v-else class="refund-completed-label">โอนแล้ว</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Affected Orders Summary -->
    <section class="panel">
      <header class="panel-head">
        <h2>สรุปตามรอบ</h2>
      </header>

      <div v-if="affectedRounds.length === 0" class="empty-box">ไม่มีรอบที่ได้รับผล</div>

      <div v-else class="table-wrap">
         <table class="data-table data-table--rounds">
          <thead>
            <tr>
              <th>รอบ</th>
              <th class="num">สินค้าขาด</th>
              <th class="num">ยอดคืน</th>
              <th class="num">ลูกค้าได้รับผล</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="round in affectedRounds" :key="round.round_id" class="affected-row">
              <td class="customer">
                <div class="customer-name">{{ round.round_name || `รอบ #${round.round_id}` }}</div>
                <small class="order-id">รอบ #{{ round.round_id }}</small>
              </td>
              <td class="num">{{ round.missing_count }} รายการ</td>
              <td class="num" style="color: #ef4444">฿{{ round.total_refund.toLocaleString() }}</td>
              <td class="num">{{ round.affected_orders }} คำสั่ง</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Image Preview Modal -->
    <div v-if="previewImage" class="modal-overlay" @click.self="closeImagePreview">
      <div class="image-modal-card">
        <button type="button" class="image-modal-close" @click="closeImagePreview" aria-label="ปิด">✕</button>
        <img :src="previewImage.image_url" :alt="previewImage.product_name" class="image-modal-img" />
        <p class="image-modal-caption">{{ previewImage.product_name }}<span v-if="previewImage.flavor"> · {{ previewImage.flavor }}</span></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const { getUser } = useAuth()

const currentUser = computed(() => getUser())
const rounds = ref([])
const selectedRoundId = ref('')
const loading = ref(false)
const allMissingItems = ref([])

function authHeaders() {
  const user = currentUser.value || {}
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function isRefundPaid(item) {
  return String(item?.refund_status || '').toLowerCase() === 'paid'
}

function isRefundRequested(item) {
  return String(item?.arrival_status || '').toLowerCase() === 'missing'
}

function isRefundOrderItem(item) {
  return item?.split_kind === 'refund'
}

function isDelayed(item) {
  if (isRefundOrderItem(item)) return false
  const key = String(item?.arrival_status || '').toLowerCase()
  return key === 'delayed' || (Boolean(item?.is_split_order) && key !== 'missing' && key !== 'arrived')
}

function refundStatusLabel(item) {
  if (isRefundPaid(item)) return 'โอนแล้ว'
  if (isDelayed(item)) return 'ตกหล่น · รอของ'
  if (isRefundOrderItem(item)) return 'แจ้งคืนแล้ว · รอโอน'
  return 'ยังไม่โอน'
}

function refundStatusClass(item) {
  if (isDelayed(item)) return 'status-delayed'
  return isRefundPaid(item) ? 'status-refund-paid' : 'status-refund-pending'
}

function isItemActionPending(item) {
  return Boolean(itemActionLoading.value[item.detail_id])
}

function canMarkRefundPaid(item) {
  return Boolean(
    item &&
      isRefundRequested(item) &&
      !isRefundPaid(item) &&
      Number(item.missing_qty) > 0,
  )
}

function canRequestRefund(item) {
  return Boolean(
    item &&
      !isRefundRequested(item) &&
      !isRefundPaid(item) &&
      Number(item.missing_qty) > 0,
  )
}

function canPerformRefundAction(item) {
  return isRefundRequested(item) ? canMarkRefundPaid(item) : canRequestRefund(item)
}

async function submitRefund(detailIds, status) {
  const response = await fetch(`${API_BASE_URL}/admin/refunds/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ detail_ids: detailIds, status }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || data.message || 'ไม่สามารถบันทึกรายการคืนเงินได้')
  }
  return data
}

function describeRefundResult(data, status) {
  const orderIds = (data.refund_order_ids || []).map((id) => `#${id}`).join(', ')
  const base =
    status === 'paid'
      ? `บันทึกว่าโอนเงินคืนแล้ว ${data.refunded_count} รายการ (฿${Number(data.refund_amount || 0).toLocaleString()})`
      : `แจ้งคืนเงิน ${data.refunded_count} รายการ (฿${Number(data.refund_amount || 0).toLocaleString()})`
  const skipped = (data.skipped || []).length ? ` · ข้าม ${data.skipped.length} รายการ` : ''
  return `${base}${orderIds ? ` → ออเดอร์คืนเงิน ${orderIds}` : ''}${skipped}`
}

async function handleRefundAction(item) {
  if (!item || !canPerformRefundAction(item)) return
  const status = isRefundRequested(item) ? 'paid' : 'pending'
  if (
    status === 'pending' &&
    !window.confirm(
      `คืนเงิน ${item.product_name}${item.flavor ? ` (${item.flavor})` : ''} × ${item.missing_qty} = ฿${Number(item.refund_amount || 0).toLocaleString()}\n` +
        `รายการนี้จะถูกแยกออกจากคำสั่ง #${item.order_id} ไปเป็นออเดอร์คืนเงิน`,
    )
  ) {
    return
  }
  itemActionLoading.value = { ...itemActionLoading.value, [item.detail_id]: true }
  try {
    const data = await submitRefund([item.detail_id], status)
    bulkMessage.value = describeRefundResult(data, status)
    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการบันทึกรายการคืนเงิน')
  } finally {
    itemActionLoading.value = { ...itemActionLoading.value, [item.detail_id]: false }
  }
}

async function handleDelayAction(item) {
  if (!item || isDelayed(item) || isRefundPaid(item) || Number(item.missing_qty) <= 0) return
  itemActionLoading.value = {
    ...itemActionLoading.value,
    [item.detail_id]: true,
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/inventory-intake/item/${item.detail_id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'delay' }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || data.message || 'ไม่สามารถบันทึกสถานะเลื่อนรอของได้')
    }

    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการบันทึกสถานะเลื่อนรอของ')
  } finally {
    itemActionLoading.value = {
      ...itemActionLoading.value,
      [item.detail_id]: false,
    }
  }
}

async function handleMissingReceive(item) {
  const requestedQty = Math.floor(Number(missingReceiveDraft.value[item?.detail_id]) || 0)
  if (!item || requestedQty <= 0 || requestedQty > Number(item.missing_qty || 0)) return

  itemActionLoading.value = {
    ...itemActionLoading.value,
    [item.detail_id]: true,
  }
  try {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${item.detail_id}-${requestedQty}`
    const response = await fetch(`${API_BASE_URL}/admin/inventory-intake/missing/${item.detail_id}/receive`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ incoming_qty: requestedQty, request_id: requestId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || data.message || 'ไม่สามารถรับสินค้าตกหล่นได้')
    missingReceiveDraft.value = { ...missingReceiveDraft.value, [item.detail_id]: 0 }
    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการรับสินค้าตกหล่น')
  } finally {
    itemActionLoading.value = {
      ...itemActionLoading.value,
      [item.detail_id]: false,
    }
  }
}

const missingItemsList = computed(() => {
  if (!selectedRoundId.value) return allMissingItems.value
  return allMissingItems.value.filter(
    (item) => Number(item.round_id) === Number(selectedRoundId.value),
  )
})

const itemActionLoading = ref({})
const missingReceiveDraft = ref({})
const previewImage = ref(null)

function openImagePreview(item) {
  if (!item?.image_url) return
  previewImage.value = item
}

function closeImagePreview() {
  previewImage.value = null
}

const orderRefundLoading = ref({})
const selectedDetailIds = ref([])
const bulkLoading = ref(false)
const bulkMessage = ref('')

function canSelect(item) {
  return Boolean(item) && !isRefundPaid(item) && Number(item.missing_qty) > 0
}

function isSelected(item) {
  return selectedDetailIds.value.includes(Number(item?.detail_id))
}

function toggleSelect(item) {
  if (!canSelect(item)) return
  const id = Number(item.detail_id)
  selectedDetailIds.value = isSelected(item)
    ? selectedDetailIds.value.filter((x) => x !== id)
    : [...selectedDetailIds.value, id]
}

const selectableItems = computed(() => missingItemsList.value.filter(canSelect))
const selectedItems = computed(() =>
  missingItemsList.value.filter((item) => canSelect(item) && isSelected(item)),
)
const selectedNotSplit = computed(() => selectedItems.value.filter((item) => !isRefundOrderItem(item)))
const selectedRefundTotal = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0),
)
const allSelected = computed(
  () => selectableItems.value.length > 0 && selectableItems.value.every((item) => isSelected(item)),
)

function toggleSelectAll() {
  selectedDetailIds.value = allSelected.value
    ? []
    : selectableItems.value.map((item) => Number(item.detail_id))
}

async function handleBulkRefund(status) {
  const targets = status === 'paid' ? selectedItems.value : selectedNotSplit.value
  if (targets.length === 0 || bulkLoading.value) return

  const total = targets.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0)
  const lines = targets
    .slice(0, 15)
    .map((it) => `• #${it.order_id} ${it.product_name}${it.flavor ? ` (${it.flavor})` : ''} × ${it.missing_qty}`)
    .join('\n')
  const more = targets.length > 15 ? `\n...และอีก ${targets.length - 15} รายการ` : ''
  const title =
    status === 'paid'
      ? `บันทึกว่าโอนเงินคืนแล้ว ${targets.length} รายการ`
      : `คืนเงิน ${targets.length} รายการ และแยกออกจากออเดอร์เดิมเป็นออเดอร์คืนเงิน`
  if (!window.confirm(`${title}\n\n${lines}${more}\n\nรวม ฿${total.toLocaleString()}`)) return

  bulkLoading.value = true
  bulkMessage.value = ''
  try {
    const data = await submitRefund(targets.map((item) => Number(item.detail_id)), status)
    bulkMessage.value = describeRefundResult(data, status)
    selectedDetailIds.value = []
    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการคืนเงิน')
  } finally {
    bulkLoading.value = false
  }
}

const missingOrders = computed(() => {
  const map = new Map()
  for (const item of missingItemsList.value) {
    const key = Number(item.order_id)
    if (!map.has(key)) {
      map.set(key, {
        order_id: key,
        username: item.username,
        full_name: item.full_name,
        round_name: item.round_name,
        split_kind: item.split_kind,
        parent_order_id: item.parent_order_id,
        items: [],
        missing_qty: 0,
        total_refund: 0,
        pending_refund: 0,
        pending_count: 0,
        paid_count: 0,
        delayed_count: 0,
        payable_ids: [],
      })
    }
    const order = map.get(key)
    const amount = Number(item.refund_amount || 0)
    order.items.push(item)
    order.missing_qty += Number(item.missing_qty || 0)
    order.total_refund += amount
    if (isRefundPaid(item)) {
      order.paid_count += 1
    } else if (isRefundRequested(item)) {
      // แจ้งคืนเงินแล้ว (อยู่ในออเดอร์คืนเงิน / Missing) รอบันทึกการโอน
      order.pending_count += 1
      order.pending_refund += amount
      order.payable_ids.push(Number(item.detail_id))
    } else {
      // มาช้า / ตกหล่น ยังไม่ได้ตัดสินใจคืนเงิน — ไม่รวมในปุ่มคืนเงินทั้งออเดอร์
      order.delayed_count += 1
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if ((a.pending_count > 0) !== (b.pending_count > 0)) return a.pending_count > 0 ? -1 : 1
    return b.pending_refund - a.pending_refund || b.order_id - a.order_id
  })
})

async function handleOrderRefund(order) {
  if (!order || order.pending_count === 0 || orderRefundLoading.value[order.order_id]) return
  const lines = order.items
    .filter((it) => order.payable_ids.includes(Number(it.detail_id)))
    .map((it) => `• ${it.product_name}${it.flavor ? ` (${it.flavor})` : ''} × ${it.missing_qty} = ฿${Number(it.refund_amount || 0).toLocaleString()}`)
    .join('\n')
  const ok = window.confirm(
    `ยืนยันว่าโอนเงินคืนให้ออเดอร์ #${order.order_id} (${order.username || order.full_name || 'ลูกค้า'}) แล้ว\n\n${lines}\n\nรวม ฿${order.pending_refund.toLocaleString()}`,
  )
  if (!ok) return

  orderRefundLoading.value = { ...orderRefundLoading.value, [order.order_id]: true }
  try {
    const data = await submitRefund(order.payable_ids, 'paid')
    bulkMessage.value = describeRefundResult(data, 'paid')
    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการคืนเงินทั้งออเดอร์')
  } finally {
    orderRefundLoading.value = { ...orderRefundLoading.value, [order.order_id]: false }
  }
}

const totalMissingItems = computed(() => missingItemsList.value.length)
const totalRefundAmount = computed(() =>
  missingItemsList.value.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0),
)

const affectedRounds = computed(() => {
  const roundsMap = {}
  for (const item of missingItemsList.value) {
    const roundId = item.round_id || 'unknown'
    if (!roundsMap[roundId]) {
      roundsMap[roundId] = {
        round_id: roundId,
        round_name: item.round_name || '',
        missing_count: 0,
        total_refund: 0,
        affected_orders: new Set(),
      }
    }
    roundsMap[roundId].missing_count += 1
    roundsMap[roundId].total_refund += Number(item.refund_amount || 0)
    if (item.order_id) {
      roundsMap[roundId].affected_orders.add(item.order_id)
    }
  }
  return Object.values(roundsMap)
    .map((round) => ({
      ...round,
      affected_orders: round.affected_orders.size,
    }))
    .sort((a, b) => b.total_refund - a.total_refund)
})

async function fetchData() {
  loading.value = true
  try {
    // ดึงข้อมูลรอบทั้งหมด (เฉพาะรอบที่ปิดแล้ว เพื่อทำการรับสินค้า)
    const roundsRes = await fetch(`${API_BASE_URL}/admin/inventory-intake/rounds?status=closed`, {
      headers: authHeaders(),
    })
    if (!roundsRes.ok) throw new Error('ไม่สามารถโหลดรอบพรีออเดอร์')
    const roundsData = await roundsRes.json()

    // สร้าง map ของ order_id → round_id เพื่อเร็ว
    const orderRoundMap = new Map()
    for (const round of roundsData) {
      for (const order of round.orders || []) {
        orderRoundMap.set(order.order_id, {
          round_id: round.round_id,
          round_name: round.round_name,
        })
      }
    }

    // เก็บข้อมูลรอบพร้อม missing_count
    rounds.value = roundsData.map((round) => ({
      round_id: round.round_id,
      round_name: round.round_name,
      round_status: round.round_status,
      missing_count: round.items.filter((item) => item.missing_qty > 0).length,
    }))

    // ดึงข้อมูลออเดอร์ทั้งหมด (ประกอบด้วยรายละเอียดสินค้า)
    const ordersRes = await fetch(`${API_BASE_URL}/admin/inventory-intake/orders`, {
      headers: authHeaders(),
    })
    if (!ordersRes.ok) throw new Error('ไม่สามารถโหลดข้อมูลออเดอร์')
    const ordersData = await ordersRes.json()

    // รวบรวมรายการที่ขาด จากแต่ละออเดอร์
    const missingItems = []
    for (const order of ordersData) {
      const roundInfo = orderRoundMap.get(order.order_id) || { round_id: null, round_name: '' }

      for (const item of order.items || []) {
        const missingQty = Math.max(item.ordered_qty - item.received_qty, 0)
        const arrivalStatus = item.arrival_status || 'Pending'
        const arrivalKey = String(arrivalStatus).toLowerCase()
        const isSplitOrder = Number(order.split_parent_order_id || 0) > 0
        // แสดงทั้งรายการที่ขาด (Missing) และรายการตกหล่น (Delayed / อยู่ในออเดอร์ตกหล่น)
        const isShortageItem =
          arrivalKey === 'missing' ||
          arrivalKey === 'delayed' ||
          (isSplitOrder && arrivalKey !== 'arrived')
        if (missingQty > 0 && isShortageItem) {
          missingItems.push({
            detail_id: item.detail_id,
            order_id: order.order_id,
            username: order.username,
            order_status: order.status,
            // ใช้สถานะคืนเงินของแต่ละรายการ (ไม่ใช่ของทั้งออเดอร์) เพื่อให้รายการที่โอนแล้วแสดงถูกต้อง
            refund_status: String(item.refund_status || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending',
            order_refund_status: String(order.refund_status || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending',
            full_name: order.full_name || '',
            product_name: item.product_name,
            image_url: item.image_url || '',
            flavor: item.flavor,
            unit_price: item.unit_price,
            ordered_qty: item.ordered_qty,
            received_qty: item.received_qty,
            missing_qty: missingQty,
            arrival_status: arrivalStatus,
            intake_confirmed: Boolean(item.intake_confirmed),
            is_split_order: isSplitOrder,
            split_kind: isSplitOrder ? order.split_kind || 'delayed' : null,
            parent_order_id: isSplitOrder ? Number(order.split_parent_order_id) : null,
            refund_amount: missingQty * Number(item.unit_price || 0),
            round_id: roundInfo.round_id,
            round_name: roundInfo.round_name,
          })
        }
      }
    }

    allMissingItems.value = missingItems.sort((a, b) => b.refund_amount - a.refund_amount)
    const stillSelectable = new Set(
      missingItems.filter((item) => canSelect(item)).map((item) => Number(item.detail_id)),
    )
    selectedDetailIds.value = selectedDetailIds.value.filter((id) => stillSelectable.has(id))
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function handleInventoryIntakeUpdated() {
  fetchData()
}

function handleKeydown(e) {
  if (e.key === 'Escape') closeImagePreview()
}

onMounted(() => {
  fetchData()
  window.addEventListener('meowverse:inventory-intake-updated', handleInventoryIntakeUpdated)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('meowverse:inventory-intake-updated', handleInventoryIntakeUpdated)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.missing-items-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
}
.missing-receive-control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 150px;
}
.missing-receive-control input {
  width: 62px;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  padding: 0.35rem;
}

.hero-panel {
  background: linear-gradient(135deg, #f8f4ff 0%, #fef5f5 100%);
  border-radius: 16px;
  padding: 2rem;
  border: 1px solid #e9e0f5;
}

.hero-copy p:first-child {
  color: #9a7dbf;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 0.5rem 0;
}

.hero-copy h1 {
  color: #3f2f5d;
  font-size: 1.85rem;
  font-weight: 900;
  margin: 0;
  line-height: 1.2;
}

.hero-copy p:last-child {
  color: #75658f;
  font-size: 0.95rem;
  margin: 0.5rem 0 0 0;
}

.panel {
  background: white;
  border: 1px solid #ede9f8;
  border-radius: 14px;
  padding: 1.5rem;
}

.filter-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-group {
  flex: 1;
  min-width: 200px;
}

.filter-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64557d;
  margin-bottom: 0.4rem;
}

.filter-group select {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #d8c4f0;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #2d2d3d;
  background: white;
}

.ghost-btn {
  padding: 0.6rem 1.2rem;
  border: 1px solid #d8c4f0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: #6f5095;
  transition: all 0.2s;
}

.ghost-btn:hover:not(:disabled) {
  background: #f7efff;
}

.ghost-btn:disabled {
  opacity: 0.5;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: white;
  border: 1px solid #ede9f8;
  border-radius: 12px;
  padding: 1.25rem;
  text-align: center;
}

.kpi-label {
  font-size: 0.85rem;
  color: #8b7ba8;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 900;
  color: #3f2f5d;
  margin: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.panel-head h2 {
  margin: 0;
  color: #3f2f5d;
  font-size: 1.2rem;
  font-weight: 700;
}

.state-box,
.empty-box {
  padding: 2rem;
  text-align: center;
  color: #8b7ba8;
  background: #f8f6fc;
  border-radius: 12px;
  border: 1px dashed #d8c4f0;
}

.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.data-table thead {
  background: #f8f6fc;
  border-bottom: 2px solid #e9e0f5;
}

.data-table th {
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #64557d;
}

.data-table th.num {
  text-align: right;
}

.data-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #ede9f8;
  color: #2d2d3d;
}

.data-table td.num {
  text-align: right;
  font-weight: 600;
}

.product-name {
  font-weight: 600;
  color: #3f2f5d;
}

.image-col {
  width: 60px;
}

.item-thumb-btn {
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  display: block;
  line-height: 0;
  border-radius: 12px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.item-thumb-btn:hover,
.item-thumb-btn:focus-visible {
  transform: scale(1.05);
  box-shadow: 0 4px 14px rgba(84, 54, 113, 0.25);
  outline: none;
}

.item-thumb {
  width: 44px;
  height: 44px;
  max-width: 44px;
  max-height: 44px;
  border-radius: 12px;
  object-fit: cover;
  display: block;
  background: #f5efff;
  flex-shrink: 0;
}

.item-thumb--placeholder {
  display: grid;
  place-items: center;
  font-size: 1.05rem;
}

/* ── Image preview modal ── */
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
  z-index: 1;
}

.image-modal-close:hover {
  background: #f8f4ff;
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

.flavor {
  color: #8b7ba8;
  font-size: 0.85rem;
}

.customer {
  min-width: 150px;
}

.customer-name {
  font-weight: 600;
  color: #3f2f5d;
}

.order-id {
  color: #8b7ba8;
  display: block;
}

.missing-row {
  background: #fff9f5;
}

.missing-row:hover {
  background: #fef3ed;
}

.affected-row:hover {
  background: #f8f6fc;
}

.status-badge {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-missing,
.status-partially_received {
  background: #fecaca;
  color: #8f3131;
}

.status-delayed {
  background: #fde68a;
  color: #92400e;
}

.status-ready_to_ship {
  background: #d1fae5;
  color: #065f46;
}

.status-paid {
  background: #dbeafe;
  color: #1e40af;
}

.status-refund-pending {
  background: #fff7ed;
  color: #9a3412;
}

.status-refund-paid {
  background: #d1fae5;
  color: #065f46;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.secondary-btn,
.refund-btn {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.secondary-btn {
  background: #f8fafc;
  color: #1f2937;
  border-color: #e2e8f0;
}

.secondary-btn:hover:not(:disabled) {
  background: #eef2ff;
}

.refund-btn {
  width: 100%;
  border: 1px solid #f5b4c9;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  background: #fff1f5;
  color: #be185d;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.delay-btn {
  width: 100%;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  background: #fff7ed;
  color: #c2410c;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.delay-btn:hover:not(:disabled) {
  background: #ffedd5;
}

.refund-btn:hover:not(:disabled) {
  background: #fce7f3;
}

.panel-sub {
  margin: 0.25rem 0 0;
  color: #8d7cad;
  font-size: 0.82rem;
}

.order-item-list {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.85rem;
  color: #4b3d66;
}

.order-item-list li + li {
  margin-top: 0.15rem;
}

.check-col {
  width: 36px;
  text-align: center;
}

.row-check {
  width: 18px;
  height: 18px;
  accent-color: #e5484d;
  cursor: pointer;
}

.row-check:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.missing-row--selected {
  background: #fff3f6;
}

.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
  padding: 0.7rem 0.9rem;
  border-radius: 14px;
  border: 1px dashed rgba(165, 94, 234, 0.35);
  background: #fbf8ff;
  color: #6b5a84;
  font-size: 0.88rem;
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

.paid-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font-weight: 700;
  cursor: pointer;
  color: #fff;
  background: #16794c;
}

.paid-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bulk-message {
  margin: 0 0 0.9rem;
  padding: 0.55rem 0.8rem;
  border-radius: 12px;
  background: #ecfdf3;
  color: #16794c;
  font-weight: 600;
  font-size: 0.88rem;
}

.hint-text {
  color: #8d7cad;
  font-size: 0.8rem;
}

.refund-tag {
  display: block;
  color: #b42318;
  font-weight: 600;
}

.split-tag {
  display: block;
  color: #c2410c;
  font-weight: 600;
}

.mini-paid {
  margin-left: 0.35rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: #e2f8eb;
  color: #16794c;
  font-size: 0.72rem;
  font-weight: 700;
}

.refund-completed-label {
  display: inline-block;
  width: 100%;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  background: #d1fae5;
  color: #065f46;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
}

.secondary-btn:disabled,
.refund-btn:disabled,
.delay-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-ready_to_ship {
  background: #d1fae5;
  color: #065f46;
}

.status-paid {
  background: #dbeafe;
  color: #1e40af;
}

/* ── Responsive (page had no @media at all) ── */
@media (max-width: 720px) {
  .missing-items-page {
    padding: 1rem;
    gap: 1rem;
  }
  .hero-panel {
    padding: 1.25rem;
  }
  .hero-copy h1 {
    font-size: 1.4rem;
  }
  .panel {
    padding: 1rem;
  }
  .panel-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .ghost-btn {
    width: 100%;
  }
  .action-buttons {
    flex-direction: column;
  }
  .image-modal-card {
    width: 100%;
    padding: 0.9rem;
  }
}

@media (max-width: 720px) {
  .table-wrap {
    overflow: visible;
  }

  .data-table,
  .data-table thead,
  .data-table tbody,
  .data-table tr,
  .data-table td {
    display: block;
    width: 100%;
  }

  .data-table thead {
    display: none;
  }

  .data-table tr {
    margin-bottom: 0.8rem;
    padding: 0.8rem;
    border: 1px solid #eadcf6;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(84, 54, 113, 0.06);
  }

  .data-table td {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.42rem 0;
    border: 0;
    text-align: right;
  }

  .data-table td::before {
    flex: 0 0 auto;
    color: #8a789f;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
  }

  .data-table--items td:nth-child(1) { display: block; }
  .data-table--items td:nth-child(1)::before { display: none; }
  .data-table--items td:nth-child(2)::before { content: 'สินค้า / รอบ'; }
  .data-table--items td:nth-child(3)::before { content: 'รสชาติ'; }
  .data-table--items td:nth-child(4)::before { content: 'ราคา/ชิ้น'; }
  .data-table--items td:nth-child(5)::before { content: 'สั่ง'; }
  .data-table--items td:nth-child(6)::before { content: 'รับจริง'; }
  .data-table--items td:nth-child(7)::before { content: 'ขาด'; }
  .data-table--items td:nth-child(8)::before { content: 'ยอดคืน'; }
  .data-table--items td:nth-child(9)::before { content: 'สถานะคืนเงิน'; }
  .data-table--items td:nth-child(10)::before { content: 'จัดการ'; }
  .data-table--items td:nth-child(11)::before { content: 'ลูกค้า'; }

  .data-table--rounds td:nth-child(1)::before { content: 'รอบ'; }
  .data-table--rounds td:nth-child(2)::before { content: 'สินค้าขาด'; }
  .data-table--rounds td:nth-child(3)::before { content: 'ยอดคืน'; }
  .data-table--rounds td:nth-child(4)::before { content: 'ออเดอร์ที่ได้รับผล'; }

  .data-table td:last-child {
    display: block;
    padding-top: 0.7rem;
  }

  .data-table td:last-child::before {
    display: none;
  }

  .data-table .action-buttons {
    display: grid;
    gap: 0.45rem;
  }

  .data-table .action-buttons button {
    width: 100%;
  }

  .data-table--items td:nth-child(10) {
    display: block;
    padding-top: 0.7rem;
  }

  .data-table--items td:nth-child(10)::before {
    display: none;
  }

  .data-table--items td:nth-child(11) {
    display: flex;
  }

  .data-table--items td:nth-child(11)::before,
  .data-table--rounds td:last-child::before {
    display: block;
  }

  .data-table--rounds td:last-child {
    display: flex;
    padding-top: 0.42rem;
  }
}
@media (max-width: 720px) {
  .data-table { min-width: 0; table-layout: fixed; }
  .data-table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .data-table td::before { max-width: 40%; }
  .data-table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
  .data-table td:last-child > *, .data-table .action-buttons, .data-table .action-buttons button { max-width: 100%; }
}
</style>
