<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

const order = ref(null)
const loading = ref(true)
const error = ref(null)
const notice = ref({ msg: '', type: '' })

const slipFile = ref(null)
const slipPreview = ref(null)
const selectedPaymentMethod = ref('bank_transfer')

const paymentMethods = [
  { id: 'bank_transfer', name: 'โอนเงินผ่านธนาคาร', icon: '🏦' },
  { id: 'promptpay',     name: 'พร้อมเพย์',          icon: '📱' },
]

const onFileChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    showNotice('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error')
    return
  }
  slipFile.value = file
  slipPreview.value = URL.createObjectURL(file)
}

const fetchOrder = async () => {
  const orderId = route.params.orderId
  if (!orderId) { router.push('/'); return }
  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}`)
    if (!res.ok) throw new Error(`ไม่พบข้อมูลออเดอร์ (${res.status})`)
    const data = await res.json()
    // ถ้าไม่ใช่ Preorder ให้ redirect ไป OrderSummary ปกติ
    if (data.Order_type !== 'Preorder') {
      router.replace(`/order/${orderId}`)
      return
    }
    order.value = data
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const confirmPayment = async () => {
  if (!slipFile.value) {
    showNotice('กรุณาแนบหลักฐานการโอนเงิน', 'error')
    return
  }

  try {
    loading.value = true
    const formData = new FormData()
    formData.append('payment_method', selectedPaymentMethod.value)
    formData.append('slip', slipFile.value)
    // ส่งข้อมูล shipping เป็นค่าว่างเพราะ Preorder ไม่ต้องการ
    formData.append('shipping_name', '-')
    formData.append('shipping_phone', '-')
    formData.append('shipping_address', '-')
    formData.append('notes', '')

    const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/payment`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error('เกิดข้อผิดพลาดในการส่งข้อมูล')

    showNotice('ส่งหลักฐานเรียบร้อย! รอการตรวจสอบจากทีมงาน', 'success')
    setTimeout(() => router.push('/order-list'), 2500)
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
  noticeTimer = setTimeout(() => { notice.value = { msg: '', type: '' } }, 5000)
}

function goBack() { router.push('/order-list') }

onMounted(fetchOrder)
</script>

<template>
  <div class="order-summary-page">
    <nav class="navbar">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="back-icon">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับรายการออเดอร์
      </button>
      <div class="navbar__logo">
        <span class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
      <div class="navbar__title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-order-icon">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        ชำระเงิน Preorder
      </div>
    </nav>

    <transition name="slide-down">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">
        <span class="notice-msg">{{ notice.msg }}</span>
      </div>
    </transition>

    <div class="content">
      <div v-if="loading && !order" class="state-wrap">
        <div class="loader"></div><p>กำลังโหลด...</p>
      </div>

      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn btn--primary" @click="fetchOrder">ลองใหม่</button>
      </div>

      <div v-else-if="order" class="order-layout">
        <!-- LEFT: รายการสินค้า -->
        <div class="order-details">
          <div class="section-card">
            <h2 class="section-title">🕐 Preorder #{{ order.order_id }}</h2>
            <div class="preorder-notice">
              สินค้า Preorder จะถูกนำเข้าหลังได้รับการชำระเงิน ทีมงานจะแจ้งค่านำเข้าเพิ่มเติมภายหลัง
            </div>
            <div class="order-info">
              <div class="info-row">
                <span>วันที่สั่งซื้อ:</span>
                <span>{{ new Date(order.order_date).toLocaleString('th-TH') }}</span>
              </div>
              <div class="info-row">
                <span>สถานะ:</span>
                <span :class="['status-badge', `status--${order.status?.toLowerCase()}`]">{{ order.status }}</span>
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
                  <p class="item-price-small">฿{{ Number(item.unit_price).toLocaleString() }}</p>
                </div>
                <div class="item-qty">x{{ item.qty }}</div>
                <div class="item-total">฿{{ (item.unit_price * item.qty).toLocaleString() }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: ชำระเงิน -->
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

          <div class="section-card slip-card">
            <h3 class="section-title">📸 แนบหลักฐานการโอน</h3>
            <div class="upload-area">
              <input type="file" id="slip-file" accept="image/*" @change="onFileChange" class="hidden-input" />
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
              <span>฿{{ Number(order.total_amount).toLocaleString() }}</span>
            </div>
            <div class="summary-row">
              <span>ค่านำเข้า</span>
              <span class="pending-text">แจ้งภายหลัง</span>
            </div>
            <hr class="divider" />
            <div class="summary-row total">
              <span>ยอดชำระขณะนี้</span>
              <span class="total-amount">฿{{ Number(order.total_amount).toLocaleString() }}</span>
            </div>
            <button class="btn-checkout" @click="confirmPayment" :disabled="loading">
              {{ loading ? 'กำลังประมวลผล...' : 'ยืนยันการชำระเงิน Preorder' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --primary: #6f50a0;
  --bg: #f8f5ff;
  --border: #eadff5;
  --text: #3f2f5d;
  --muted: #9a7dbf;
  --radius: 16px;
  --radius-sm: 10px;
}

.order-summary-page {
  background: var(--bg, #f8f5ff);
  min-height: 100vh;
  font-family: 'Kanit', sans-serif;
  color: var(--text, #3f2f5d);
}

/* NAVBAR */
.navbar { display: flex; align-items: center; padding: 0 1.5rem; height: 60px; background: #fff; border-bottom: 1px solid var(--border, #eadff5); position: sticky; top: 0; z-index: 100; }
.back-btn { display: flex; align-items: center; gap: 5px; border-radius: 20px; padding: 5px 12px; border: 1px solid var(--border, #eadff5); background: #fff; cursor: pointer; color: var(--primary, #6f50a0); font-weight: bold; font-family: inherit; }
.back-btn:hover { background: #f8f5ff; }
.back-icon { width: 18px; height: 18px; }
.navbar__logo { display: flex; align-items: center; gap: 8px; margin-left: 20px; }
.logo-text { font-weight: 900; color: var(--primary, #6f50a0); }
.navbar__title { margin-left: auto; display: flex; align-items: center; gap: 5px; font-weight: bold; }
.title-order-icon { width: 18px; height: 18px; }

/* NOTICE */
.notice { position: fixed; top: 70px; right: 20px; z-index: 1000; padding: 12px 16px; border-radius: var(--radius-sm, 10px); background: #fff; box-shadow: 0 4px 12px rgba(111,80,160,0.2); border-left: 4px solid var(--primary, #6f50a0); font-size: 0.9rem; font-weight: 600; }
.notice--error   { border-left-color: #ef4444; }
.notice--success { border-left-color: #10b981; }
.notice-msg { color: var(--text, #3f2f5d); }

/* CONTENT */
.content { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem; }
.order-layout { display: grid; grid-template-columns: 1fr 360px; gap: 1.5rem; align-items: start; }
.order-details, .payment-section { display: flex; flex-direction: column; gap: 1.25rem; }

.section-card { background: #fff; border: 1px solid var(--border, #eadff5); border-radius: var(--radius, 16px); padding: 1.5rem; box-shadow: 0 4px 6px rgba(111,80,160,0.05); }
.section-title { font-size: 1rem; font-weight: 800; color: var(--primary, #6f50a0); margin: 0 0 1rem; }

.preorder-notice { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 10px; padding: 10px 14px; font-size: 0.82rem; color: #5b21b6; font-weight: 600; margin-bottom: 1rem; }

.order-info { display: flex; flex-direction: column; gap: 6px; margin-bottom: 1.25rem; padding: 0.85rem; background: #faf7ff; border-radius: 10px; }
.info-row { display: flex; justify-content: space-between; font-size: 0.88rem; }
.status-badge { padding: 2px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; background: #f0e6ff; color: var(--primary, #6f50a0); }

.item-list { display: flex; flex-direction: column; gap: 0.75rem; }
.order-item { display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: #faf7ff; border-radius: 12px; }
.item-img { width: 50px; height: 50px; border-radius: 10px; overflow: hidden; background: #f0e6ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.4rem; }
.item-img img { width: 100%; height: 100%; object-fit: cover; }
.item-info { flex: 1; }
.item-name { font-size: 0.9rem; font-weight: 700; margin: 0 0 3px; color: var(--text, #3f2f5d); }
.item-price-small { font-size: 0.8rem; color: var(--muted, #9a7dbf); margin: 0; }
.item-qty { padding: 4px 8px; background: #f0e6ff; border-radius: 6px; font-weight: 600; font-size: 0.8rem; color: var(--primary, #6f50a0); min-width: 35px; text-align: center; }
.item-total { font-weight: 700; color: var(--primary, #6f50a0); font-size: 0.95rem; min-width: 70px; text-align: right; }

/* Payment */
.payment-methods { display: flex; flex-direction: column; gap: 10px; }
.payment-method { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 2px solid var(--border, #eadff5); border-radius: var(--radius-sm, 10px); cursor: pointer; transition: all 0.2s; background: #fff; }
.payment-method:hover { border-color: var(--primary, #6f50a0); }
.payment-method--selected { background: linear-gradient(160deg, #f0e6ff, #f5f3ff); border-color: var(--primary, #6f50a0); font-weight: 600; }
.method-icon { font-size: 1.2rem; }
.method-name { font-size: 0.9rem; color: var(--text, #3f2f5d); }

/* Upload */
.upload-area { border: 2px dashed var(--border, #eadff5); border-radius: var(--radius-sm, 10px); overflow: hidden; transition: all 0.2s; }
.upload-area:hover { border-color: var(--primary, #6f50a0); }
.hidden-input { display: none; }
.upload-label { cursor: pointer; display: block; }
.upload-prompt { padding: 35px; text-align: center; color: var(--primary, #6f50a0); font-weight: 700; font-size: 0.95rem; }
.preview-box { position: relative; width: 100%; background: #000; display: flex; justify-content: center; }
.slip-preview { max-width: 100%; max-height: 250px; display: block; }
.edit-overlay { position: absolute; bottom: 0; width: 100%; background: rgba(111,80,160,0.85); color: #fff; text-align: center; padding: 6px; font-size: 0.85rem; font-weight: 600; }

/* Summary */
.summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.9rem; }
.summary-row.total { font-size: 1.15rem; font-weight: 900; color: var(--primary, #6f50a0); margin-top: 12px; }
.total-amount { font-weight: 900; color: var(--primary, #6f50a0); }
.divider { border: none; border-top: 1px dashed var(--border, #eadff5); margin: 10px 0; }
.pending-text { color: #f59e0b; font-weight: 700; background: #fffbeb; padding: 3px 10px; border-radius: 12px; font-size: 0.82rem; }

.btn-checkout { width: 100%; padding: 14px; border-radius: var(--radius-sm, 10px); border: none; background: linear-gradient(160deg, #7c63d8, #6f50a0); color: #fff; font-weight: 800; font-size: 1rem; cursor: pointer; margin-top: 15px; box-shadow: 0 4px 12px rgba(111,80,160,0.25); transition: all 0.2s; font-family: inherit; }
.btn-checkout:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(111,80,160,0.35); }
.btn-checkout:disabled { opacity: 0.7; cursor: not-allowed; }

/* States */
.state-wrap { text-align: center; padding: 3rem 1rem; color: var(--muted, #9a7dbf); }
.error-box { padding: 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm, 10px); color: #dc2626; font-weight: 600; margin-bottom: 1rem; }
.loader { border: 3px solid #f0e6ff; border-top: 3px solid var(--primary, #6f50a0); border-radius: 50%; width: 32px; height: 32px; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .order-layout { grid-template-columns: 1fr; }
  .content { padding: 1rem; }
}
</style>
