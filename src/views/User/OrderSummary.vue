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
const paymentMethods = [
  { id: 'bank_transfer', name: 'โอนเงินผ่านธนาคาร', icon: '🏦' },
  { id: 'promptpay', name: 'พร้อมเพย์', icon: '📱' },
  { id: 'cash_on_delivery', name: 'เก็บเงินปลายทาง', icon: '💵' },
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

  // 2. ตรวจสอบสลิป (ถ้าไม่ใช่ COD)
  if (selectedPaymentMethod.value !== 'cash_on_delivery' && !slipFile.value) {
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
  router.push('/cart')
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
    <nav class="navbar">
      <button class="back-btn" @click="goBack">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          class="back-icon"
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับไปหน้าหลัก
      </button>
      <div class="navbar__logo">
        <span class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
      <div class="navbar__title">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="title-order-icon"
        >
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        สรุปออเดอร์
      </div>
    </nav>

    <transition name="slide-down">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">
        <span class="notice-msg">{{ notice.msg }}</span>
      </div>
    </transition>

    <div class="content">
      <div v-if="loading && !order" class="state-wrap">
        <div class="loader"></div>
        <p>กำลังดำเนินการ...</p>
      </div>

      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn btn--primary" @click="fetchOrder">ลองใหม่</button>
      </div>

      <div v-else-if="order" class="order-layout">
        <div class="order-details">
          <div class="section-card">
            <h2 class="section-title">📦 รายละเอียดออเดอร์ #{{ order.order_id }}</h2>
            <div class="order-info">
              <div class="info-row">
                <span>วันที่สั่งซื้อ:</span>
                <span>{{ new Date(order.order_date).toLocaleString('th-TH') }}</span>
              </div>
              <div class="info-row">
                <span>สถานะ:</span>
                <span :class="['status-badge', `status--${order.status.toLowerCase()}`]">
                  {{ order.status }}
                </span>
              </div>
            </div>

            <div class="item-list">
              <div v-for="item in order.items" :key="item.detail_id" class="order-item">
                <div class="item-img">
                  <img v-if="item.image" :src="item.image" />
                  <span v-else>🐾</span>
                </div>
                <div class="item-info">
                  <p class="item-name">{{ item.name }}</p>
                  <p class="item-price-small">฿{{ item.unit_price.toLocaleString() }}</p>
                </div>
                <div class="item-qty">x{{ item.qty }}</div>
                <div class="item-total">฿{{ (item.unit_price * item.qty).toLocaleString() }}</div>
              </div>
            </div>
          </div>

          <div class="section-card">
            <h3 class="section-title">📍 ข้อมูลการจัดส่ง</h3>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">ชื่อผู้รับ</label>
                <input
                  v-model="shippingInfo.name"
                  type="text"
                  class="form-input"
                  placeholder="ระบุชื่อ-นามสกุล"
                />
              </div>
              <div class="form-group">
                <label class="form-label">เบอร์โทรศัพท์</label>
                <input
                  v-model="shippingInfo.phone"
                  type="tel"
                  class="form-input"
                  placeholder="08x-xxx-xxxx"
                />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">ที่อยู่จัดส่ง</label>
              <textarea
                v-model="shippingInfo.address"
                class="form-textarea"
                rows="3"
                placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล..."
              ></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">หมายเหตุ</label>
              <textarea v-model="shippingInfo.notes" class="form-textarea" rows="1"></textarea>
            </div>
          </div>
        </div>

        <div class="payment-section">
          <div class="section-card">
            <h3 class="section-title">💳 วิธีการชำระเงิน</h3>
            <div class="payment-methods">
              <div
                v-for="method in paymentMethods"
                :key="method.id"
                :class="[
                  'payment-method',
                  { 'payment-method--selected': selectedPaymentMethod === method.id },
                ]"
                @click="selectedPaymentMethod = method.id"
              >
                <span class="method-icon">{{ method.icon }}</span>
                <span class="method-name">{{ method.name }}</span>
              </div>
            </div>
          </div>

          <div v-if="selectedPaymentMethod !== 'cash_on_delivery'" class="section-card slip-card">
            <h3 class="section-title">📸 แนบหลักฐานการโอน</h3>
            <div class="upload-area">
              <input
                type="file"
                id="slip-file"
                accept="image/*"
                @change="onFileChange"
                class="hidden-input"
              />
              <label for="slip-file" class="upload-label">
                <div v-if="!slipPreview" class="upload-prompt">
                  <span>➕ คลิกเพื่ออัปโหลดสลิป</span>
                </div>
                <div v-else class="preview-box">
                  <img :src="slipPreview" class="slip-preview" />
                  <div class="edit-overlay">เปลี่ยนรูปภาพ</div>
                </div>
              </label>
            </div>
          </div>

          <div class="section-card summary-card">
            <div class="summary-row">
              <span>ยอดรวมสินค้า</span>
              <span>฿{{ order.total_amount.toLocaleString() }}</span>
            </div>
            <div class="summary-row">
              <span>ค่าจัดส่ง</span>
              <span class="free-text">ฟรี</span>
            </div>
            <hr class="divider" />
            <div class="summary-row total">
              <span>ยอดสุทธิ</span>
              <span class="total-amount">฿{{ order.total_amount.toLocaleString() }}</span>
            </div>
            <button class="btn-checkout" @click="confirmPayment" :disabled="loading">
              {{ loading ? 'กำลังประมวลผล...' : 'ยืนยันและชำระเงิน' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-summary-page {
  --primary: #6f50a0;
  --primary-light: #cda2fb;
  --primary-dark: #3f2f5d;
  --bg: #f8f5ff;
  --border: #eadff5;
  --text: #3f2f5d;
  --muted: #75658f;
  --radius: 14px;
  --radius-sm: 10px;

  font-family: inherit;
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
}

/* Navbar */
.navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1.5rem;
  height: 58px;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 16px rgba(89, 61, 125, 0.08);
  backdrop-filter: blur(8px);
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  background: linear-gradient(160deg, #f8f2ff, #f0e6ff);
  border: 1px solid #dcc8f5;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--primary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  white-space: nowrap;
}
.back-btn:hover {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  border-color: #b788ea;
}
.back-btn:hover .back-icon {
  stroke: #fff;
}
.back-icon {
  width: 15px;
  height: 15px;
  stroke: var(--primary);
  transition: stroke 0.2s;
}
.navbar__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 1rem;
}
.logo-icon {
  font-size: 1.3rem;
}
.logo-text {
  font-weight: 900;
  color: var(--primary);
  font-size: 1rem;
}
.navbar__title {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text);
}
.title-order-icon {
  width: 18px;
  height: 18px;
}

/* Cards */
.section-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 8px rgba(111, 80, 160, 0.08);
}
.section-title {
  font-size: 1rem;
  margin-bottom: 1.2rem;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: var(--text);
}

/* Order Info */
.order-info {
  background: #f9f8ff;
  padding: 1rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1.5rem;
  border-left: 4px solid var(--primary);
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.9rem;
}
.info-row:last-child {
  margin-bottom: 0;
}
.status-badge {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status--pending {
  background: linear-gradient(160deg, #fef3c7, #fcd34d);
  color: #7c2d12;
}
.status--completed {
  background: linear-gradient(160deg, #d1fae5, #a7f3d0);
  color: #065f46;
}
.status--canceled {
  background: linear-gradient(160deg, #fee2e2, #fca5a5);
  color: #7f1d1d;
}

/* Order Items */
.order-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: var(--radius-sm);
  background: #fafaf9;
  margin-bottom: 0.8rem;
  border: 1px solid transparent;
  transition: all 0.2s;
}
.order-item:hover {
  background: #f5f3ff;
  border-color: var(--border);
}
.item-img {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-info {
  flex: 1;
}
.item-name {
  font-weight: 700;
  font-size: 0.9rem;
  margin: 0 0 3px 0;
  color: var(--text);
}
.item-price-small {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0;
}
.item-qty {
  padding: 4px 8px;
  background: #f0e6ff;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--primary);
  min-width: 35px;
  text-align: center;
}
.item-total {
  font-weight: 700;
  color: var(--primary);
  font-size: 0.95rem;
  min-width: 70px;
  text-align: right;
}

/* Forms */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.form-group {
  margin-bottom: 1rem;
}
.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text);
}
.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 0.9rem;
  transition: all 0.2s;
  background: #fff;
  color: var(--text);
}
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(111, 80, 160, 0.1);
}
.form-input::placeholder,
.form-textarea::placeholder {
  color: #aaa;
}

/* Payment Methods */
.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.payment-method {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
  position: relative;
}
.payment-method:hover {
  border-color: var(--primary);
}
.payment-method--selected {
  background: linear-gradient(160deg, #f0e6ff, #f5f3ff);
  border-color: var(--primary);
  font-weight: 600;
}
.method-icon {
  font-size: 1.2rem;
  display: flex;
  align-items: center;
}
.method-name {
  font-size: 0.9rem;
  color: var(--text);
}

/* Slip Upload */
.upload-area {
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: all 0.2s;
}
.upload-area:hover {
  border-color: var(--primary);
}
.hidden-input {
  display: none;
}
.upload-label {
  cursor: pointer;
  display: block;
}
.upload-prompt {
  padding: 35px;
  text-align: center;
  color: var(--primary);
  font-weight: 700;
  font-size: 0.95rem;
}
.preview-box {
  position: relative;
  width: 100%;
  background: #000;
  display: flex;
  justify-content: center;
}
.slip-preview {
  max-width: 100%;
  max-height: 250px;
  display: block;
}
.edit-overlay {
  position: absolute;
  bottom: 0;
  width: 100%;
  background: rgba(111, 80, 160, 0.85);
  color: #fff;
  text-align: center;
  padding: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}
.preview-box:hover .edit-overlay {
  background: rgba(111, 80, 160, 1);
}

/* Summary */
.summary-card {
  background: #fff;
  border: 1px solid var(--border);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.9rem;
}
.summary-row.total {
  font-size: 1.15rem;
  font-weight: 900;
  color: var(--primary);
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.total-amount {
  font-weight: 900;
  color: var(--primary);
}
.divider {
  border: none;
  border-top: 1px dashed var(--border);
  margin: 10px 0;
}
.free-text {
  color: #10b981;
  font-weight: 700;
  background: linear-gradient(160deg, #f0fdf5, #e4f8ef);
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
}

.btn-checkout {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: linear-gradient(160deg, #7c63d8, #6f50a0);
  color: #fff;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 15px;
  box-shadow: 0 4px 12px rgba(111, 80, 160, 0.25);
  transition: all 0.2s;
  font-family: inherit;
}
.btn-checkout:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(111, 80, 160, 0.35);
}
.btn-checkout:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Notice */
.notice {
  position: fixed;
  top: 70px;
  right: 20px;
  z-index: 1000;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: 0 4px 12px rgba(111, 80, 160, 0.2);
  border-left: 4px solid var(--primary);
  font-size: 0.9rem;
  font-weight: 600;
  animation: slideIn 0.3s ease;
}
.notice-msg {
  color: var(--text);
}
.notice--error {
  border-left-color: #ef4444;
}
.notice--success {
  border-left-color: #10b981;
}
.notice--warn {
  border-left-color: #f59e0b;
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

/* Layout */
.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}
.order-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 1.5rem;
  align-items: start;
}
.order-details {
  display: flex;
  flex-direction: column;
}
.payment-section {
  display: flex;
  flex-direction: column;
}

/* State Messages */
.state-wrap {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--muted);
}
.error-box {
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-sm);
  color: #dc2626;
  font-weight: 600;
  margin-bottom: 1rem;
}

.loader {
  border: 3px solid #f0e6ff;
  border-top: 3px solid var(--primary);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .order-layout {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .content {
    padding: 1rem;
  }
}
</style>
