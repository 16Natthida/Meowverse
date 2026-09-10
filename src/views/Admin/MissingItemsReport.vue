<template>
  <div class="missing-items-page">
    <!-- Header -->
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin Operations</p>
        <h1>รายงานสินค้าที่ขาด / ตกหล่น</h1>
        <p>ดูรายละเอียดสินค้าที่ขาด เลือกรอบ และลูกค้าที่ได้รับผลกระทบ</p>
      </div>
    </section>

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
        <h2>รายการสินค้าที่ขาด</h2>
      </header>

      <div v-if="loading" class="state-box">กำลังโหลด...</div>
      <div v-else-if="missingItemsList.length === 0" class="empty-box">ไม่มีสินค้าที่ขาด</div>

      <div v-else class="table-wrap">
         <table class="data-table data-table--items">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>รสชาติ</th>
              <th class="num">ราคา/ชิ้น</th>
              <th class="num">รวมสั่ง</th>
              <th class="num">รับจริง</th>
              <th class="num">ขาด</th>
              <th class="num">ยอดคืน</th>
              <th>สถานะคืนเงิน</th>
              <th>การจัดการ</th>
              <th>ลูกค้า (สั่งซื้อ)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in missingItemsList"
              :key="`${item.detail_id}-${item.order_id}`"
              class="missing-row"
            >
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
                <div class="action-buttons">
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
                <small class="order-id">คำสั่ง #{{ item.order_id }}</small>
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
  </div>
</template>

<script setup>
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

function isDelayed(item) {
  return String(item?.arrival_status || '').toLowerCase() === 'delayed'
}

function refundStatusLabel(item) {
  if (isRefundPaid(item)) return 'โอนแล้ว'
  if (isDelayed(item)) return 'เลื่อนรอของ'
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

async function handleRefundAction(item) {
  if (!item || !canPerformRefundAction(item)) return
  itemActionLoading.value = {
    ...itemActionLoading.value,
    [item.detail_id]: true,
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/refunds/orders/${item.order_id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        detail_id: item.detail_id,
        status: isRefundRequested(item) ? 'paid' : 'pending',
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || data.message || 'ไม่สามารถบันทึกรายการคืนเงินได้')
    }

    await fetchData()
  } catch (error) {
    console.error(error)
    alert(error.message || 'เกิดข้อผิดพลาดในการบันทึกรายการคืนเงิน')
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
        if (missingQty > 0) {
          const arrivalStatus = item.arrival_status || 'Pending'
          missingItems.push({
            detail_id: item.detail_id,
            order_id: order.order_id,
            username: order.username,
            order_status: order.status,
            refund_status: String(order.refund_status || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending',
            product_name: item.product_name,
            flavor: item.flavor,
            unit_price: item.unit_price,
            ordered_qty: item.ordered_qty,
            received_qty: item.received_qty,
            missing_qty: missingQty,
            arrival_status: arrivalStatus,
            refund_amount: missingQty * Number(item.unit_price || 0),
            round_id: roundInfo.round_id,
            round_name: roundInfo.round_name,
          })
        }
      }
    }

    allMissingItems.value = missingItems.sort((a, b) => b.refund_amount - a.refund_amount)
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function handleInventoryIntakeUpdated() {
  fetchData()
}

onMounted(() => {
  fetchData()
  window.addEventListener('meowverse:inventory-intake-updated', handleInventoryIntakeUpdated)
})

onUnmounted(() => {
  window.removeEventListener('meowverse:inventory-intake-updated', handleInventoryIntakeUpdated)
})
</script>

<style scoped>
.missing-items-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
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

.refund-btn:hover:not(:disabled) {
  background: #fce7f3;
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
.refund-btn:disabled {
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

  .data-table td:nth-child(1)::before { content: 'สินค้า / รอบ'; }
  .data-table td:nth-child(2)::before { content: 'รสชาติ'; }
  .data-table td:nth-child(3)::before { content: 'ราคา/ชิ้น'; }
  .data-table td:nth-child(4)::before { content: 'สั่ง'; }
  .data-table td:nth-child(5)::before { content: 'รับจริง'; }
  .data-table td:nth-child(6)::before { content: 'ขาด'; }
  .data-table td:nth-child(7)::before { content: 'ยอดคืน'; }
  .data-table td:nth-child(8)::before { content: 'สถานะคืนเงิน'; }
  .data-table td:nth-child(9)::before { content: 'จัดการ'; }
  .data-table td:nth-child(10)::before { content: 'ลูกค้า'; }

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

  .data-table--items td:nth-child(9) {
    display: block;
    padding-top: 0.7rem;
  }

  .data-table--items td:nth-child(9)::before {
    display: none;
  }

  .data-table--items td:nth-child(10) {
    display: flex;
  }

  .data-table--items td:nth-child(10)::before,
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
