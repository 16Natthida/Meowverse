<script setup>
import { ref, onMounted, computed } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const orders = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const filterType = ref('all')
const providers = ref([])
const drafts = ref({})
const savingOrderId = ref(null)

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
        shipping_status: order.shipping_status || 'shipped',
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
      shipping_status: order.shipping_status || 'shipped',
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
        shipping_status: draft.shipping_status || 'shipped',
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

onMounted(fetchShippingOrders)
</script>

<template>
  <div class="shipping-page">
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
                <strong>#{{ order.order_id }}</strong><br/>
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
                  <select v-model="getDraft(order).shipping_status">
                    <option value="shipped">จัดส่งแล้ว</option>
                    <option value="delivered">นำจ่ายแล้ว</option>
                  </select>
                </div>
              </td>

              <td class="price-text">
                ฿{{ Number(order.total_amount).toLocaleString() }}
              </td>

              <td>
                <button
                  class="btn-action btn-action--ready"
                  :disabled="savingOrderId === order.order_id"
                  @click="saveShipment(order)"
                >
                  {{ savingOrderId === order.order_id ? 'กำลังบันทึก...' : 'บันทึกการจัดส่ง' }}
                </button>
                <small class="shipment-status">{{ statusLabel(order.status) }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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


.status {
  border: 1px solid transparent;
  display: inline-block;
  white-space: nowrap;
}
.btn-action--ready:hover {
  background: #10b981;
  color: white;
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
</style>
