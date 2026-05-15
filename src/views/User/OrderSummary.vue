<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const order = ref(null)
const loading = ref(true)
const error = ref(null)
const notice = ref({ msg: '', type: '' })

// ── SLIP MANAGEMENT ──
const slipFile = ref(null)
const slipPreview = ref(null)

const onFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    // ตรวจสอบขนาดไฟล์ (เช่น ไม่เกิน 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotice('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error')
      return
    }
    slipFile.value = file
    slipPreview.value = URL.createObjectURL(file)
  }
}

// ── FETCH ORDER ──
const fetchOrder = async () => {
  const orderId = route.params.orderId
  if (!orderId) {
    router.push('/cart')
    return
  }

  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}`)
    if (!res.ok) throw new Error(`ไม่พบข้อมูลออเดอร์ (${res.status})`)
    const data = await res.json()
    order.value = data
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// ── PAYMENT METHODS ──

// Removed cash-on-delivery option per request
const paymentMethods = [
  { id: 'bank_transfer', name: 'โอนเงินผ่านธนาคาร', icon: '🏦' },
  { id: 'promptpay', name: 'พร้อมเพย์', icon: '📱' },
]

const selectedPaymentMethod = ref('bank_transfer')

// ── SHIPPING INFO ──
const shippingInfo = ref({
  name: '',
  phone: '',
  address: '',
  notes: '',
})

// ── CONFIRM PAYMENT ──
const confirmPayment = async () => {
  // 1. ตรวจสอบข้อมูลที่จำเป็น
  if (!shippingInfo.value.name || !shippingInfo.value.phone || !shippingInfo.value.address) {
    showNotice('กรุณากรอกข้อมูลการจัดส่งให้ครบถ้วน', 'error')
    return
  }

  // 2. ตรวจสอบสลิป
  if (!slipFile.value) {
    showNotice('กรุณาแนบหลักฐานการโอนเงิน', 'error')
    return
  }

  try {
    loading.value = true
    const formData = new FormData()

    // ข้อมูลจัดส่ง
    formData.append('shipping_name', shippingInfo.value.name)
    formData.append('shipping_phone', shippingInfo.value.phone)
    formData.append('shipping_address', shippingInfo.value.address)
    formData.append('notes', shippingInfo.value.notes)
    formData.append('payment_method', selectedPaymentMethod.value)

    // แนบไฟล์สลิป
    if (slipFile.value) {
      formData.append('slip', slipFile.value)
    }

    const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/payment`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error('เกิดข้อผิดพลาดในการส่งข้อมูล')

    showNotice('ส่งหลักฐานเรียบร้อย! ขอบคุณที่ใช้บริการ', 'success')

    setTimeout(() => {
      router.push('/')
    }, 2500)
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    loading.value = false
  }
}

let noticeTimer = null
function showNotice(msg, type = 'success') {
  notice.value = { msg, type }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = { msg: '', type: '' }
  }, 5000)
}

function goBack() {
  router.push('/order-list')
}

// ── STATUS MESSAGE ──
function getStatusMessage() {
  if (!order.value) return ''

  const status = String(order.value.status || '').toLowerCase()
  const statusMap = {
    pending: 'รอชำระเงิน - กรุณาส่งหลักฐานการโอนเงิน',
    paid: 'ชำระแล้ว - รอแอดมินตรวจสอบและจัดส่ง',
    wait_for_import_fee: 'รอค่านำเข้า - กรุณารอสักครู่',
    ready_to_ship: 'พร้อมจัดส่ง - ใกล้ถึงมือคุณแล้ว',
    cancelled: 'ยกเลิกแล้ว',
  }

  return statusMap[status] || status
}

function getStatusLabel() {
  if (!order.value) return ''

  const status = String(order.value.status || '').toLowerCase()
  const statusLabelMap = {
    pending: 'รอชำระเงิน',
    paid: 'ชำระแล้ว',
    wait_for_import_fee: 'รอค่านำเข้า',
    ready_to_ship: 'พร้อมจัดส่ง',
    cancelled: 'ยกเลิกแล้ว',
  }

  return statusLabelMap[status] || status
}

function shouldShowPaymentForm() {
  return order.value && String(order.value.status || '').toLowerCase() === 'pending'
}

onMounted(() => {
  fetchOrder()
  if (currentUser.value) {
    shippingInfo.value.name = currentUser.value.full_name || ''
  }
})
</script>

<template>
  <div class="order-summary-page">
    <!-- Navbar -->
    <nav class="navbar">
      <div class="navbar-content">
        <button class="back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div class="navbar__brand">
          <span class="brand-icon">🐱</span>
          <span class="brand-text">Meowverse</span>
        </div>
        <div class="navbar__spacer"></div>
      </div>
    </nav>

    <!-- Notice -->
    <transition name="slideDown">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">
        <span class="notice-msg">{{ notice.msg }}</span>
      </div>
    </transition>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Loading State -->
      <div v-if="loading && !order" class="state-container">
        <div class="loader"></div>
        <p class="loading-text">กำลังโหลดข้อมูล...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="state-container">
        <div class="error-icon">⚠️</div>
        <p class="error-text">{{ error }}</p>
        <button class="btn-retry" @click="fetchOrder">ลองใหม่</button>
      </div>

      <!-- Order Details -->
      <div v-else-if="order" class="order-container">
        <!-- Header Card -->
        <div class="header-card">
          <div class="header-top">
            <div class="order-number">
              <span class="order-label">ออเดอร์ #</span>
              <span class="order-id">{{ order.order_id }}</span>
            </div>
            <div :class="['status-badge', `status--${order.status.toLowerCase()}`]">
              {{ getStatusLabel() }}
            </div>
          </div>
          <div class="header-info">
            <div class="info-item">
              <span class="info-icon">📅</span>
              <div class="info-text">
                <span class="info-label">วันที่สั่งซื้อ</span>
                <span class="info-value">{{
                  new Date(order.Order_date || order.order_date).toLocaleString('th-TH')
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Message -->
        <div class="status-message-card">
          <span class="message-icon">ℹ️</span>
          <span class="message-text">{{ getStatusMessage() }}</span>
        </div>

        <!-- Items Card -->
        <div class="items-card">
          <h2 class="card-title">🛍️ สินค้าที่สั่ง</h2>

          <div class="items-grid-header">
            <div class="header-cell col-product">สินค้า</div>
            <div class="header-cell col-price">ราคา</div>
            <div class="header-cell col-qty">จำนวน</div>
            <div class="header-cell col-total">รวม</div>
          </div>

          <div class="items-grid">
            <div v-for="item in order.items" :key="item.detail_id" class="grid-row">
              <div class="cell col-product">
                <div class="product-cell">
                  <div class="product-image">
                    <img v-if="item.image" :src="item.image" :alt="item.name" />
                    <span v-else class="no-image">🐾</span>
                  </div>
                  <div class="product-info">
                    <p class="product-name">{{ item.name }}</p>
                    <p v-if="item.flavor" class="product-flavor">{{ item.flavor }}</p>
                  </div>
                </div>
              </div>
              <div class="cell col-price">
                <span class="price-value">฿{{ Number(item.Price).toLocaleString() }}</span>
              </div>
              <div class="cell col-qty">
                <span class="qty-badge">{{ item.qty }}</span>
              </div>
              <div class="cell col-total">
                <span class="total-value"
                  >฿{{ (Number(item.Price) * Number(item.qty)).toLocaleString() }}</span
                >
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div class="items-summary">
            <div class="summary-row">
              <span class="summary-label">ยอดรวม</span>
              <span class="summary-total">
                ฿{{
                  order.items
                    .reduce((sum, item) => sum + Number(item.Price) * Number(item.qty), 0)
                    .toLocaleString()
                }}
              </span>
            </div>
          </div>
        </div>

        <!-- Action Button -->
        <button class="btn-back-home" @click="goBack"><span>←</span> กลับไปรายการออเดอร์</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-summary-page {
  --primary: #7c5cdb;
  --primary-light: #a385e0;
  --primary-dark: #5a3eab;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --bg: linear-gradient(135deg, #f8f4ff 0%, #fef5f5 100%);
  --surface: #ffffff;
  --border: #e9e0f5;
  --text: #2d2d3d;
  --text-muted: #8b8b9a;
  --shadow: 0 8px 24px rgba(124, 92, 219, 0.12);
  --shadow-sm: 0 2px 8px rgba(124, 92, 219, 0.08);

  font-family: inherit;
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
}

/* ─────────────────── NAVBAR ─────────────────── */
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(12px);
}

.navbar-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  height: 60px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #f0e6ff, #ede9fe);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  color: var(--primary);
  cursor: pointer;
  transition: all 0.3s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--primary);
  color: white;
  transform: translateX(-2px);
  border-color: var(--primary);
}

.back-btn svg {
  width: 20px;
  height: 20px;
  stroke-width: 2.5;
}

.navbar__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-icon {
  font-size: 1.5rem;
}

.brand-text {
  font-weight: 900;
  font-size: 1.2rem;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.navbar__spacer {
  flex: 1;
}

/* ─────────────────── MAIN CONTENT ─────────────────── */
.main-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem;
  animation: fadeIn 0.4s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* State Containers */
.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.loader {
  width: 50px;
  height: 50px;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1.5rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text,
.error-text {
  font-size: 1rem;
  color: var(--text-muted);
  margin: 0;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.btn-retry {
  margin-top: 1.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.btn-retry:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

/* ─────────────────── ORDER CONTAINER ─────────────────── */
.order-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: slideUp 0.5s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Header Card */
.header-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  box-shadow: var(--shadow-sm);
  animation: slideDown 0.5s ease 0.1s backwards;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.order-number {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.order-label {
  font-size: 0.9rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.order-id {
  font-size: 2rem;
  font-weight: 900;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.status-badge {
  padding: 0.6rem 1.25rem;
  border-radius: 100px;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
}

.status--pending {
  background: linear-gradient(135deg, #fef3c7, #fce7b6);
  color: #92400e;
}

.status--paid {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  color: #1e40af;
}

.status--ready_to_ship {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  color: #166534;
}

.status--completed {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  color: #166534;
}

.status--cancelled {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #991b1b;
}

.status--wait_for_import_fee {
  background: linear-gradient(135deg, #fce7f3, #fbcfe8);
  color: #831843;
}

.header-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.info-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.info-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

/* Status Message Card */
.status-message-card {
  background: linear-gradient(135deg, #fef08a, #fde047);
  border: 1.5px solid #fcd34d;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: slideDown 0.5s ease 0.2s backwards;
}

.message-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.message-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #78350f;
  line-height: 1.5;
}

/* ─────────────────── ITEMS CARD ─────────────────── */
.items-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  animation: slideDown 0.5s ease 0.3s backwards;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, #f8f4ff, #faf8ff);
}

/* Grid Header */
.items-grid-header {
  display: grid;
  grid-template-columns: 1fr 120px 100px 120px;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #f8f4ff, #faf8ff);
  border-bottom: 2px solid var(--border);
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.header-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Grid Rows */
.items-grid {
  max-height: 600px;
  overflow-y: auto;
}

.grid-row {
  display: grid;
  grid-template-columns: 1fr 120px 100px 120px;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  align-items: center;
  transition: all 0.3s;
  animation: fadeInRow 0.4s ease backwards;
}

@keyframes fadeInRow {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.grid-row:hover {
  background: linear-gradient(135deg, rgba(248, 244, 255, 0.5), rgba(250, 248, 255, 0.5));
}

.grid-row:last-child {
  border-bottom: none;
}

.cell {
  display: flex;
  align-items: center;
}

/* Product Cell */
.product-cell {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.product-image {
  width: 70px;
  height: 70px;
  background: linear-gradient(135deg, #f0e6ff, #ede9fe);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--border);
  transition: transform 0.3s;
}

.grid-row:hover .product-image {
  transform: scale(1.05);
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  font-size: 2rem;
}

.product-info {
  flex: 1;
  min-width: 0;
}

.product-name {
  font-weight: 700;
  font-size: 0.95rem;
  margin: 0 0 0.25rem 0;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-flavor {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Price Cell */
.price-value {
  font-weight: 700;
  color: var(--text);
  text-align: center;
  display: block;
}

/* Qty Cell */
.qty-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #f0e6ff, #ede9fe);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-weight: 700;
  color: var(--primary);
  font-size: 0.95rem;
}

/* Total Cell */
.total-value {
  font-weight: 800;
  font-size: 1rem;
  color: var(--primary);
  text-align: right;
  display: block;
}

/* Summary */
.items-summary {
  padding: 1.5rem;
  background: linear-gradient(135deg, #f8f4ff, #faf8ff);
  border-top: 2px solid var(--border);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.summary-total {
  font-size: 1.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ─────────────────── BUTTONS ─────────────────── */
.btn-back-home {
  align-self: center;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 16px rgba(124, 92, 219, 0.3);
  margin-top: 1rem;
  animation: slideDown 0.5s ease 0.4s backwards;
}

.btn-back-home:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(124, 92, 219, 0.4);
}

.btn-back-home:active {
  transform: translateY(-1px);
}

/* ─────────────────── NOTICE ─────────────────── */
.notice {
  position: fixed;
  top: 75px;
  right: 20px;
  z-index: 1000;
  padding: 1rem 1.5rem;
  background: var(--surface);
  border-radius: 12px;
  box-shadow: var(--shadow);
  border-left: 4px solid var(--primary);
  font-size: 0.9rem;
  font-weight: 600;
  animation: slideIn 0.3s ease;
}

.notice-msg {
  color: var(--text);
}

.notice--error {
  border-left-color: var(--danger);
}

.notice--success {
  border-left-color: var(--success);
}

.notice--warn {
  border-left-color: var(--warning);
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideDown {
  0% {
    transform: translateY(-10px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ─────────────────── RESPONSIVE ─────────────────── */
@media (max-width: 768px) {
  .main-content {
    padding: 1rem;
  }

  .header-card {
    padding: 1.5rem;
  }

  .order-id {
    font-size: 1.5rem;
  }

  .items-grid-header,
  .grid-row {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .header-cell,
  .cell {
    display: block;
  }

  .product-cell {
    flex-direction: column;
    text-align: center;
  }

  .price-value,
  .total-value {
    text-align: left;
  }

  .items-grid-header {
    display: none;
  }

  .grid-row::before {
    content: attr(data-label);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
  }
}
</style>
