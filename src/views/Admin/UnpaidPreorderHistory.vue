<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminPageHeader from '../../components/AdminPageHeader.vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'
const report = ref({ summary: {}, rounds: [], orders: [], pagination: {} })
const loading = ref(false)
const savingNote = ref(false)
const error = ref('')
const notice = ref('')
const search = ref('')
const roundId = ref('')
const fromDate = ref('')
const toDate = ref('')
const repeatOnly = ref(false)
const page = ref(1)
const pageSize = 20
const selectedOrder = ref(null)
const noteDraft = ref('')

const orders = computed(() => report.value.orders || [])
const summary = computed(() => report.value.summary || {})
const pagination = computed(() => report.value.pagination || {})
const pageCount = computed(() => Math.max(1, Number(pagination.value.pageCount) || 1))

function authHeaders() {
  const rawUser = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  const user = (() => {
    try {
      return rawUser ? JSON.parse(rawUser) : {}
    } catch {
      return {}
    }
  })()
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function formatDate(value, includeTime = false) {
  if (!value) return '-'
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

async function loadHistory() {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) })
    if (search.value.trim()) params.set('search', search.value.trim())
    if (roundId.value) params.set('roundId', roundId.value)
    if (fromDate.value) params.set('fromDate', fromDate.value)
    if (toDate.value) params.set('toDate', toDate.value)
    if (repeatOnly.value) params.set('repeatOnly', 'true')
    const response = await fetch(`${API_BASE_URL}/admin/unpaid-preorder-history?${params}`, {
      headers: authHeaders(),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || body.error || 'โหลดประวัติไม่สำเร็จ')
    report.value = body
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadHistory()
}

function clearFilters() {
  search.value = ''
  roundId.value = ''
  fromDate.value = ''
  toDate.value = ''
  repeatOnly.value = false
  page.value = 1
  loadHistory()
}

async function openDetails(row) {
  error.value = ''
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/unpaid-preorder-history/${row.history_id}`,
      { headers: authHeaders() },
    )
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || 'โหลดรายละเอียดไม่สำเร็จ')
    selectedOrder.value = body.order
    noteDraft.value = body.order.admin_note || ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'โหลดรายละเอียดไม่สำเร็จ'
  }
}

function closeDetails() {
  selectedOrder.value = null
  noteDraft.value = ''
}

async function saveNote() {
  if (!selectedOrder.value) return
  savingNote.value = true
  error.value = ''
  notice.value = ''
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/unpaid-preorder-history/${selectedOrder.value.history_id}/note`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ admin_note: noteDraft.value }),
      },
    )
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || 'บันทึกหมายเหตุไม่สำเร็จ')
    selectedOrder.value.admin_note = body.admin_note
    notice.value = 'บันทึกหมายเหตุแล้ว'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'บันทึกหมายเหตุไม่สำเร็จ'
  } finally {
    savingNote.value = false
  }
}

function goToPage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  loadHistory()
}

onMounted(loadHistory)
</script>

<template>
  <div class="unpaid-history-page">
    <AdminPageHeader
      title="ประวัติออเดอร์ไม่ชำระเงิน"
      subtitle="รายการพรีออเดอร์ที่หมดกำหนดชำระและถูกเก็บไว้ให้แอดมินตรวจสอบ"
    />

    <div class="history-notice">
      <span class="history-notice__icon" aria-hidden="true">ⓘ</span>
      ยอดเงินในหน้านี้เป็นข้อมูลประวัติเท่านั้น ไม่รวมในยอดขายหรือยอดจองปัจจุบัน
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span class="summary-card__label">ออเดอร์ไม่ชำระทั้งหมด</span>
        <strong>{{ Number(summary.order_count || 0).toLocaleString('th-TH') }}</strong>
        <span class="summary-card__icon">▤</span>
      </article>
      <article class="summary-card summary-card--pink">
        <span class="summary-card__label">ยอดเงินที่ไม่ได้รับชำระ</span>
        <strong>{{ formatMoney(summary.unpaid_total) }}</strong>
        <span class="summary-card__icon">฿</span>
      </article>
      <article class="summary-card summary-card--lavender">
        <span class="summary-card__label">ลูกค้าที่มีประวัติ</span>
        <strong>{{ Number(summary.customer_count || 0).toLocaleString('th-TH') }}</strong>
        <span class="summary-card__icon">♙</span>
      </article>
    </div>

    <section class="history-panel">
      <div class="panel-heading">
        <div>
          <h2>รายการออเดอร์</h2>
          <p>แสดงข้อมูลสินค้าและราคาตาม Snapshot ณ วันที่สั่งซื้อ</p>
        </div>
        <span class="result-count">{{ Number(pagination.total || 0).toLocaleString('th-TH') }} รายการ</span>
      </div>

      <form class="filters" @submit.prevent="applyFilters">
        <label class="search-field">
          <span>ค้นหาลูกค้าหรือออเดอร์</span>
          <input
            v-model="search"
            type="search"
            placeholder="ชื่อ, รหัสลูกค้า หรือรหัสออเดอร์"
          />
        </label>
        <label>
          <span>รอบพรีออเดอร์</span>
          <select v-model="roundId">
            <option value="">ทุกรอบ</option>
            <option v-for="round in report.rounds" :key="round.round_id" :value="String(round.round_id)">
              {{ round.round_name }}
            </option>
          </select>
        </label>
        <label>
          <span>หมดกำหนดตั้งแต่</span>
          <input v-model="fromDate" type="date" />
        </label>
        <label>
          <span>ถึงวันที่</span>
          <input v-model="toDate" type="date" />
        </label>
        <label class="repeat-filter">
          <input v-model="repeatOnly" type="checkbox" />
          <span>ลูกค้าที่ไม่ชำระซ้ำ</span>
        </label>
        <div class="filter-actions">
          <button class="button button--primary" type="submit">ค้นหา</button>
          <button class="button button--plain" type="button" @click="clearFilters">ล้างตัวกรอง</button>
        </div>
      </form>

      <p v-if="error" class="feedback feedback--error" role="alert">{{ error }}</p>
      <p v-if="notice" class="feedback feedback--success" role="status">{{ notice }}</p>

      <div v-if="loading" class="empty-state">กำลังโหลดประวัติ…</div>
      <div v-else-if="orders.length === 0" class="empty-state">
        <span aria-hidden="true">🐾</span>
        <strong>ยังไม่พบประวัติออเดอร์</strong>
        <span>รายการที่หมดกำหนดชำระจะแสดงที่นี่โดยอัตโนมัติ</span>
      </div>
      <template v-else>
        <div class="desktop-table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>ออเดอร์ / ลูกค้า</th>
                <th>รอบพรีออเดอร์</th>
                <th>สินค้า</th>
                <th>ยอดเงิน</th>
                <th>หมดกำหนดชำระ</th>
                <th>สถานะ</th>
                <th><span class="sr-only">รายละเอียด</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.history_id">
                <td>
                  <strong class="order-number">#{{ order.original_order_id }}</strong>
                  <span>{{ order.customer_name || 'ไม่ทราบชื่อ' }}</span>
                  <small>รหัสลูกค้า {{ order.user_id ?? '-' }} · ไม่ชำระ {{ order.customer_unpaid_count }} ครั้ง</small>
                </td>
                <td>{{ order.preorder_round_name || '-' }}</td>
                <td class="items-cell">
                  <span v-for="(item, index) in order.items.slice(0, 2)" :key="index">
                    {{ item.product_name }}<template v-if="item.flavor"> · {{ item.flavor }}</template> ×{{ item.quantity }}
                  </span>
                  <small v-if="order.items.length > 2">และอีก {{ order.items.length - 2 }} รายการ</small>
                </td>
                <td class="amount-cell">{{ formatMoney(order.total_amount) }}</td>
                <td>{{ formatDate(order.payment_deadline, true) }}</td>
                <td><span class="status-pill">ไม่ชำระเงิน</span></td>
                <td><button class="details-button" type="button" @click="openDetails(order)">ดูรายละเอียด</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mobile-cards">
          <article v-for="order in orders" :key="order.history_id" class="mobile-order-card">
            <div class="mobile-order-card__top">
              <strong>#{{ order.original_order_id }}</strong>
              <span class="status-pill">ไม่ชำระเงิน</span>
            </div>
            <div class="mobile-order-card__customer">{{ order.customer_name || 'ไม่ทราบชื่อ' }}</div>
            <small>รหัสลูกค้า {{ order.user_id ?? '-' }} · ไม่ชำระ {{ order.customer_unpaid_count }} ครั้ง</small>
            <p>{{ order.preorder_round_name || 'ไม่พบข้อมูลรอบ' }}</p>
            <p v-for="(item, index) in order.items" :key="index" class="mobile-item">
              {{ item.product_name }}<template v-if="item.flavor"> · {{ item.flavor }}</template> ×{{ item.quantity }}
            </p>
            <div class="mobile-order-card__bottom">
              <span>{{ formatMoney(order.total_amount) }}</span>
              <button class="details-button" type="button" @click="openDetails(order)">ดูรายละเอียด</button>
            </div>
          </article>
        </div>

        <div class="pagination">
          <span>หน้า {{ pagination.page || page }} จาก {{ pageCount }}</span>
          <div>
            <button class="button button--plain" type="button" :disabled="page <= 1" @click="goToPage(page - 1)">ก่อนหน้า</button>
            <button class="button button--plain" type="button" :disabled="page >= pageCount" @click="goToPage(page + 1)">ถัดไป</button>
          </div>
        </div>
      </template>
    </section>

    <div v-if="selectedOrder" class="modal-backdrop" @click.self="closeDetails" @keydown.esc="closeDetails">
      <section class="details-modal" role="dialog" aria-modal="true" :aria-label="`รายละเอียดออเดอร์ ${selectedOrder.original_order_id}`">
        <header class="details-modal__header">
          <div>
            <span class="eyebrow">ประวัติออเดอร์ไม่ชำระเงิน</span>
            <h2>ออเดอร์ #{{ selectedOrder.original_order_id }}</h2>
          </div>
          <button class="close-button" type="button" aria-label="ปิด" @click="closeDetails">×</button>
        </header>
        <div class="details-modal__body">
          <div class="detail-grid">
            <div><span>ลูกค้า</span><strong>{{ selectedOrder.customer_name || '-' }}</strong></div>
            <div><span>รหัสลูกค้า</span><strong>{{ selectedOrder.user_id ?? '-' }}</strong></div>
            <div><span>ชื่อบัญชี</span><strong>{{ selectedOrder.customer_username || '-' }}</strong></div>
            <div><span>รอบพรีออเดอร์</span><strong>{{ selectedOrder.preorder_round_name || '-' }}</strong></div>
            <div><span>วันที่สั่งซื้อ</span><strong>{{ formatDate(selectedOrder.order_date, true) }}</strong></div>
            <div><span>ครบกำหนดชำระ</span><strong>{{ formatDate(selectedOrder.payment_deadline, true) }}</strong></div>
            <div><span>เก็บเข้าประวัติ</span><strong>{{ formatDate(selectedOrder.archived_at, true) }}</strong></div>
            <div><span>ไม่ชำระทั้งหมด</span><strong>{{ selectedOrder.customer_unpaid_count }} ครั้ง</strong></div>
          </div>
          <h3>รายการสินค้า</h3>
          <div class="detail-items">
            <div v-for="(item, index) in selectedOrder.items" :key="index" class="detail-item">
              <div>
                <strong>{{ item.product_name }}</strong>
                <span>รหัสสินค้า {{ item.prod_id ?? '-' }}<template v-if="item.flavor"> · รส {{ item.flavor }}</template></span>
              </div>
              <div class="detail-item__price">
                <span>{{ item.quantity }} × {{ formatMoney(item.unit_price) }}</span>
                <strong>{{ formatMoney(item.line_total) }}</strong>
              </div>
            </div>
          </div>
          <div class="total-row"><span>ยอดรวมออเดอร์</span><strong>{{ formatMoney(selectedOrder.total_amount) }}</strong></div>
          <label class="note-field">
            <span>หมายเหตุแอดมิน <small>(เห็นเฉพาะแอดมิน)</small></span>
            <textarea v-model="noteDraft" rows="4" maxlength="5000" placeholder="เพิ่มบันทึกสำหรับทีมแอดมิน"></textarea>
          </label>
        </div>
        <footer class="details-modal__footer">
          <span v-if="error" class="modal-error">{{ error }}</span>
          <button class="button button--plain" type="button" @click="closeDetails">ปิด</button>
          <button class="button button--primary" type="button" :disabled="savingNote" @click="saveNote">
            {{ savingNote ? 'กำลังบันทึก…' : 'บันทึกหมายเหตุ' }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.unpaid-history-page { color: #332b3c; padding: 0 0.6rem 2.5rem; margin-top: 1rem; }
.history-notice { display:flex; align-items:center; gap:.65rem; padding:.85rem 1rem; margin:1rem 0 1.1rem; border:1px solid #eadcf7; border-radius:14px; background:#faf6ff; color:#655276; font-size:.9rem; }
.history-notice__icon { display:grid; place-items:center; width:24px; height:24px; flex:none; border-radius:50%; background:#eee2fa; color:#8759b1; font-weight:700; }
.summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; margin-bottom:1.2rem; }
.summary-card { position:relative; display:flex; flex-direction:column; gap:.55rem; min-height:116px; padding:1.1rem 1.2rem; overflow:hidden; border:1px solid #eee6f3; border-radius:18px; background:linear-gradient(135deg,#fff,#fbf8ff); box-shadow:0 8px 24px #46315b0a; }
.summary-card--pink { background:linear-gradient(135deg,#fff,#fff6f8); border-color:#f5e1e8; }
.summary-card--lavender { background:linear-gradient(135deg,#fff,#f5f2ff); border-color:#e9e3f7; }
.summary-card__label { color:#776e80; font-size:.86rem; }
.summary-card strong { font-size:1.55rem; letter-spacing:-.02em; }
.summary-card__icon { position:absolute; right:1rem; top:.7rem; color:#c6a7df; font-size:2rem; opacity:.75; }
.history-panel { padding:1.25rem; border:1px solid #eee7f2; border-radius:20px; background:#fff; box-shadow:0 10px 30px #39244d0a; }
.panel-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.1rem; }
.panel-heading h2 { margin:0; font-size:1.16rem; }
.panel-heading p { margin:.25rem 0 0; color:#8a8190; font-size:.84rem; }
.result-count { color:#81768b; font-size:.84rem; white-space:nowrap; }
.filters { display:grid; grid-template-columns:minmax(220px,2fr) repeat(3,minmax(130px,1fr)) auto auto; gap:.75rem; align-items:end; padding:1rem; margin-bottom:1.2rem; border-radius:14px; background:#faf8fc; }
.filters label { display:grid; gap:.4rem; min-width:0; }
.filters label > span { color:#6e6477; font-size:.78rem; font-weight:600; }
.filters input:not([type=checkbox]), .filters select, .note-field textarea { width:100%; min-height:42px; box-sizing:border-box; padding:.65rem .75rem; border:1px solid #e6dfea; border-radius:10px; background:#fff; color:#332b3c; font:inherit; outline:none; }
.filters input:focus, .filters select:focus, .note-field textarea:focus { border-color:#b987d8; box-shadow:0 0 0 3px #b987d822; }
.repeat-filter { display:flex !important; flex-direction:row; align-items:center; align-self:center; gap:.5rem !important; padding-top:1.2rem; white-space:nowrap; }
.repeat-filter input { accent-color:#9b6ac0; width:17px; height:17px; }
.repeat-filter span { font-size:.82rem !important; }
.filter-actions { display:flex; gap:.45rem; }
.button { display:inline-flex; align-items:center; justify-content:center; min-height:40px; padding:.55rem .85rem; border:1px solid transparent; border-radius:10px; cursor:pointer; font:inherit; font-size:.85rem; font-weight:650; white-space:nowrap; }
.button:disabled { opacity:.45; cursor:not-allowed; }
.button--primary { background:#9467b8; color:#fff; box-shadow:0 4px 10px #9467b82a; }
.button--primary:hover:not(:disabled) { background:#8055a4; }
.button--plain { border-color:#e7dfea; background:#fff; color:#665a70; }
.button--plain:hover:not(:disabled) { background:#f8f4fb; }
.feedback { padding:.65rem .8rem; border-radius:9px; font-size:.88rem; }
.feedback--error { background:#fff0f0; color:#a23b3b; }
.feedback--success { background:#effaf4; color:#35724a; }
.empty-state { display:flex; min-height:190px; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; color:#8d8295; text-align:center; }
.empty-state > span:first-child { font-size:2rem; }
.empty-state strong { color:#554a60; }
.desktop-table-wrap { overflow-x:auto; }
.history-table { width:100%; border-collapse:collapse; text-align:left; font-size:.83rem; }
.history-table th { padding:.75rem .65rem; color:#8a8091; font-size:.74rem; font-weight:650; white-space:nowrap; border-bottom:1px solid #eee8f0; }
.history-table td { padding:.85rem .65rem; vertical-align:top; border-bottom:1px solid #f1edf3; }
.history-table tbody tr:hover { background:#fcf9ff; }
.history-table td:first-child { min-width:175px; }
.history-table td:first-child > * { display:block; }
.order-number { color:#79519a; margin-bottom:.2rem; }
.history-table small, .items-cell small { display:block; margin-top:.25rem; color:#948a9c; font-size:.72rem; }
.items-cell { min-width:180px; max-width:260px; }
.items-cell > span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.amount-cell { font-weight:700; white-space:nowrap; }
.status-pill { display:inline-flex; padding:.3rem .55rem; border:1px solid #f4d7dd; border-radius:99px; background:#fff4f5; color:#a34e5a; font-size:.74rem; white-space:nowrap; }
.details-button { padding:.35rem .55rem; border:0; border-radius:8px; background:#f4edf9; color:#79539a; cursor:pointer; font:inherit; font-size:.77rem; font-weight:650; white-space:nowrap; }
.details-button:hover { background:#eadcf5; }
.mobile-cards { display:none; }
.pagination { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding-top:1rem; color:#81768b; font-size:.83rem; }
.pagination > div { display:flex; gap:.5rem; }
.modal-backdrop { position:fixed; z-index:1000; inset:0; display:grid; place-items:center; padding:1rem; background:#20182b88; backdrop-filter:blur(3px); }
.details-modal { display:flex; width:min(720px,100%); max-height:min(90vh,900px); flex-direction:column; overflow:hidden; border:1px solid #eee5f2; border-radius:20px; background:#fff; box-shadow:0 24px 80px #1d122c44; }
.details-modal__header { display:flex; justify-content:space-between; align-items:flex-start; padding:1.2rem 1.35rem; border-bottom:1px solid #f0eaf3; }
.details-modal__header h2 { margin:.2rem 0 0; font-size:1.25rem; }
.eyebrow { color:#9a70b9; font-size:.75rem; font-weight:700; }
.close-button { width:36px; height:36px; border:0; border-radius:50%; background:#f5f0f8; color:#675470; cursor:pointer; font-size:1.5rem; line-height:1; }
.details-modal__body { overflow:auto; padding:1.2rem 1.35rem; }
.detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem 1.2rem; padding-bottom:1.1rem; border-bottom:1px solid #f0eaf3; }
.detail-grid > div { display:grid; gap:.18rem; }
.detail-grid span, .detail-item span { color:#8c8194; font-size:.76rem; }
.detail-grid strong { font-size:.88rem; font-weight:650; overflow-wrap:anywhere; }
.details-modal h3 { margin:1rem 0 .55rem; font-size:.98rem; }
.detail-items { border:1px solid #eee8f1; border-radius:12px; overflow:hidden; }
.detail-item { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem .85rem; }
.detail-item + .detail-item { border-top:1px solid #f0ebf2; }
.detail-item > div:first-child { display:grid; gap:.2rem; }
.detail-item__price { display:grid; flex:none; gap:.2rem; justify-items:end; }
.detail-item__price strong { font-size:.88rem; }
.total-row { display:flex; justify-content:space-between; padding:1rem 0; color:#6e6277; }
.total-row strong { color:#3d3048; font-size:1.05rem; }
.note-field { display:grid; gap:.45rem; }
.note-field > span { font-size:.85rem; font-weight:650; }
.note-field small { color:#9a909f; font-weight:400; }
.note-field textarea { min-height:100px; resize:vertical; }
.details-modal__footer { display:flex; align-items:center; justify-content:flex-end; gap:.55rem; padding:1rem 1.35rem; border-top:1px solid #f0eaf3; }
.modal-error { margin-right:auto; color:#a23b3b; font-size:.82rem; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-width: 1120px) { .filters { grid-template-columns:repeat(3,minmax(140px,1fr)); } .filter-actions { grid-column:span 2; } }
@media (max-width: 760px) {
  .unpaid-history-page { padding:0 .2rem 1.5rem; }
  .summary-grid { grid-template-columns:1fr; gap:.65rem; }
  .summary-card { min-height:auto; padding:.85rem 1rem; }
  .summary-card strong { font-size:1.25rem; }
  .history-panel { padding:.9rem; border-radius:16px; }
  .panel-heading { align-items:flex-start; }
  .panel-heading h2 { font-size:1.05rem; }
  .filters { grid-template-columns:repeat(2,minmax(0,1fr)); padding:.75rem; gap:.65rem; }
  .search-field { grid-column:span 2; }
  .repeat-filter { padding-top:.3rem; }
  .filter-actions { grid-column:span 2; }
  .filter-actions .button { flex:1; }
  .desktop-table-wrap { display:none; }
  .mobile-cards { display:grid; gap:.7rem; }
  .mobile-order-card { padding:.9rem; border:1px solid #eee7f1; border-radius:13px; }
  .mobile-order-card__top, .mobile-order-card__bottom { display:flex; justify-content:space-between; align-items:center; gap:.6rem; }
  .mobile-order-card__top strong { color:#79519a; }
  .mobile-order-card__customer { margin-top:.55rem; font-weight:700; }
  .mobile-order-card small { color:#8f8497; font-size:.75rem; }
  .mobile-order-card p { margin:.45rem 0; color:#6f6578; font-size:.83rem; }
  .mobile-order-card .mobile-item { margin:.3rem 0; color:#877b8f; }
  .mobile-order-card__bottom { margin-top:.7rem; padding-top:.65rem; border-top:1px solid #f0ebf2; }
  .mobile-order-card__bottom span { font-weight:750; }
  .pagination { align-items:flex-start; flex-direction:column; }
  .pagination > div { width:100%; }
  .pagination .button { flex:1; }
  .details-modal { max-height:94vh; border-radius:16px; }
  .details-modal__header, .details-modal__body, .details-modal__footer { padding-left:1rem; padding-right:1rem; }
  .detail-grid { gap:.75rem; }
}
</style>
