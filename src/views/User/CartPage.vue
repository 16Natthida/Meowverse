<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { getUser } = useAuth()
const currentUser = computed(() => getUser())

const cartItems = ref([])
const loading = ref(true)
const error = ref(null)
const notice = ref({ msg: '', type: '' })
const updatingId = ref(null)
const deletingId = ref(null)

// ── FETCH CART ──
const fetchCart = async () => {
  const user = currentUser.value
  if (!user?.id) {
    router.push('/login')
    return
  }
  try {
    loading.value = true
    error.value = null
    const res = await fetch(`http://localhost:3001/api/cart?user_id=${user.id}`)
    if (!res.ok) throw new Error(`ดึงข้อมูลตะกร้าไม่สำเร็จ (${res.status})`)
    const data = await res.json()
    // รองรับทั้ง array และ { items: [...] }
    const arr = Array.isArray(data) ? data : (data.items ?? data.data ?? [])
    cartItems.value = arr.map((item) => ({
      cart_id: item.cart_id,
      user_id: item.user_id,
      prod_id: item.prod_id,
      pre_item_id: item.pre_item_id,
      qty: Number(item.qty) || 1,
      // product info joined from backend
      name: item.name ?? item.prod_name ?? item.product_name ?? 'สินค้า',
      price: Number(item.price ?? item.basePrice ?? item.unit_price ?? 0),
      image: item.image ?? item.imageUrl ?? item.imageUrls?.[0] ?? item.images?.[0] ?? null,
      flavor: item.flavor ?? '',
      isPreorder: Boolean(item.pre_item_id) || item.item_type === 'preorder',
      stock: Number(item.stock ?? 999),
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// ── UPDATE QTY ──
const updateQty = async (item, newQty) => {
  if (newQty < 1) return
  if (newQty > item.stock) {
    showNotice(`สต็อกมีเพียง ${item.stock} ชิ้น`, 'warn')
    return
  }
  updatingId.value = item.cart_id
  try {
    const res = await fetch(`http://localhost:3001/api/cart/${item.cart_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: newQty }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
    }
    item.qty = newQty
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    updatingId.value = null
  }
}

// ── REMOVE ITEM ──
const removeItem = async (item) => {
  deletingId.value = item.cart_id
  try {
    const res = await fetch(`http://localhost:3001/api/cart/${item.cart_id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
    }
    cartItems.value = cartItems.value.filter((i) => i.cart_id !== item.cart_id)
    showNotice(`ลบ "${item.name}" ออกจากตะกร้าแล้ว`, 'success')
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    deletingId.value = null
  }
}

// ── COMPUTED ──
const subtotal = computed(() => cartItems.value.reduce((sum, i) => sum + i.price * i.qty, 0))
const total = computed(() => subtotal.value)

let noticeTimer = null
function showNotice(msg, type = 'success') {
  notice.value = { msg, type }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = { msg: '', type: '' }
  }, 3500)
}

function goBack() {
  router.push('/')
}

onMounted(fetchCart)
</script>

<template>
  <div class="cart-page">
    <!-- ── NAVBAR ── -->
    <nav class="navbar">
      <button class="back-btn" @click="goBack">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="back-icon"
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        กลับร้านค้า
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
          stroke-linecap="round"
          stroke-linejoin="round"
          class="title-cart-icon"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.69l1.38-7.31H6" />
        </svg>
        ตะกร้าสินค้า
        <span v-if="cartItems.length > 0" class="item-count">({{ cartItems.length }} รายการ)</span>
      </div>
    </nav>

    <!-- ── NOTICE ── -->
    <transition name="slide-down">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">
        <svg
          v-if="notice.type === 'success'"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="notice-icon"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <svg
          v-else-if="notice.type === 'error'"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="notice-icon"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          />
        </svg>
        <svg v-else viewBox="0 0 20 20" fill="currentColor" class="notice-icon">
          <path
            fill-rule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        {{ notice.msg }}
      </div>
    </transition>

    <!-- ── CONTENT ── -->
    <div class="content">
      <!-- Loading -->
      <div v-if="loading" class="state-wrap">
        <svg class="spin state-icon" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(111,80,160,0.2)" stroke-width="3" />
          <path
            d="M12 2a10 10 0 0110 10"
            stroke="#9a7dbf"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
        <p class="state-msg">กำลังโหลดตะกร้าสินค้า...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn btn--primary" @click="fetchCart">ลองใหม่</button>
      </div>

      <!-- Empty -->
      <div v-else-if="cartItems.length === 0" class="state-wrap empty-wrap">
        <div class="empty-emoji">🛒</div>
        <h2 class="empty-title">ตะกร้าของคุณว่างเปล่า</h2>
        <p class="empty-sub">เลือกสินค้าสักชิ้นใส่ตะกร้าก่อนนะครับ</p>
        <button class="btn btn--primary" @click="goBack">เลือกซื้อสินค้า</button>
      </div>

      <!-- Cart items + summary -->
      <div v-else class="cart-layout">
        <!-- LEFT: item list -->
        <div class="cart-items">
          <div class="section-header">
            <h2 class="section-title">รายการสินค้า</h2>
          </div>

          <transition-group name="list" tag="div" class="item-list">
            <div
              v-for="item in cartItems"
              :key="item.cart_id"
              :class="['cart-item', { 'cart-item--deleting': deletingId === item.cart_id }]"
            >
              <!-- Thumbnail -->
              <div class="item-img">
                <img v-if="item.image" :src="item.image" :alt="item.name" />
                <span v-else class="item-emoji">🐾</span>
                <span v-if="item.isPreorder" class="item-preorder-badge">พรีออเดอร์</span>
              </div>

              <!-- Info -->
              <div class="item-info">
                <p class="item-name">{{ item.name }}</p>
                <p v-if="item.flavor" class="item-flavor">รสชาติ: {{ item.flavor }}</p>
                <p class="item-price-unit">฿{{ Number(item.price).toLocaleString() }} / ชิ้น</p>
              </div>

              <!-- Qty controls -->
              <div class="item-qty">
                <button
                  class="qty-btn"
                  :disabled="item.qty <= 1 || updatingId === item.cart_id"
                  @click="updateQty(item, item.qty - 1)"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path
                      fill-rule="evenodd"
                      d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>

                <span v-if="updatingId === item.cart_id" class="qty-loading">
                  <svg class="spin" viewBox="0 0 24 24" fill="none" width="14" height="14">
                    <circle cx="12" cy="12" r="10" stroke="rgba(111,80,160,0.2)" stroke-width="3" />
                    <path
                      d="M12 2a10 10 0 0110 10"
                      stroke="#9a7dbf"
                      stroke-width="3"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <span v-else class="qty-value">{{ item.qty }}</span>

                <button
                  class="qty-btn"
                  :disabled="item.qty >= item.stock || updatingId === item.cart_id"
                  @click="updateQty(item, item.qty + 1)"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path
                      fill-rule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <!-- Subtotal -->
              <div class="item-subtotal">฿{{ (item.price * item.qty).toLocaleString() }}</div>

              <!-- Delete -->
              <button
                class="delete-btn"
                :disabled="deletingId === item.cart_id"
                @click="removeItem(item)"
                title="ลบออก"
              >
                <svg
                  v-if="deletingId === item.cart_id"
                  class="spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  width="16"
                  height="16"
                >
                  <circle cx="12" cy="12" r="10" stroke="rgba(232,64,92,0.2)" stroke-width="3" />
                  <path
                    d="M12 2a10 10 0 0110 10"
                    stroke="#e8405c"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                </svg>
                <svg v-else viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path
                    fill-rule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </transition-group>
        </div>

        <!-- RIGHT: order summary -->
        <aside class="cart-summary">
          <div class="summary-card">
            <h3 class="summary-title">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="18"
                height="18"
              >
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              สรุปคำสั่งซื้อ
            </h3>

            <div class="summary-rows">
              <div class="summary-row">
                <span>ราคาสินค้า</span>
                <span>฿{{ subtotal.toLocaleString() }}</span>
              </div>
              <div class="summary-divider"></div>
              <div class="summary-row summary-row--total">
                <span>ยอดรวมทั้งหมด</span>
                <span class="total-price">฿{{ total.toLocaleString() }}</span>
              </div>
            </div>

            <button class="btn-checkout">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="18"
                height="18"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              ดำเนินการสั่งซื้อ
            </button>

            <button class="btn-continue" @click="goBack">← เลือกสินค้าเพิ่ม</button>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cart-page {
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

/* ── NAVBAR ── */
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
  gap: 0.4rem;
  flex-shrink: 0;
}
.logo-icon {
  font-size: 1.4rem;
}
.logo-text {
  font-weight: 900;
  font-size: 1.05rem;
  color: var(--primary);
}
.navbar__title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary-dark);
}
.title-cart-icon {
  width: 20px;
  height: 20px;
  stroke: var(--primary);
}
.item-count {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
}

/* ── NOTICE ── */
.notice {
  position: fixed;
  top: 66px;
  right: 1.5rem;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 12px;
  padding: 0.65rem 1rem;
  font-size: 0.86rem;
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(89, 61, 125, 0.14);
  border: 1px solid;
}
.notice--success {
  background: linear-gradient(160deg, #f0fdf5, #e4f8ef);
  border-color: #bcebd8;
  color: #1f7a5a;
}
.notice--error {
  background: linear-gradient(160deg, #fef2f2, #fde9e9);
  border-color: #f3cbcb;
  color: #8f3131;
}
.notice--warn {
  background: linear-gradient(160deg, #fffbeb, #fff8dd);
  border-color: #f5e8ad;
  color: #7d5e23;
}
.notice-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ── CONTENT ── */
.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

/* ── STATES ── */
.state-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 5rem 1rem;
}
.state-icon {
  width: 36px;
  height: 36px;
}
.state-msg {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}
.error-box {
  background: #fde9e9;
  border: 1px solid #f3cbcb;
  border-radius: 10px;
  padding: 0.7rem 1.2rem;
  color: #8f3131;
  font-size: 0.86rem;
  font-weight: 700;
}
.empty-wrap {
  gap: 0.75rem;
}
.empty-emoji {
  font-size: 4rem;
}
.empty-title {
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--primary-dark);
  margin: 0;
}
.empty-sub {
  font-size: 0.88rem;
  color: var(--muted);
  margin: 0;
}

/* ── LAYOUT ── */
.cart-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1.5rem;
  align-items: start;
}

/* ── CART ITEMS ── */
.cart-items {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.section-header {
  margin-bottom: 0.4rem;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--primary-dark);
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.cart-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.96), rgba(251, 246, 255, 0.9));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  box-shadow: 0 4px 14px rgba(79, 62, 108, 0.07);
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.cart-item--deleting {
  opacity: 0.4;
  transform: scale(0.97);
  pointer-events: none;
}

/* Item image */
.item-img {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f3effa, #fde9f3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}
.item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-emoji {
  font-size: 2rem;
}
.item-preorder-badge {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff2d9;
  color: #9b6210;
  border: 1px solid #f7ddb0;
  font-size: 0.6rem;
  font-weight: 800;
  padding: 0.1rem 0.38rem;
  border-radius: 999px;
  white-space: nowrap;
}

/* Item info */
.item-info {
  flex: 1;
  min-width: 0;
}
.item-name {
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--primary-dark);
  margin: 0 0 0.22rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-flavor {
  margin: 0 0 0.15rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: #8b7ba3;
}
.item-price-unit {
  font-size: 0.78rem;
  color: var(--muted);
  margin: 0;
  font-weight: 700;
}

/* Qty controls */
.item-qty {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #dcc8f5;
  background: linear-gradient(160deg, #f8f2ff, #f0e6ff);
  color: var(--primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
  flex-shrink: 0;
}
.qty-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  border-color: #b788ea;
}
.qty-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.qty-value {
  font-size: 0.92rem;
  font-weight: 900;
  color: var(--primary-dark);
  min-width: 24px;
  text-align: center;
}
.qty-loading {
  min-width: 24px;
  display: flex;
  justify-content: center;
}

/* Item subtotal */
.item-subtotal {
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary-dark);
  flex-shrink: 0;
  min-width: 80px;
  text-align: right;
}

/* Delete */
.delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #f3cbcb;
  background: linear-gradient(160deg, #fff0f0, #ffe8eb);
  color: #c0404a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
  flex-shrink: 0;
}
.delete-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #ff6b8a, #e8405c);
  color: #fff;
  border-color: #e8405c;
  box-shadow: 0 4px 12px rgba(232, 64, 92, 0.3);
}
.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── SUMMARY ── */
.cart-summary {
  position: sticky;
  top: 74px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.summary-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.97), rgba(251, 246, 255, 0.95));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.4rem;
  box-shadow: 0 8px 24px rgba(79, 62, 108, 0.1);
}
.summary-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary-dark);
  margin: 0 0 1.2rem;
  stroke: var(--primary);
}
.summary-rows {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 1.3rem;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--muted);
}
.summary-row--total {
  color: var(--primary-dark);
  font-size: 1rem;
}
.total-price {
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--primary-dark);
}
.summary-divider {
  border: none;
  border-top: 1px dashed #e2d5f0;
  margin: 0.3rem 0;
}

.btn-checkout {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid #b788ea;
  background: linear-gradient(180deg, #cda2fb, #b97be8);
  color: #fff;
  font-family: inherit;
  font-weight: 900;
  font-size: 0.96rem;
  cursor: pointer;
  transition: all 0.22s;
  box-shadow: 0 8px 18px rgba(132, 86, 179, 0.28);
  margin-bottom: 0.6rem;
}
.btn-checkout:hover {
  transform: translateY(-1px);
  box-shadow: 0 11px 22px rgba(132, 86, 179, 0.35);
}

.btn-continue {
  width: 100%;
  padding: 0.55rem;
  border: 1px solid #dcc8f5;
  border-radius: var(--radius-sm);
  background: linear-gradient(160deg, #f8f2ff, #f0e6ff);
  color: var(--primary);
  font-family: inherit;
  font-weight: 800;
  font-size: 0.84rem;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-continue:hover {
  background: #ece0ff;
  border-color: #c9adf0;
}

/* ── SHIPPING PROGRESS ── */
.ship-progress-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.97), rgba(251, 246, 255, 0.95));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
  box-shadow: 0 4px 14px rgba(79, 62, 108, 0.07);
}
.ship-free {
  border-color: #bcebd8;
  background: linear-gradient(165deg, #f0fdf5, #e4f8ef);
}
.ship-progress-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--muted);
  margin: 0 0 0.55rem;
}
.ship-free .ship-progress-label {
  color: #1f7a5a;
}
.ship-bar-bg {
  height: 6px;
  background: #eadff5;
  border-radius: 999px;
  overflow: hidden;
}
.ship-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #cda2fb, #b97be8);
  border-radius: 999px;
  transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.ship-free .ship-bar-fill {
  background: linear-gradient(90deg, #6ee7b7, #34d399);
}

/* ── SHARED BUTTONS ── */
.btn {
  padding: 0.55rem 1.3rem;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 800;
  font-size: 0.84rem;
  cursor: pointer;
  transition: all 0.22s;
  border: none;
}
.btn--primary {
  background: linear-gradient(180deg, #cda2fb, #b97be8);
  color: #fff;
  box-shadow: 0 8px 18px rgba(132, 86, 179, 0.28);
}
.btn--primary:hover {
  transform: translateY(-1px);
}

/* ── ANIMATIONS ── */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.8s linear infinite;
}

.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.35s ease;
}
.list-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
.list-leave-active {
  position: absolute;
  width: 100%;
}

/* ── RESPONSIVE ── */
@media (max-width: 900px) {
  .cart-layout {
    grid-template-columns: 1fr;
  }
  .cart-summary {
    position: static;
  }
}
@media (max-width: 600px) {
  .content {
    padding: 1rem;
  }
  .cart-item {
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .item-img {
    width: 56px;
    height: 56px;
  }
  .item-subtotal {
    flex: 1;
    text-align: right;
  }
  .navbar {
    padding: 0 1rem;
  }
  .navbar__title {
    font-size: 0.88rem;
  }
}
</style>
