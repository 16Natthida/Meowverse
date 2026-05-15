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
const itemsTotal = computed(() =>
  Number(
    order.value?.items?.reduce(
      (sum, item) => sum + Number(item.Price || item.unit_price || 0) * Number(item.qty || 0),
      0,
    ) ||
      order.value?.total_amount ||
      0,
  ),
)

const slipFile = ref(null)
const slipPreview = ref(null)
const selectedPaymentMethod = ref('bank_transfer')

const paymentMethods = [
  { id: 'bank_transfer', name: 'โอนเงินผ่านธนาคาร', icon: '🏦' },
  { id: 'promptpay', name: 'พร้อมเพย์', icon: '📱' },
]

const shippingInfo = ref({ name: '', phone: '', address: '', notes: '' })

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
    if (data.Order_type && data.Order_type !== 'Ready') {
      // If not ready stock, redirect to the appropriate payment page
      if (String(data.Order_type).toLowerCase() === 'preorder') {
        router.replace(`/preorder-payment/${orderId}`)
        return
      }
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
  if (!shippingInfo.value.name || !shippingInfo.value.phone || !shippingInfo.value.address) {
    showNotice('กรุณากรอกข้อมูลการจัดส่งให้ครบถ้วน', 'error')
    return
  }

  try {
    loading.value = true
    const formData = new FormData()
    formData.append('payment_method', selectedPaymentMethod.value)
    formData.append('slip', slipFile.value)
    formData.append('shipping_name', shippingInfo.value.name)
    formData.append('shipping_phone', shippingInfo.value.phone)
    formData.append('shipping_address', shippingInfo.value.address)
    formData.append('notes', shippingInfo.value.notes || '')

    const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/payment`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null)
      throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล')
    }

    showNotice('ส่งหลักฐานเรียบร้อย! รอการตรวจสอบจากทีมงาน', 'success')
    setTimeout(() => router.push('/order-list'), 2000)
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
        <span class="back-btn__icon">←</span>
        <span class="back-btn__text">กลับรายการออเดอร์</span>
      </button>
      <div class="navbar__logo">
        <span class="logo-mark">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>
    </nav>

    <transition name="slide-down">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">{{ notice.msg }}</div>
    </transition>

    <div class="content">
      <div v-if="loading && !order" class="state-wrap state-wrap--loading">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูลการชำระเงิน...</p>
      </div>
      <div v-else-if="error" class="state-wrap state-wrap--error">
        <p class="error-title">เกิดข้อผิดพลาด</p>
        <p class="error-text">{{ error }}</p>
      </div>

      <div v-else-if="order" class="order-layout">
        <div class="order-details">
          <section class="hero-card">
            <div class="hero-copy">
              <div class="hero-badges">
                <span class="hero-chip hero-chip--soft">Ready stock</span>
                <span class="hero-chip">Order #{{ order.order_id }}</span>
              </div>
              <h1>ชำระเงินสำหรับคำสั่งพร้อมส่ง</h1>
              <p class="hero-subtitle">
                ตรวจรายการสินค้า แนบสลิป และกรอกข้อมูลจัดส่งให้ครบก่อนกดยืนยันคำสั่งซื้อ
              </p>
              <div class="hero-meta">
                <div class="hero-meta-item">
                  <span class="hero-meta-label">รายการ</span>
                  <strong>{{ order.items?.length || 0 }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">ยอดรวม</span>
                  <strong>฿{{ itemsTotal.toLocaleString() }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">สถานะ</span>
                  <strong class="hero-meta-status">รอชำระเงิน</strong>
                </div>
              </div>
            </div>
          </section>

          <div class="section-card">
            <div class="section-header">
              <h2 class="section-title">🛍️ รายการสินค้า</h2>
              <span class="section-pill">{{ order.items?.length || 0 }} รายการ</span>
            </div>
            <div class="item-list">
              <div v-for="it in order.items" :key="it.detail_id" class="order-item">
                <div class="item-img">
                  <img v-if="it.image" :src="it.image" /><span v-else>🐾</span>
                </div>
                <div class="item-info">
                  <p class="item-name">{{ it.name }}</p>
                  <p class="item-price-small">
                    ราคา ฿{{ Number(it.Price || it.unit_price || 0).toLocaleString() }} / ชิ้น
                  </p>
                </div>
                <div class="item-meta">
                  <div class="item-qty">x{{ it.qty }}</div>
                  <div class="item-total">
                    ฿{{
                      (Number(it.Price || it.unit_price || 0) * Number(it.qty)).toLocaleString()
                    }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-card form-panel">
            <div class="section-header section-header--stacked">
              <h3 class="section-title">📬 ข้อมูลจัดส่ง</h3>
              <span class="section-caption">ตรวจสอบให้ครบก่อนส่ง</span>
            </div>
            <div class="order-info">
              <div class="field-group">
                <label for="recipient-name">ชื่อผู้รับ</label>
                <input
                  id="recipient-name"
                  v-model="shippingInfo.name"
                  placeholder="ระบุชื่อ-นามสกุล"
                />
              </div>
              <div class="field-group field-group--two-cols">
                <div>
                  <label for="recipient-phone">โทร</label>
                  <input
                    id="recipient-phone"
                    v-model="shippingInfo.phone"
                    placeholder="08x-xxx-xxxx"
                  />
                </div>
                <div>
                  <label for="shipping-notes">หมายเหตุ</label>
                  <input
                    id="shipping-notes"
                    v-model="shippingInfo.notes"
                    placeholder="เช่น ฝากไว้หน้าบ้าน"
                  />
                </div>
              </div>
              <div class="field-group">
                <label for="recipient-address">ที่อยู่</label>
                <textarea
                  id="recipient-address"
                  v-model="shippingInfo.address"
                  rows="4"
                  placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="payment-section">
          <div class="payment-sticky">
            <div class="section-card glass-card payment-panel">
              <h3 class="section-title">💳 วิธีการชำระเงิน</h3>
              <div class="payment-methods">
                <div
                  v-for="method in paymentMethods"
                  :key="method.id"
                  class="payment-method"
                  :class="{ 'payment-method--selected': selectedPaymentMethod === method.id }"
                  @click="selectedPaymentMethod = method.id"
                >
                  <span class="method-icon">{{ method.icon }}</span>
                  <span class="method-name">{{ method.name }}</span>
                </div>
              </div>

              <div class="section-divider"></div>

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
                    <span class="upload-icon">⬆</span>
                    <span>คลิกเพื่ออัปโหลดสลิป</span>
                    <small>รองรับ JPG, PNG, WEBP ไม่เกิน 5MB</small>
                  </div>
                  <div v-else class="preview-box">
                    <img :src="slipPreview" class="slip-preview" />
                    <div class="edit-overlay">แตะเพื่อเปลี่ยนรูปภาพ</div>
                  </div>
                </label>
              </div>
            </div>

            <div class="section-card summary-card summary-card--wide summary-card--compact">
              <div class="summary-header">
                <span class="summary-label">ยอดรวม</span>
                <strong class="summary-amount"
                  >฿{{ Number(order.total_amount).toLocaleString() }}</strong
                >
              </div>
              <div class="summary-note">ชำระด้วยสลิปโอนเงิน แล้วแอดมินจะตรวจสอบให้ทันที</div>
              <hr class="divider" />
              <button class="btn-checkout" @click="confirmPayment" :disabled="loading">
                {{ loading ? 'กำลังประมวลผล...' : 'ยืนยันการชำระเงิน' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-summary-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(124, 92, 219, 0.12), transparent 30%),
    radial-gradient(circle at top right, rgba(255, 193, 113, 0.14), transparent 24%),
    linear-gradient(180deg, #fcfbff 0%, #f4efff 100%);
  color: #35235b;
}
.navbar {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 1rem;
  background: #fff;
  border-bottom: 1px solid #eadff5;
  box-shadow: 0 8px 28px rgba(111, 80, 160, 0.08);
  backdrop-filter: blur(12px);
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  height: 40px;
  padding: 0 0.95rem;
  border: 1px solid rgba(111, 80, 160, 0.18);
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff 0%, #f7f2ff 100%);
  color: #5f3fa8;
  font-weight: 800;
  font-size: 0.92rem;
  box-shadow: 0 8px 20px rgba(111, 80, 160, 0.08);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}
.back-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(111, 80, 160, 0.14);
  border-color: rgba(111, 80, 160, 0.28);
  background: linear-gradient(180deg, #ffffff 0%, #f1e9ff 100%);
}
.back-btn:active {
  transform: translateY(0);
  box-shadow: 0 6px 16px rgba(111, 80, 160, 0.1);
}
.back-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #efe4ff;
  color: #6f50a0;
  font-size: 0.95rem;
  line-height: 1;
  flex-shrink: 0;
}
.back-btn__text {
  line-height: 1;
  white-space: nowrap;
}
.navbar__logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: #6f50a0;
  margin-left: auto;
}
.logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #f0e6ff, #e7dbff);
}
.logo-text {
  letter-spacing: 0.2px;
}
.content {
  max-width: 1180px;
  margin: 2rem auto 2.5rem;
  padding: 0 1rem;
}
.order-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 320px;
  gap: 1.25rem;
  align-items: start;
}
.section-card {
  background: #fff;
  border: 1px solid #eadff5;
  border-radius: 18px;
  padding: 1.2rem;
  box-shadow: 0 14px 38px rgba(111, 80, 160, 0.08);
}
.form-panel {
  margin-top: 1rem;
}
.hero-card {
  padding: 1.45rem;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.45), transparent 30%),
    linear-gradient(135deg, rgba(111, 80, 160, 0.16), rgba(124, 99, 216, 0.2));
  border: 1px solid rgba(111, 80, 160, 0.14);
  box-shadow: 0 18px 44px rgba(111, 80, 160, 0.1);
  margin-bottom: 1rem;
}
.hero-copy h1 {
  margin: 0.55rem 0 0.4rem;
  font-size: 1.8rem;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #2f1f54;
}
.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  color: #593b8f;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(111, 80, 160, 0.12);
}
.hero-chip--soft {
  background: #f4edff;
}
.hero-subtitle {
  margin: 0;
  color: #5f507f;
  max-width: 60ch;
  line-height: 1.65;
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(111, 80, 160, 0.1);
  overflow: auto;
}
.hero-meta-item {
  min-width: 0;
}
.hero-meta-label {
  display: block;
  font-size: 0.74rem;
  font-weight: 700;
  color: #7d6e9a;
  margin-bottom: 0.15rem;
}
.hero-meta-item strong {
  font-size: 1rem;
  color: #2f1f54;
}
.hero-meta-status {
  color: #6f50a0 !important;
}
.hero-meta-divider {
  width: 1px;
  height: 28px;
  background: rgba(111, 80, 160, 0.14);
  flex: 0 0 auto;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}
.section-header--stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.order-item {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.95rem;
  padding: 0.85rem;
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfaff 0%, #f8f5ff 100%);
  border: 1px solid #ede4fb;
}
.item-img {
  width: 58px;
  height: 58px;
  background: #f0e6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
}
.item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}
.item-name {
  margin: 0;
  color: #2f1f54;
  font-size: 0.96rem;
  line-height: 1.35;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-price-small {
  margin: 0;
  color: #7d6e9a;
  font-size: 0.8rem;
  line-height: 1.35;
}
.item-meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-left: 0.5rem;
  white-space: nowrap;
}
.item-qty {
  min-width: 44px;
  text-align: center;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  background: #f0e6ff;
  color: #6f50a0;
  font-weight: 800;
  font-size: 0.82rem;
}
.item-total {
  color: #35235b;
  font-weight: 900;
  font-size: 1rem;
}
.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.payment-method {
  padding: 12px 14px;
  border: 1.5px solid #eadff5;
  border-radius: 14px;
  cursor: pointer;
  background: linear-gradient(180deg, #fff 0%, #faf7ff 100%);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.payment-method:hover {
  border-color: #7c63d8;
  box-shadow: 0 10px 22px rgba(124, 99, 216, 0.12);
  transform: translateY(-1px);
}
.payment-method--selected {
  border-color: #6f50a0;
  background: linear-gradient(135deg, #f0e6ff, #f8f3ff);
}
.section-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #e7dbff, transparent);
  margin: 0.25rem 0 0.5rem;
}
.upload-area {
  border: 2px dashed #d8c6f2;
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(180deg, #fcfbff 0%, #f8f5ff 100%);
}
.hidden-input {
  display: none;
}
.upload-label {
  cursor: pointer;
  display: block;
}
.upload-prompt {
  padding: 30px 16px;
  text-align: center;
  color: #6f50a0;
  font-weight: 800;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.35rem;
  justify-items: center;
}
.upload-icon {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f0e6ff;
  color: #6f50a0;
  font-size: 1.1rem;
}
.upload-prompt small {
  font-size: 0.78rem;
  color: #846fa8;
  font-weight: 600;
}
.preview-box {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
}
.slip-preview {
  width: 100%;
  max-height: 250px;
  object-fit: cover;
  display: block;
}
.edit-overlay {
  position: absolute;
  inset: auto 0 0 0;
  background: linear-gradient(180deg, rgba(111, 80, 160, 0) 0%, rgba(111, 80, 160, 0.88) 100%);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.8rem;
  text-align: center;
}
.order-info {
  display: grid;
  gap: 0.85rem;
}
.field-group {
  display: grid;
  gap: 0.35rem;
}
.field-group--two-cols {
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
}
.field-group label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #5a487c;
}
.field-group input,
.field-group textarea {
  width: 100%;
  border: 1.5px solid #dbcdef;
  background: #fff;
  border-radius: 12px;
  padding: 0.85rem 0.95rem;
  font: inherit;
  color: #342552;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.field-group input:focus,
.field-group textarea:focus {
  border-color: #7c63d8;
  box-shadow: 0 0 0 4px rgba(124, 99, 216, 0.12);
}
.field-group textarea {
  resize: vertical;
  min-height: 110px;
}
.glass-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(249, 245, 255, 0.98));
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary-card--compact {
  padding-top: 1.05rem;
}
.summary-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.summary-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #7d6e9a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.summary-amount {
  font-size: 1.5rem;
  line-height: 1;
  color: #6f50a0;
}
.summary-note {
  color: #7d6e9a;
  font-size: 0.86rem;
  line-height: 1.5;
}
.section-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6f50a0;
  background: #f0e6ff;
}
.btn-checkout {
  padding: 14px 16px;
  background: linear-gradient(160deg, #a17df2, #6f50a0);
  color: #fff;
  border: none;
  border-radius: 14px;
  font-weight: 800;
  box-shadow: 0 12px 26px rgba(111, 80, 160, 0.22);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}
.btn-checkout:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px rgba(111, 80, 160, 0.3);
}
.btn-checkout:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}
.state-wrap {
  min-height: 280px;
  display: grid;
  place-items: center;
  text-align: center;
  color: #6d5c8f;
}
.state-wrap--error {
  border: 1px solid #f1c7d0;
  background: #fff7f9;
  border-radius: 18px;
  padding: 2rem;
}
.error-title {
  margin: 0 0 0.25rem;
  color: #b91c1c;
  font-weight: 800;
}
.error-text {
  margin: 0;
}
.loader {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 4px solid rgba(111, 80, 160, 0.16);
  border-top-color: #6f50a0;
  animation: spin 0.9s linear infinite;
  margin-bottom: 0.8rem;
}
.payment-sticky {
  position: sticky;
  top: 76px;
  display: grid;
  gap: 1rem;
}
.payment-section {
  align-self: start;
}
.payment-panel {
  padding: 1.2rem;
}
.summary-card--wide {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary-card--wide .summary-row {
  font-size: 1rem;
}
.summary-card--wide .btn-checkout {
  margin-top: 0.2rem;
}
.notice {
  position: fixed;
  top: 76px;
  right: 20px;
  z-index: 30;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e6dcf6;
  box-shadow: 0 12px 30px rgba(111, 80, 160, 0.16);
  color: #3b2c5c;
  border-radius: 999px;
  padding: 0.8rem 1rem;
  backdrop-filter: blur(10px);
}
.notice--success {
  border-color: rgba(16, 185, 129, 0.28);
}
.notice--error {
  border-color: rgba(239, 68, 68, 0.28);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1024px) {
  .order-layout {
    grid-template-columns: 1fr;
  }
  .hero-card {
    padding: 1.25rem;
  }
  .payment-sticky {
    position: static;
  }
  .payment-section {
    order: -1;
  }
}
@media (max-width: 768px) {
  .content {
    margin-top: 1rem;
  }
  .section-card,
  .hero-card {
    border-radius: 16px;
  }
  .field-group--two-cols {
    grid-template-columns: 1fr;
  }
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .hero-copy h1 {
    font-size: 1.45rem;
  }
  .hero-meta {
    flex-wrap: wrap;
  }
  .hero-meta-divider {
    display: none;
  }
  .form-panel {
    margin-top: 0.8rem;
  }
  .order-item {
    grid-template-columns: 58px minmax(0, 1fr);
    align-items: start;
  }
  .item-meta {
    grid-column: 2 / -1;
    justify-content: space-between;
    padding-left: 0;
    margin-top: 0.15rem;
  }
  .navbar {
    padding-inline: 0.75rem;
  }
  .back-btn {
    padding: 0 0.8rem;
    font-size: 0.86rem;
    gap: 0.45rem;
  }
}
</style>
