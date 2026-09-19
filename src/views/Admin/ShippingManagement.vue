<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { printOrder } from '../../utils/printOrder'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const orders = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const filterType = ref('all')
const providers = ref([])
const drafts = ref({})
const savingOrderId = ref(null)
const detailOrder = ref(null)
const previewImage = ref(null)

// ── ยอดรวมของออเดอร์ ให้ตรงกับหน้า "จัดการยอดขาย" โดยแยกตามประเภทออเดอร์ ──
// พรีออเดอร์: total_amount + ค่าจัดส่ง + ค่านำเข้า + ค่าส่งจากจีน
// พร้อมส่ง: total_amount เฉย ๆ (รวมค่าส่งไว้ตั้งแต่ตอนสร้างออเดอร์แล้ว)
function getOrderTotal(order) {
  const total = Number(order?.total_amount || 0)
  if (String(order?.Order_type || '').toLowerCase() !== 'preorder') return total
  return (
    total +
    Number(order?.shipping_fee || 0) +
    Number(order?.import_fee_total || 0) +
    Number(order?.china_shipping_total_thb || 0)
  )
}

// ยอดรวมเฉพาะค่าสินค้า (ไม่รวมค่าจัดส่ง/ค่านำเข้า/ค่าส่งจากจีน)
function getProductTotal(order) {
  return (order?.details || []).reduce(
    (sum, i) => sum + Number(i.unit_price || 0) * Number(i.qty || 0),
    0,
  )
}

function openOrderDetail(order) {
  detailOrder.value = order
}

function closeOrderDetail() {
  detailOrder.value = null
}

function openImagePreview(url, title, subtitle) {
  if (!url) return
  previewImage.value = { url, title, subtitle }
}

function closeImagePreview() {
  previewImage.value = null
}

function handleShippingKeydown(e) {
  if (e.key !== 'Escape') return
  if (previewImage.value) {
    closeImagePreview()
  } else if (detailOrder.value) {
    closeOrderDetail()
  }
}

function getCurrentUser() {
  const raw = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function authHeaders(extra = {}) {
  const user = getCurrentUser()
  return {
    ...extra,
    'x-user-role': String(user?.role || '').toLowerCase(),
    'x-user-id': String(user?.user_id || user?.id || ''),
  }
}

const activeProviders = computed(() =>
  providers.value.filter((provider) => Number(provider.is_active) === 1),
)

async function fetchProviders() {
  const res = await fetch(`${API_BASE}/admin/shipping-providers`, { headers: authHeaders() })
  if (!res.ok) throw new Error('โหลดรายชื่อบริษัทขนส่งไม่สำเร็จ')
  providers.value = await res.json()
}

function normalizeCarrier(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]/g, '')
}

function findProviderId(order) {
  const carrier = normalizeCarrier(order.Shipping_Carrier || order.provider_name)
  if (!carrier) return ''

  const matched = providers.value.find((provider) => {
    const names = [provider.provider_code, provider.provider_name].map(normalizeCarrier)
    return names.some((name) => name && (name === carrier || name.includes(carrier) || carrier.includes(name)))
  })
  return matched?.provider_id || ''
}

// ดึงข้อมูลออเดอร์ที่รอจัดส่งหรือจัดส่งแล้ว
async function fetchShippingOrders() {
  loading.value = true
  error.value = ''
  try {
    const [ordersRes] = await Promise.all([
      fetch(`${API_BASE}/admin/shipping-orders`, { headers: authHeaders() }),
      fetchProviders(),
    ])
    if (!ordersRes.ok) throw new Error('โหลดข้อมูลการจัดส่งไม่สำเร็จ')
    orders.value = await ordersRes.json()
    orders.value.forEach((order) => {
      drafts.value[order.order_id] = {
        provider_id: order.provider_id || findProviderId(order),
        tracking_number: order.tracking_number || '',
      }
    })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function getDraft(order) {
  if (!drafts.value[order.order_id]) {
    drafts.value[order.order_id] = {
      provider_id: order.provider_id || findProviderId(order),
      tracking_number: order.tracking_number || '',
    }
  }
  return drafts.value[order.order_id]
}

async function saveShipment(order) {
  const draft = getDraft(order)
  if (!draft.provider_id || !draft.tracking_number.trim()) {
    alert('กรุณาเลือกบริษัทขนส่งและกรอกเลขพัสดุ')
    return
  }

  savingOrderId.value = order.order_id

  try {
    const res = await fetch(`${API_BASE}/admin/orders/${order.order_id}/shipment`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        provider_id: Number(draft.provider_id),
        tracking_number: draft.tracking_number.trim(),
        shipping_status: 'shipped',
      }),
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'ไม่สามารถบันทึกข้อมูลการจัดส่งได้')

    alert('บันทึกข้อมูลการจัดส่งเรียบร้อยแล้ว')
    await fetchShippingOrders()
  } catch (err) {
    alert(err.message)
  } finally {
    savingOrderId.value = null
  }
}

function printShippingOrder(order) {
  printOrder(order)
}

function statusLabel(status) {
  const labels = {
    Paid: 'ชำระเงินแล้ว',
    Ready_to_Ship: 'พร้อมจัดส่ง',
    Shipped: 'จัดส่งแล้ว',
    Delivered: 'นำจ่ายแล้ว',
  }
  return labels[status] || status
}

// ฟังก์ชันจัดรูปแบบที่อยู่จาก SQL (แปลง \n เป็น <br>)
function formatAddress(address) {
  if (!address) return '-'
  return address.replace(/\n/g, '<br>')
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// การกรองข้อมูล
const filteredOrders = computed(() => {
  return orders.value.filter(order => {
    const matchesSearch = order.order_id.toString().includes(searchQuery.value) || 
                          (order.address && order.address.toLowerCase().includes(searchQuery.value.toLowerCase()))
    const matchesType = filterType.value === 'all' || order.Order_type === filterType.value
    return matchesSearch && matchesType
  })
})

onMounted(() => {
  fetchShippingOrders()
  window.addEventListener('keydown', handleShippingKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShippingKeydown)
})
</script>

<template>
  <div class="shipping-page">
    <AdminPageHeader title="รายการจัดส่ง" description="จัดการคำสั่งซื้อที่รอจัดส่งและข้อมูลติดตามพัสดุ" />
    <section class="panel table-panel">
      <header class="panel-head">
        <div class="panel-head__title">
          <h3>📦 รายการคำสั่งซื้อที่รอจัดส่ง</h3>
          <p>กรองตามประเภทออเดอร์เพื่อดูรายการพรีออเดอร์หรือพร้อมส่ง</p>
        </div>

        <div class="filter-panel">
          <label for="shipping-type-filter">ประเภทออเดอร์</label>
          <select id="shipping-type-filter" v-model="filterType" class="filter-select">
            <option value="all">ทั้งหมด</option>
            <option value="Preorder">พรีออเดอร์</option>
            <option value="Ready">พร้อมส่ง</option>
          </select>
        </div>
      </header>

      <div v-if="loading" class="loading-wrap">
        <div class="loader"></div>
        <p>กำลังดึงข้อมูลออเดอร์...</p>
      </div>

      <div v-else-if="filteredOrders.length === 0" class="empty-state">
        <p>ไม่มีรายการที่ต้องจัดส่งในขณะนี้</p>
      </div>

      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ออเดอร์</th>
              <th>ประเภท</th>
              <th>สถานะ</th>
              <th>ผู้รับ</th>
              <th>รายการสินค้า</th>
              <th>ข้อมูลการจัดส่ง</th>
              <th>บริษัทขนส่ง / เลขพัสดุ</th>
              <th>ยอดรวม</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filteredOrders" :key="order.order_id">
              <td>
                <strong>#{{ String(order.order_id).padStart(3, '0') }}</strong><br/>
                <small>{{ formatDate(order.Order_date) }}</small>
              </td>

              <td>
                <span :class="order.Order_type === 'Preorder' ? 'status status--pending' : 'status status--paid'">
                  {{ order.Order_type }}
                </span>
              </td>

              <td>
                <span
                  :class="[
                    'status',
                    order.status === 'Ready_to_Ship'
                      ? 'status--ready'
                      : order.status === 'Shipped'
                        ? 'status--shipped'
                        : order.status === 'Delivered'
                          ? 'status--delivered'
                          : 'status--paid',
                  ]"
                >
                  {{ statusLabel(order.status) }}
                </span>
              </td>

              <td>
                <div class="recipient-info">
                  <strong>{{ order.name || '-' }}</strong><br />
                  <span>{{ order.phone || '-' }}</span>
                </div>
              </td>

              <td>
                <ul class="item-list">
                  <li v-for="item in order.details" :key="item.detail_id">
                    • {{ item.prod_name }} ({{ item.flavor }}) 
                    <span class="item-qty">x{{ item.qty }}</span>
                  </li>
                </ul>
              </td>

              <td class="address-cell">
                <div v-html="formatAddress(order.address)" class="address-text"></div><br/>
                <div v-if="order.notes" class="notes-block">
                  <strong>หมายเหตุ:</strong>
                  <p class="notes-text">{{ order.notes }}</p>
                </div>
              </td>

              <td>
                <div class="shipment-editor">
                  <select v-model="getDraft(order).provider_id">
                    <option value="">-- เลือกบริษัทขนส่ง --</option>
                    <option
                      v-for="provider in activeProviders"
                      :key="provider.provider_id"
                      :value="provider.provider_id"
                    >
                      {{ provider.provider_name }}
                    </option>
                  </select>
                  <input
                    v-model="getDraft(order).tracking_number"
                    placeholder="เลขพัสดุ"
                  />
                </div>
              </td>

              <td class="price-text">
                ฿{{ getOrderTotal(order).toLocaleString() }}
              </td>

              <td>
                <button
                  class="btn-action btn-action--ready"
                  :disabled="savingOrderId === order.order_id"
                  @click="saveShipment(order)"
                >
                  {{ savingOrderId === order.order_id ? 'กำลังบันทึก...' : 'บันทึกและจัดส่ง' }}
                </button>
                <button
                  type="button"
                  class="btn-print-order"
                  @click="printShippingOrder(order)"
                >
                  พิมพ์ใบออเดอร์
                </button>
                <button
                  type="button"
                  class="btn-detail-order"
                  @click="openOrderDetail(order)"
                >
                  รายละเอียด
                </button>
                <small class="shipment-status">{{ statusLabel(order.status) }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Order Detail Modal -->
    <div v-if="detailOrder" class="modal-overlay" @click.self="closeOrderDetail">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <h3>ออเดอร์ #{{ String(detailOrder.order_id).padStart(3, '0') }}</h3>
            <p>
              {{ detailOrder.name || '-' }} ·
              {{ detailOrder.Order_type === 'Preorder' ? 'สินค้าพรีออเดอร์' : 'สินค้าพร้อมส่ง' }}
            </p>
          </div>
          <div class="modal-head__actions">
            <button type="button" class="print-order-btn" @click="printShippingOrder(detailOrder)">
              พิมพ์ใบออเดอร์
            </button>
            <button type="button" class="close-btn" @click="closeOrderDetail" aria-label="ปิด">✕</button>
          </div>
        </div>

        <div class="summary-strip">
          <div>
            <span>ยอดรวม</span><strong>฿{{ getOrderTotal(detailOrder).toLocaleString() }}</strong>
          </div>
          <div>
            <span>ค่าสินค้า</span><strong>฿{{ getProductTotal(detailOrder).toLocaleString() }}</strong>
          </div>
          <div>
            <span>สถานะ</span><strong>{{ statusLabel(detailOrder.status) }}</strong>
          </div>
          <div>
            <span>วันที่</span><strong>{{ formatDate(detailOrder.Order_date) }}</strong>
          </div>
          <div>
            <span>จำนวนสินค้า</span>
            <strong>{{ (detailOrder.details || []).reduce((sum, i) => sum + Number(i.qty || 0), 0) }} ชิ้น</strong>
          </div>
          <div>
            <span>ค่าจัดส่ง</span><strong>฿{{ Number(detailOrder.shipping_fee || 0).toLocaleString() }}</strong>
          </div>
          <template v-if="detailOrder.Order_type === 'Preorder'">
            <div>
              <span>ค่านำเข้า</span><strong>฿{{ Number(detailOrder.import_fee_total || 0).toLocaleString() }}</strong>
            </div>
            <div>
              <span>ค่าส่งจากจีน</span><strong>฿{{ Number(detailOrder.china_shipping_total_thb || 0).toLocaleString() }}</strong>
            </div>
          </template>
        </div>

        <div class="items-list">
          <div v-for="item in detailOrder.details" :key="item.detail_id" class="item-row">
            <div class="item-thumb-cell">
              <button
                v-if="item.image_url"
                type="button"
                class="thumb-btn"
                @click="openImagePreview(item.image_url, item.prod_name, item.flavor)"
                :aria-label="`ดูรูป ${item.prod_name}`"
              >
                <img :src="item.image_url" :alt="item.prod_name" class="item-thumb" loading="lazy" />
              </button>
              <div v-else class="item-thumb item-thumb--placeholder">ไม่มีรูป</div>
            </div>
            <div>
              <strong>{{ item.prod_name }}</strong>
              <p v-if="item.flavor">รสชาติ: {{ item.flavor }}</p>
            </div>
            <div>฿{{ Number(item.unit_price || 0).toLocaleString() }}</div>
            <div>x{{ item.qty }}</div>
            <div>
              ฿{{ (Number(item.unit_price || 0) * Number(item.qty || 0)).toLocaleString() }}
            </div>
            <div>
              <span :class="['type-chip', detailOrder.Order_type === 'Preorder' ? 'type-chip--pre' : 'type-chip--ready']">
                {{ detailOrder.Order_type === 'Preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
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
/* ดึงโทนสีและดีไซน์จาก SlipManagement.vue */
.shipping-page {
  --panel-bg: rgba(255, 255, 255, 0.88);
  --panel-border: #e8dcf3;
  --text-main: #432f61;
  --text-muted: #7a6a96;
  --pink: #ff93b8;
  --grape: #a66de6;
  display: grid;
  gap: 1.2rem;
  font-family: 'Kanit', sans-serif;
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background: radial-gradient(circle at right top, rgba(255, 147, 184, 0.2), transparent), var(--panel-bg);
}

.hero-copy h2 { color: var(--text-main); font-weight: 900; margin: 0.2rem 0; }
.hero-copy p { color: var(--text-muted); font-size: 0.95rem; }

.search-input {
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid #ddd6fe;
  width: 250px;
  margin-right: 10px;
}

.hero-btn--primary { 
  color: #fff; 
  background: linear-gradient(135deg, #b673ee, #ff93b8);
  border: none;
  padding: 0.6rem 1.5rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

.kpi-grid { display: grid; gap: 1rem; grid-template-columns: repeat(3, 1fr); }
.kpi-card { 
  border-radius: 18px; 
  border: 1px solid var(--panel-border); 
  background: var(--panel-bg); 
  padding: 1.2rem; 
  cursor: pointer;
  transition: 0.3s;
}
.kpi-card.active { border-color: var(--grape); background: #fdfaff; transform: translateY(-3px); box-shadow: 0 8px 20px rgba(166, 109, 230, 0.1); }
.kpi-label { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }
.kpi-value { font-size: 1.8rem; color: var(--text-main); font-weight: 900; }

.panel { border-radius: 20px; border: 1px solid var(--panel-border); background: var(--panel-bg); padding: 1.5rem; }
.panel-head h3 { color: var(--text-main); font-weight: 800; margin-bottom: 1rem; }

table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 1rem; color: #826ea1; font-size: 0.75rem; text-transform: uppercase; border-bottom: 2px solid #f3e8ff; }
td { padding: 1rem; border-bottom: 1px solid #f3e8ff; font-size: 0.9rem; vertical-align: top; }

.status { border-radius: 99px; padding: 0.25rem 0.8rem; font-weight: 700; font-size: 0.75rem; }
.status--pending { background: #fff7ed; color: #c2410c; }
.status--paid { background: #f0fdf4; color: #15803d; }

.item-list { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; }
.item-qty { font-weight: 800; color: var(--grape); }

.address-text { line-height: 1.5; color: #4b5563; font-size: 0.85rem; }
.carrier-badge { background: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 8px; font-weight: 600; font-size: 0.8rem; }

.price-text { font-weight: 800; color: var(--text-main); }

.btn-action {
  background: white;
  border: 1px solid var(--grape);
  color: var(--grape);
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
}
.btn-action:hover { background: var(--grape); color: white; }
.btn-action--ready {
  border-color: #10b981;
  color: #10b981;
}
/* เพิ่มต่อจาก status--paid */
.status--ready { 
  background: #ecfdf5; 
  color: #059669; 
  border: 1px solid #10b981;
}
.status--shipped {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #60a5fa;
}
.status--delivered {
  background: #f5f3ff;
  color: #109a35;
  border: 1px solid #58be36;
}


.status {
  border: 1px solid transparent;
  display: inline-block;
  white-space: nowrap;
}
.btn-action--ready:hover {
  background: #10b981;
  color: white;
}

.btn-print-order {
  margin-top: 0.45rem;
  background: #fff;
  border: 1px solid var(--grape);
  color: var(--grape);
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
}

.btn-print-order:hover {
  background: var(--grape);
  color: #fff;
}

.btn-detail-order {
  margin-top: 0.45rem;
  margin-left: 0.4rem;
  background: #fbf5ff;
  border: 1px solid #ddc9f0;
  color: #6d3fa3;
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
}

.btn-detail-order:hover {
  background: #ede0fb;
}

/* ── Order detail modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(44, 36, 64, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 60;
}

.modal-card {
  width: min(980px, calc(100vw - 2rem));
  max-height: min(88vh, 820px);
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.35rem;
  scrollbar-gutter: stable;
}

.modal-head {
  position: sticky;
  top: -1.35rem;
  z-index: 3;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin: -1.35rem -1.35rem 1.1rem;
  padding: 1.1rem 1.35rem 0.9rem;
  background: #fff;
  border-bottom: 1px solid #f0e8fb;
}

.modal-head h3 {
  margin: 0 0 0.25rem;
  color: #3c1f59;
  font-size: 1.15rem;
}

.modal-head p {
  margin: 0.25rem 0 0;
  color: #7b6992;
  font-size: 0.85rem;
}

.modal-head__actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.print-order-btn {
  padding: 0.55rem 0.85rem;
  border: 1px solid #7c5cdb;
  border-radius: 999px;
  background: #7c5cdb;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
}

.print-order-btn:hover {
  background: #6848bf;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: #f5ecff;
  color: #6f50a0;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
}

.summary-strip {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 1rem;
}

.summary-strip div {
  background: #faf7ff;
  border: 1px solid #ede4fb;
  border-radius: 14px;
  padding: 0.85rem;
}

.summary-strip span {
  display: block;
  color: #7b6992;
  font-size: 0.82rem;
}

.summary-strip strong {
  color: #432f61;
  font-size: 1.05rem;
}

.thumb-btn {
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  display: block;
  line-height: 0;
  border-radius: 10px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.thumb-btn:hover,
.thumb-btn:focus-visible {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(140, 99, 174, 0.28);
  outline: none;
}

.items-list {
  display: grid;
  gap: 0.65rem;
}

.item-row {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 56px 1.5fr 0.8fr 0.5fr 0.8fr 0.7fr;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid #ede4fb;
  border-radius: 14px;
}

.item-row p {
  margin: 0.15rem 0 0;
  color: #8b7aa3;
  font-size: 0.82rem;
}

.item-thumb-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #ede4fb;
  background: #f8f5ff;
}

.item-thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a996c9;
  font-size: 0.6rem;
  text-align: center;
  line-height: 1.15;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.type-chip--pre {
  background: #fff1dc;
  color: #b45309;
}

.type-chip--ready {
  background: #e5f8ef;
  color: #15803d;
}

/* ── Image preview modal ── */
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
  color: #6d3fa3;
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
  color: #3c1f59;
  font-weight: 600;
  font-size: 0.9rem;
}

.recipient-info {
  display: grid;
  gap: 0.25rem;
  max-width: 240px;
}
.filter-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.75rem;
}
.filter-panel label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #5f4d85;
}
.filter-select {
  border: 1px solid #e5d5f3;
  border-radius: 14px;
  padding: 0.6rem 0.9rem;
  background: #faf5ff;
  color: #432f61;
}
.shipment-editor input,
.shipment-editor select {
  min-width: 0;
  border: 1px solid #e5d5f3;
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  background: #fff;
  color: var(--text-main);
}
.shipment-editor {
  display: grid;
  gap: 0.45rem;
  min-width: 170px;
}
.shipment-status {
  display: block;
  margin-top: 0.35rem;
  color: var(--text-muted);
}
.notes-text {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: #524b6b;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.loading-wrap { text-align: center; padding: 3rem; color: var(--text-muted); }

/* ── Table horizontal scroll on small screens (was missing) ── */
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table-scroll table {
  min-width: 900px;
}

/* ── Responsive breakpoints (page had none) ── */
@media (max-width: 900px) {
  .panel {
    padding: 1rem;
  }
  .panel-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .filter-panel {
    width: 100%;
  }
  .filter-select {
    flex: 1;
    min-width: 0;
  }
  .recipient-info {
    max-width: none;
  }
}

@media (max-width: 600px) {
  .shipping-page {
    gap: 0.9rem;
  }
  .panel {
    padding: 0.85rem;
    border-radius: 14px;
  }
  th,
  td {
    padding: 0.7rem;
  }
  .shipment-editor {
    min-width: 140px;
  }
  .btn-action {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .table-scroll {
    overflow: visible;
  }

  .table-scroll > table,
  .table-scroll > table thead,
  .table-scroll > table tbody,
  .table-scroll > table tr,
  .table-scroll > table td {
    display: block;
    width: 100%;
  }

  .table-scroll > table thead {
    display: none;
  }

  .table-scroll > table tr {
    margin-bottom: 0.9rem;
    padding: 0.8rem;
    border: 1px solid #eadcf6;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(84, 54, 113, 0.06);
  }

  .table-scroll > table td {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.45rem 0;
    border: 0;
    text-align: right;
  }

  .table-scroll > table td::before {
    flex: 0 0 auto;
    color: #8a789f;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
  }

  .table-scroll > table td:nth-child(1)::before { content: 'ออเดอร์'; }
  .table-scroll > table td:nth-child(2)::before { content: 'ประเภท'; }
  .table-scroll > table td:nth-child(3)::before { content: 'สถานะ'; }
  .table-scroll > table td:nth-child(4)::before { content: 'ผู้รับ'; }
  .table-scroll > table td:nth-child(5)::before { content: 'สินค้า'; }
  .table-scroll > table td:nth-child(6)::before { content: 'ที่อยู่'; }
  .table-scroll > table td:nth-child(7)::before { content: 'ขนส่ง'; }
  .table-scroll > table td:nth-child(8)::before { content: 'ยอดรวม'; }
  .table-scroll > table td:nth-child(9)::before { content: 'จัดการ'; }

  .shipment-editor {
    display: grid;
    width: min(100%, 220px);
    min-width: 0;
    gap: 0.45rem;
  }

  .shipment-editor select,
  .shipment-editor input {
    width: 100%;
    min-width: 0;
  }

  .table-scroll > table td:last-child {
    display: block;
    padding-top: 0.7rem;
  }

  .table-scroll > table td:last-child::before {
    display: none;
  }

  .table-scroll > table td:last-child button {
    width: 100%;
  }
}
@media (max-width: 600px) {
  .table-scroll > table { min-width: 0; table-layout: fixed; }
  .table-scroll > table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .table-scroll > table td::before { max-width: 40%; }
  .table-scroll > table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
  .table-scroll > table td:last-child > *,
  .shipment-editor, .recipient-info, .item-list, .address-cell, .address-text, .notes-block { max-width: 100%; }
}
</style>
