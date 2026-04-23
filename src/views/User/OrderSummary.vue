<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())

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
    const res = await fetch(`http://localhost:3001/api/orders/${orderId}`)
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
  { id: 'cash_on_delivery', name: 'เก็บเงินปลายทาง', icon: '💵' }
]

const selectedPaymentMethod = ref('bank_transfer')

// ── SHIPPING INFO ──
const shippingInfo = ref({
  name: '',
  phone: '',
  address: '',
  notes: ''
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

    const res = await fetch(`http://localhost:3001/api/orders/${order.value.order_id}/payment`, {
      method: 'POST',
      body: formData 
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="back-icon">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับไปตะกร้า
      </button>
      <div class="navbar__logo">
        <span class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
      <div class="navbar__title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-order-icon">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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
                <input v-model="shippingInfo.name" type="text" class="form-input" placeholder="ระบุชื่อ-นามสกุล">
              </div>
              <div class="form-group">
                <label class="form-label">เบอร์โทรศัพท์</label>
                <input v-model="shippingInfo.phone" type="tel" class="form-input" placeholder="08x-xxx-xxxx">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">ที่อยู่จัดส่ง</label>
              <textarea v-model="shippingInfo.address" class="form-textarea" rows="3" placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล..."></textarea>
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
                :class="['payment-method', { 'payment-method--selected': selectedPaymentMethod === method.id }]"
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
              <input type="file" id="slip-file" accept="image/*" @change="onFileChange" class="hidden-input">
              <label for="slip-file" class="upload-label">
                <div v-if="!slipPreview" class="upload-prompt">
                  <span>➕ คลิกเพื่ออัปโหลดสลิป</span>
                </div>
                <div v-else class="preview-box">
                  <img :src="slipPreview" class="slip-preview">
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
            <hr class="divider">
            <div class="summary-row total">
              <span>ยอดสุทธิ</span>
              <span class="total-amount">฿{{ order.total_amount.toLocaleString() }}</span>
            </div>
            <button 
              class="btn-checkout" 
              @click="confirmPayment" 
              :disabled="loading"
            >
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
  --bg: #f8f5ff;
  --border: #eadff5;
  --text: #3f2f5d;
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  font-family: 'Kanit', sans-serif;
}

/* Navbar */
.navbar {
  display: flex; align-items: center; padding: 0 1.5rem; height: 60px;
  background: #fff; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
}
.back-btn {
  display: flex; align-items: center; gap: 5px; border-radius: 20px;
  padding: 5px 12px; border: 1px solid var(--border); background: #fff;
  cursor: pointer; color: var(--primary); font-weight: bold;
}
.navbar__logo { display: flex; align-items: center; gap: 8px; margin-left: 20px; }
.logo-text { font-weight: 900; color: var(--primary); }
.navbar__title { margin-left: auto; display: flex; align-items: center; gap: 5px; font-weight: bold; }
.back-icon, .title-order-icon { width: 18px; height: 18px; }

/* Layout */
.content { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
.order-layout { display: grid; grid-template-columns: 1fr 380px; gap: 1.5rem; align-items: start; }

/* Cards */
.section-card {
  background: #fff; border: 1px solid var(--border);
  border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(111, 80, 160, 0.05);
}
.section-title { font-size: 1.1rem; margin-bottom: 1.2rem; display: flex; align-items: center; gap: 10px; }

/* Order Items */
.order-item {
  display: flex; align-items: center; gap: 1rem; padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.item-img { width: 50px; height: 50px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.item-img img { width: 100%; height: 100%; object-fit: cover; }
.item-info { flex: 1; }
.item-name { font-weight: bold; font-size: 0.9rem; margin: 0; }
.item-price-small { font-size: 0.8rem; color: #888; margin: 0; }
.item-total { font-weight: bold; color: var(--primary); }

/* Forms */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.form-group { margin-bottom: 1rem; }
.form-label { display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 5px; }
.form-input, .form-textarea {
  width: 100%; padding: 10px; border: 1px solid var(--border);
  border-radius: 8px; font-family: inherit;
}

/* Payment Methods */
.payment-methods { display: flex; flex-direction: column; gap: 8px; }
.payment-method {
  display: flex; align-items: center; gap: 10px; padding: 12px;
  border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: 0.2s;
}
.payment-method--selected { background: #f0e6ff; border-color: var(--primary); }

/* Slip Upload */
.upload-area { border: 2px dashed var(--border); border-radius: 12px; overflow: hidden; }
.hidden-input { display: none; }
.upload-label { cursor: pointer; display: block; }
.upload-prompt { padding: 30px; text-align: center; color: var(--primary); font-weight: bold; }
.preview-box { position: relative; width: 100%; background: #000; display: flex; justify-content: center; }
.slip-preview { max-width: 100%; max-height: 250px; }
.edit-overlay {
  position: absolute; bottom: 0; width: 100%; background: rgba(111, 80, 160, 0.8);
  color: #fff; text-align: center; padding: 5px; font-size: 0.8rem;
}

/* Summary */
.summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; }
.summary-row.total { font-size: 1.2rem; font-weight: 900; color: var(--primary); margin-top: 10px; }
.divider { border: none; border-top: 1px dashed var(--border); margin: 15px 0; }
.free-text { color: #10b981; font-weight: bold; }

.btn-checkout {
  width: 100%; padding: 15px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #6f50a0, #9a7dbf);
  color: #fff; font-weight: 900; font-size: 1.1rem; cursor: pointer;
  margin-top: 15px; box-shadow: 0 4px 15px rgba(111, 80, 160, 0.3);
}
.btn-checkout:disabled { filter: grayscale(1); cursor: wait; }

/* Notice */
.notice {
  position: fixed; top: 70px; right: 20px; z-index: 1000;
  padding: 12px 20px; border-radius: 10px; background: #fff;
  box-shadow: 0 5px 20px rgba(0,0,0,0.1); border-left: 5px solid var(--primary);
}
.notice--error { border-left-color: #ef4444; }
.notice--success { border-left-color: #10b981; }

.loader {
  border: 4px solid #f3f3f3; border-top: 4px solid var(--primary);
  border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .order-layout { grid-template-columns: 1fr; }
  .payment-section { position: static; }
}
</style>