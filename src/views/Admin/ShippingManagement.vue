<script setup>
import { ref, onMounted, computed } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const orders = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const filterType = ref('all')

// ดึงข้อมูลออเดอร์ที่สถานะเป็น 'Paid' หรือ 'Ready_to_Ship'
async function fetchShippingOrders() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/admin/shipping-orders`)
    if (!res.ok) throw new Error('โหลดข้อมูลการจัดส่งไม่สำเร็จ')
    orders.value = await res.json()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// ฟังก์ชันเปลี่ยนสถานะเป็น Ready_to_Ship
async function updateToReady(orderId) {
  if (!confirm(`ยืนยันการเปลี่ยนสถานะออเดอร์ #${orderId} เป็นพร้อมส่ง?`)) return

  try {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PATCH', // หรือ PUT ตามที่ Backend กำหนด
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Ready_to_Ship' })
    })

    if (!res.ok) throw new Error('ไม่สามารถอัปเดตสถานะได้')
    
    alert('อัปเดตสถานะเรียบร้อยแล้ว')
    // ดึงข้อมูลใหม่เพื่อให้รายการที่อัปเดตแล้วหายไปจากหน้า 'เตรียมจัดส่ง' (ถ้า API กรองเฉพาะสถานะ Paid/Ready)
    await fetchShippingOrders() 
  } catch (err) {
    alert(err.message)
  }
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
              <th>ขนส่ง</th>
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
                <span :class="['status', order.status === 'Ready_to_Ship' ? 'status--ready' : 'status--paid']">
                  {{ order.status === 'Ready_to_Ship' ? 'พร้อมจัดส่ง' : 'ชำระเงินแล้ว' }}
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
                <span class="carrier-badge" v-if="order.Shipping_Carrier">
                  {{ order.Shipping_Carrier }}
                </span>
                <span v-else class="no-data">ยังไม่ระบุ</span>
              </td>

              <td class="price-text">
                ฿{{ Number(order.total_amount).toLocaleString() }}
              </td>

              <td>
                <button 
                  v-if="order.status !== 'Ready_to_Ship'"
                  class="btn-action btn-action--ready" 
                  @click="updateToReady(order.order_id)"
                >
                  📦 พร้อมจัดส่ง
                </button>
                <span v-else style="color: #10b981; font-weight: bold; font-size: 0.8rem;">
                  ✅ ดำเนินการแล้ว
                </span>
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
.notes-text {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: #524b6b;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.loading-wrap { text-align: center; padding: 3rem; color: var(--text-muted); }
</style>
