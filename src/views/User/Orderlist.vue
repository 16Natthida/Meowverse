<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

defineOptions({
  name: 'UserOrderList',
})

const router = useRouter()
const { getUser, logout } = useAuth()
const currentUser = computed(() => getUser())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

// ── NAVBAR (mirrors the shared navbar in UserDashboard.vue for visual/behavioral consistency) ──
const defaultLogoImageUrl = ''
const logoImage = ref(defaultLogoImageUrl)
const searchQuery = ref('')
const cartCount = ref(0)
const showUserMenu = ref(false)
const userMenuRef = ref(null)
const tabs = ['หน้าหลัก', 'พร้อมส่ง', 'พรีออเดอร์', 'รายการออเดอร์']
const activeTab = ref('รายการออเดอร์')

function handleTabClick(tab) {
  if (tab === 'รายการออเดอร์') return
  router.push('/')
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function closeUserMenu() {
  showUserMenu.value = false
}

function goToUserProfile() {
  closeUserMenu()
  router.push('/profile')
}

function goToMyOrders() {
  closeUserMenu()
  router.push('/order-list')
}

function goToCart() {
  router.push('/cart')
}

function handleOutsideClick(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    closeUserMenu()
  }
}

function handleLogout() {
  if (typeof logout === 'function') {
    logout()
  }
  router.push('/login')
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

const orders = ref([])
const loading = ref(true)
const error = ref(null)

// ── STATUS CONFIG ──
const statusConfig = {
  Pending: { label: 'รอชำระ', color: '#d97706', bg: '#fef3e2' },
  Paid: { label: 'ชำระแล้ว', color: '#16a34a', bg: '#e9f9ef' },
  Slip_submitted: { label: 'แนบสลิปแล้ว รอตรวจสอบ', color: '#2563eb', bg: '#eaf1fd' },
  Import_slip_submitted: { label: 'แนบสลิปค่านำเข้าแล้ว รอตรวจสอบ', color: '#2563eb', bg: '#eaf1fd' },
  Wait_for_Import_Fee: { label: 'รอนำเข้า', color: '#8b5cf6', bg: '#f2ecfd' },
  Pending_import_fee: { label: 'รอชำระค่านำเข้า', color: '#7c3aed', bg: '#efe7fc' },
  Ready_to_Ship: { label: 'พร้อมจัดส่ง', color: '#0891b2', bg: '#e5f6f9' },
  Shipped: { label: 'ดำเนินการส่ง', color: '#0891b2', bg: '#e5f6f9' },
  Completed: { label: 'จัดส่งสำเร็จ', color: '#16a34a', bg: '#e9f9ef' },
  Cancelled: { label: 'ยกเลิกแล้ว', color: '#ef4444', bg: '#fdeded' },
  'Invalid slip': { label: 'สลิปไม่ถูกต้อง', color: '#ef4444', bg: '#fdeded' },
  Invalid_Slip: { label: 'สลิปไม่ถูกต้อง', color: '#ef4444', bg: '#fdeded' },
  'Invalid import slip': { label: 'สลิปค่านำเข้าไม่ถูกต้อง', color: '#ef4444', bg: '#fdeded' },
  Invalid_import_slip: { label: 'สลิปค่านำเข้าไม่ถูกต้อง', color: '#ef4444', bg: '#fdeded' },
}

function getStatus(status) {
  const normalized = String(status || '').trim()
  if (statusConfig[normalized]) return statusConfig[normalized]
  const lower = normalized.toLowerCase()
  const matchedKey = Object.keys(statusConfig).find((key) => key.toLowerCase() === lower)
  if (matchedKey) return statusConfig[matchedKey]
  return { label: normalized || 'ไม่ทราบสถานะ', color: '#8a7c6c', bg: '#f2ede4' }
}

// ── NOTIFICATION DOT HELPERS ──
const RED_DOT_STATUSES = ['Pending', 'Pending_import_fee', 'Cancelled', 'Invalid slip', 'Invalid import slip']
const GREEN_DOT_STATUSES = ['Paid', 'Ready_to_Ship']

function hasRedDot(status) {
  const normalized = String(status || '').trim()
  return RED_DOT_STATUSES.some(
    (s) => s.toLowerCase() === normalized.toLowerCase()
  )
}

function hasGreenDot(status) {
  const normalized = String(status || '').trim()
  return GREEN_DOT_STATUSES.some(
    (s) => s.toLowerCase() === normalized.toLowerCase()
  )
}

function isInvalidSlipStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[_\s]+/g, ' ')
  return normalized === 'invalid slip' || normalized === 'invalid import slip'
}

// ── FETCH ORDERS ──
const fetchOrders = async () => {
  const userId = currentUser.value?.id ?? currentUser.value?.user_id
  if (!userId) return

  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/orders?user_id=${userId}`)
    if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลออเดอร์ได้ (${res.status})`)
    const data = await res.json()
    orders.value = Array.isArray(data) ? data : (data.orders ?? [])
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 💡 จุดที่แก้ไข 1: ปรับ Logic การเปลี่ยนหน้าตรวจสอบว่าเป็น Ready หรือ Preorder
function goToOrder(order) {
  const orderId = order.order_id
  const orderType = String(order.Order_type || '').toLowerCase()

  if (orderType === 'preorder') {
    // นำทางไปหน้าพรีออเดอร์
    router.push(`/preorder-payment/${orderId}`)
  } else {
    // นำทางไปหน้าสินค้าพร้อมส่ง
    router.push(`/ready-payment/${orderId}`)
  }
}

function goBack() {
  router.push('/')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── NAV BADGE (mirrors Dashboard's exact RED/GREEN priority logic, derived from existing orders data) ──
const NAV_RED_DOT_STATUSES = ['pending', 'pending_import_fee', 'cancelled', 'invalid_slip', 'invalid_import_slip']
const NAV_GREEN_DOT_STATUSES = ['paid', 'ready_to_ship']

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase().replace(/[\s]+/g, '_')
}

const orderNotifDot = computed(() => {
  const hasRed = orders.value.some((o) => NAV_RED_DOT_STATUSES.includes(normalizeStatus(o.status)))
  if (hasRed) return 'red'
  const hasGreen = orders.value.some((o) => NAV_GREEN_DOT_STATUSES.includes(normalizeStatus(o.status)))
  return hasGreen ? 'green' : ''
})

// ── UI-ONLY: STATUS FILTER TABS (derived purely from existing status data, no new fetch/logic) ──
const activeStatusTab = ref('all')
const statusTabs = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending_payment', label: 'รอชำระ' },
  { key: 'wait_import', label: 'รอนำเข้า' },
  { key: 'pending_import_fee', label: 'รอชำระค่านำเข้า' },
  { key: 'shipping', label: 'ดำเนินการส่ง' },
]

function matchTab(order, tabKey) {
  const normalized = String(order.status || '').trim().toLowerCase()
  switch (tabKey) {
    case 'pending_payment':
      return ['pending', 'slip_submitted', 'invalid slip', 'invalid_slip'].includes(normalized)
    case 'wait_import':
      return ['wait_for_import_fee'].includes(normalized)
    case 'pending_import_fee':
      return [
        'pending_import_fee',
        'import_slip_submitted',
        'invalid import slip',
        'invalid_import_slip',
      ].includes(normalized)
    case 'shipping':
      return ['ready_to_ship', 'shipped'].includes(normalized)
    default:
      return true
  }
}


const filteredOrders = computed(() => {
  if (activeStatusTab.value === 'all') return orders.value
  return orders.value.filter((o) => matchTab(o, activeStatusTab.value))
})

// ── UI-ONLY: PROGRESS STEP TRACKER (derived purely from existing status data) ──
const progressIcons = [
  { key: 'ordered', label: 'สั่งซื้อ' },
  { key: 'import', label: 'นำเข้า' },
  { key: 'customs', label: 'ตรวจสอบ' },
  { key: 'process', label: 'เตรียมส่ง' },
  { key: 'done', label: 'จัดส่งสำเร็จ' },
]

function getProgressStep(status) {
  const normalized = String(status || '').trim().toLowerCase()
  const cancelledStates = ['cancelled', 'invalid slip', 'invalid_slip', 'invalid import slip', 'invalid_import_slip']
  if (cancelledStates.includes(normalized)) return 0
  if (normalized === 'completed') return 5
  if (['shipped', 'ready_to_ship'].includes(normalized)) return 4
  if (['wait_for_import_fee', 'pending_import_fee', 'import_slip_submitted'].includes(normalized)) return 3
  if (normalized === 'paid') return 2
  return 1
}

// ── UI-ONLY: EXPAND/COLLAPSE EXTRA ITEMS ──
const expandedOrders = ref({})
function toggleExpand(orderId, evt) {
  evt.stopPropagation()
  expandedOrders.value[orderId] = !expandedOrders.value[orderId]
}

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div class="order-list-page">
    <!-- ── NAVBAR (mirrors UserDashboard.vue's shared navbar) ── -->
    <nav class="navbar">
      <div class="navbar__logo">
        <img v-if="logoImage" :src="logoImage" alt="Meowverse logo" class="logo-icon-img" />
        <span v-else class="logo-icon">🐱</span>
        <span class="logo-text">Meowverse</span>
      </div>

      <ul class="navbar__tabs">
        <li
          v-for="tab in tabs"
          :key="tab"
          :class="['nav-tab', { 'nav-tab--active': activeTab === tab }]"
          @click="handleTabClick(tab)"
        >
          <span class="nav-tab__label-wrap">
            {{ tab }}
            <span
              v-if="tab === 'รายการออเดอร์' && orderNotifDot === 'red'"
              class="order-notif-dot order-notif-dot--red"
            ></span>
            <span
              v-else-if="tab === 'รายการออเดอร์' && orderNotifDot === 'green'"
              class="order-notif-dot order-notif-dot--green"
            ></span>
          </span>
          <span v-if="activeTab === tab" class="nav-tab__underline" />
        </li>
      </ul>

      <div class="navbar__right">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7" />
            <path
              d="M13 13l3.5 3.5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
          <input v-model="searchQuery" type="text" placeholder="ค้นหาสินค้า" class="search-input" />
        </div>

        <button class="cart-icon-btn" @click="goToCart" title="ตะกร้าสินค้า">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="cart-icon-svg"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.69l1.38-7.31H6" />
          </svg>
          <span v-if="cartCount > 0" class="cart-badge">{{
            cartCount > 99 ? '99+' : cartCount
          }}</span>
        </button>

        <div class="user-pill" ref="userMenuRef" @click.stop="toggleUserMenu" :class="{ 'user-pill--open': showUserMenu }">
          <svg viewBox="0 0 20 20" fill="currentColor" class="pill-icon">
            <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z" />
          </svg>
          <span class="user-id">{{ currentUser?.username || 'MN0201' }}</span>
          <svg viewBox="0 0 24 24" class="user-pill__chevron" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>

          <div v-if="showUserMenu" class="user-menu">
            <button type="button" class="user-menu__item" @click="goToUserProfile">
              บัญชีของฉัน
            </button>
            <button type="button" class="user-menu__item" @click="goToMyOrders">
              การซื้อของฉัน
            </button>
          </div>
        </div>
        <button class="logout-btn" @click="handleLogout">
          <svg viewBox="0 0 20 20" fill="currentColor" class="pill-icon">
            <path
              fill-rule="evenodd"
              d="M3 4a1 1 0 011-1h6a1 1 0 010 2H5v10h5a1 1 0 010 2H4a1 1 0 01-1-1V4zm11.293 2.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L16.586 11H9a1 1 0 010-2h7.586l-1.293-1.293a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
          ออกจากระบบ
        </button>
      </div>
    </nav>

    <!-- ── HERO ── -->
    <div class="hero">
      <div class="hero__emblem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 8L12 3 3 8l9 5 9-5z"/>
          <path d="M3 8v9l9 5 9-5V8"/>
          <path d="M12 13v9"/>
        </svg>
      </div>
      <h1 class="hero__title">รายการสั่งซื้อ</h1>
    </div>

    <div class="content">
      <!-- ── STATUS FILTER TABS ── -->
      <div class="tabs" v-if="!loading && !error && orders.length">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ 'tab--active': activeStatusTab === tab.key }"
          @click="activeStatusTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="loading" class="state-wrap">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>

      <div v-else-if="error" class="state-wrap">
        <div class="error-box">{{ error }}</div>
        <button class="btn-retry" @click="fetchOrders">ลองใหม่</button>
      </div>

      <div v-else-if="orders.length === 0" class="state-wrap">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8L12 3 3 8l9 5 9-5z"/>
            <path d="M3 8v9l9 5 9-5V8"/>
            <path d="M12 13v9"/>
          </svg>
        </div>
        <p class="empty-text">ยังไม่มีรายการออเดอร์</p>
      </div>

      <div v-else>
        <div v-if="filteredOrders.length === 0" class="state-wrap state-wrap--small">
          <p class="empty-text">ไม่มีรายการในหมวดนี้</p>
        </div>

        <div class="order-cards">
          <div
            v-for="order in filteredOrders"
            :key="order.order_id"
            class="order-card"
            @click="goToOrder(order)"
          >
            <span v-if="hasRedDot(order.status)" class="notif-dot notif-dot--red" aria-label="ต้องดำเนินการ"></span>
            <span v-else-if="hasGreenDot(order.status)" class="notif-dot notif-dot--green" aria-label="อัพเดทสถานะใหม่"></span>

            <div class="order-card__head">
              <div class="order-card__id">เลขที่ใบสั่งซื้อ {{ order.order_id }}</div>
              <div class="order-card__status">
                <span class="status-label">สถานะคำสั่งซื้อ :</span>
                <span class="status-value" :style="{ color: getStatus(order.status).color }">
                  {{ getStatus(order.status).label }}
                </span>
              </div>
            </div>

            <!-- ── ITEMS ── -->
            <div class="order-items">
              <template v-if="order.items && order.items.length">
                <div
                  v-for="(item, idx) in order.items"
                  v-show="idx === 0 || expandedOrders[order.order_id]"
                  :key="item.id ?? idx"
                  class="order-item"
                >
                  <div class="order-item__img">
                    <img v-if="item.image" :src="item.image" :alt="item.name" />
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 8.5c0-1.4.6-3.6 1.6-4.8.3-.3.8-.2.9.2l.7 2.4c1.5-.6 3.2-.9 4.8-.9s3.3.3 4.8.9l.7-2.4c.1-.4.6-.5.9-.2 1 1.2 1.6 3.4 1.6 4.8 0 4.4-3.6 8-8 8s-8-3.6-8-8z"/>
                    </svg>
                  </div>
                  <div class="order-item__info">
                    <p class="order-item__name">{{ item.name }}</p>
                    <p class="order-item__variant" v-if="item.variant">{{ item.variant }}</p>
                  </div>
                  <div class="order-item__price">{{ Number(item.price).toLocaleString() }} บาท</div>
                  <div class="order-item__x">x {{ item.qty }}</div>
                  <div class="order-item__subtotal">{{ Number(item.price * item.qty).toLocaleString() }} บาท</div>
                </div>

                <button
                  v-if="order.items.length > 1"
                  type="button"
                  class="expand-toggle"
                  @click="toggleExpand(order.order_id, $event)"
                >
                  {{ expandedOrders[order.order_id] ? 'ย่อรายการ' : 'ดูสินค้าเพิ่มเติม' }}
                  <svg
                    class="expand-icon"
                    :class="{ 'expand-icon--open': expandedOrders[order.order_id] }"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </template>

              <template v-else>
                <div class="order-item order-item--placeholder">
                  <div class="order-item__img">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 8L12 3 3 8l9 5 9-5z"/>
                      <path d="M3 8v9l9 5 9-5V8"/>
                    </svg>
                  </div>
                  <div class="order-item__info">
                    <p class="order-item__name">
                      {{ order.Order_type === 'Preorder' ? 'สินค้าพรีออเดอร์' : 'สินค้าพร้อมส่ง' }}
                    </p>
                    <p class="order-item__variant">สั่งซื้อเมื่อ {{ formatDate(order.Order_date) }}</p>
                  </div>
                </div>
              </template>
            </div>

            <!-- ── INVALID SLIP ALERT ── -->
            <div v-if="isInvalidSlipStatus(order.status)" class="invalid-slip-alert">
              <span class="invalid-slip-alert__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </span>
              <div class="invalid-slip-alert__body">
                <strong>สลิปไม่ถูกต้อง กรุณาแนบสลิปใหม่</strong>
                <span>แอดมินตรวจสอบแล้วพบว่าสลิปที่แนบมาไม่ถูกต้อง กดดูรายละเอียดเพื่ออัปโหลดใหม่</span>
              </div>
            </div>

            <!-- ── PROGRESS TRACKER ── -->
            <div class="progress-track" v-if="getProgressStep(order.status) > 0">
              <template v-for="(icon, i) in progressIcons" :key="icon.key">
                <span
                  class="progress-step"
                  :class="{ 'progress-step--active': i < getProgressStep(order.status) }"
                  :title="icon.label"
                >
                  <svg v-if="icon.key === 'ordered'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                 <svg v-else-if="icon.key === 'import'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
                  <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
                  <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
                  <path d="M12 10v4"/>
                  <path d="M12 2v3"/>
                </svg>
                  <svg v-else-if="icon.key === 'customs'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M9 16h6M9 8h1"/><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
                  <svg v-else-if="icon.key === 'process'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </span>
                <span
                  v-if="i < progressIcons.length - 1"
                  class="progress-step__line"
                  :class="{ 'progress-step__line--active': i < getProgressStep(order.status) - 1 }"
                ></span>
              </template>
            </div>
            <div class="progress-track progress-track--cancelled" v-else>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>{{ getStatus(order.status).label }}</span>
            </div>

            <!-- ── META CHIPS ── -->
            <div class="meta-row" v-if="order.deadline || (order.Order_type === 'Preorder' && Number(order.import_fee_total) > 0)">
              <span v-if="order.deadline" class="meta-chip">กำหนดจ่าย {{ formatDate(order.deadline) }}</span>
              <span v-if="order.Order_type === 'Preorder' && Number(order.import_fee_total) > 0" class="meta-chip meta-chip--warn">
                ค่านำเข้ารอบที่ 2 ฿{{ Number(order.import_fee_total).toLocaleString() }}
              </span>
            </div>

            <!-- ── FOOTER ── -->
            <div class="order-card__foot">
              <span class="foot-count" v-if="order.items && order.items.length">
                สินค้ารวม {{ order.items.length }} รายการ:
              </span>
              <span class="foot-total">
                <template
                  v-if="
                    order.Order_type === 'Preorder' &&
                    ['Wait_for_Import_Fee', 'Pending_import_fee'].includes(order.status) &&
                    Number(order.import_fee_total) > 0
                  "
                >
                  {{ Number(order.import_fee_total).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }} บาท
                </template>
                <template v-else>
                  {{ Number(order.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) }} บาท
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── TRUST BADGES ── -->
    <div class="trust-badges">
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10l-1 8a4 4 0 0 1-8 0L7 4z"/><path d="M7 4H4a1 1 0 0 0-1 1c0 3 2 5 4 5M17 4h3a1 1 0 0 1 1 1c0 3-2 5-4 5"/></svg>
        <div><p>Trusted Quality</p><span>สินค้าคัดสรรคุณภาพดีที่สุด</span></div>
      </div>
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        <div><p>Pre-order Protection</p><span>รับประกันเงินคืนหากสินค้ามีปัญหา</span></div>
      </div>
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="15" height="12" rx="2"/><path d="M16 10h3.5L22 13v5h-6"/><circle cx="6" cy="19" r="1.5"/><circle cx="18.5" cy="19" r="1.5"/></svg>
        <div><p>Real Shipping Cost</p><span>คิดค่านำเข้าตามจริง ไม่บวกเพิ่ม</span></div>
      </div>
      <div class="trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        <div><p>Customer Support</p><span>ทีมงานพร้อมดูแลตลอดเวลา</span></div>
      </div>
    </div>

    <footer class="site-footer">
      <span class="logo-icon logo-icon--footer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8.5c0-1.4.6-3.6 1.6-4.8.3-.3.8-.2.9.2l.7 2.4c1.5-.6 3.2-.9 4.8-.9s3.3.3 4.8.9l.7-2.4c.1-.4.6-.5.9-.2 1 1.2 1.6 3.4 1.6 4.8 0 4.4-3.6 8-8 8s-8-3.6-8-8z"/>
        </svg>
      </span>
      <span>Meowverse — 2026 สงวนลิขสิทธิ์ทุกประการ</span>
    </footer>
  </div>
</template>

<style scoped>
.order-list-page {
  --primary: #6f50a0;
  --primary-light: #cda2fb;
  --primary-dark: #3f2f5d;
  --bg: #f8f5ff;
  --card-bg: #ffffff;
  --border: #eadff5;
  --text: #3f2f5d;
  --muted: #75658f;
  --radius: 14px;
  --radius-sm: 10px;
  --success: #22c55e;
  --danger: #ef4444;
  --warning: #d97706;
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  font-family: 'Kanit', sans-serif;
}

/* ── NAVBAR ── */
.navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 clamp(1rem, 2.4vw, 2.25rem);
  height: 62px;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 16px rgba(89, 61, 125, 0.08);
  backdrop-filter: blur(8px);
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
.logo-icon-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  border-radius: 7px;
  display: block;
}
.logo-text {
  font-weight: 900;
  font-size: 1.05rem;
  color: var(--primary);
  letter-spacing: -0.01em;
}

.navbar__tabs {
  display: flex;
  list-style: none;
  gap: 0.15rem;
  margin-left: 1.2rem;
  flex: 1;
}

.nav-tab {
  position: relative;
  padding: 0.42rem 0.78rem;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  border-radius: 8px;
  transition:
    color 0.2s,
    background 0.2s;
  white-space: nowrap;
}
.nav-tab:hover {
  color: var(--primary);
  background: #f4eaff;
}
.nav-tab--active {
  color: var(--primary);
}
.nav-tab__underline {
  position: absolute;
  bottom: -1px;
  left: 0.78rem;
  right: 0.78rem;
  height: 2px;
  background: linear-gradient(90deg, var(--primary-light), var(--primary));
  border-radius: 2px;
}

.navbar__right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-left: auto;
  flex-shrink: 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  background: linear-gradient(160deg, #fff, #f8f2ff);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.32rem 0.8rem;
  box-shadow: 0 2px 8px rgba(111, 80, 160, 0.06);
}
.search-icon {
  width: 15px;
  height: 15px;
  color: var(--muted);
  flex-shrink: 0;
}
.search-input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.82rem;
  color: var(--text);
  width: 140px;
  font-family: inherit;
}

.pill-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* ── CART ICON BUTTON ── */
.cart-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  background: linear-gradient(160deg, #f8f2ff, #f0e6ff);
  border: 1px solid #dcc8f5;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.22s;
  box-shadow: 0 2px 8px rgba(111, 80, 160, 0.1);
  flex-shrink: 0;
}
.cart-icon-btn:hover {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  border-color: #b788ea;
  box-shadow: 0 6px 16px rgba(132, 86, 179, 0.28);
  transform: translateY(-1px);
}
.cart-icon-btn:hover .cart-icon-svg {
  stroke: #fff;
}
.cart-icon-svg {
  width: 18px;
  height: 18px;
  stroke: var(--primary);
  transition: stroke 0.22s;
}
.cart-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #ff6b8a, #e8405c);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 900;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(232, 64, 92, 0.4);
  animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes badge-pop {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

.user-pill {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.32rem;
  background: linear-gradient(160deg, #f8f2ff, #f1e6ff);
  border: 1px solid #e2cdf8;
  border-radius: 999px;
  padding: 0.32rem 0.72rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--primary);
  cursor: pointer;
}

.user-pill--open {
  box-shadow: 0 6px 20px rgba(111, 80, 160, 0.18);
}

.user-pill__chevron {
  width: 1rem;
  height: 1rem;
}

.user-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 180px;
  background: #ffffff;
  border: 1px solid #e4d9f5;
  border-radius: 16px;
  box-shadow: 0 18px 40px rgba(57, 33, 120, 0.12);
  overflow: hidden;
  z-index: 110;
}

.user-menu__item {
  width: 100%;
  padding: 0.85rem 1rem;
  text-align: left;
  background: transparent;
  border: none;
  font-size: 0.95rem;
  color: #3f2f5d;
  cursor: pointer;
  transition: background 0.2s;
}

.user-menu__item:hover {
  background: #f5efff;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: linear-gradient(160deg, #fff0f0, #ffe8eb);
  border: 1px solid #efbcc2;
  border-radius: 999px;
  padding: 0.32rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: #a74553;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}
.logout-btn:hover {
  background: #ffdfe4;
  box-shadow: 0 4px 12px rgba(167, 69, 83, 0.18);
}

/* ── ORDER NOTIF DOT (navbar tab) ── */
.nav-tab__label-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0;
}
.order-notif-dot {
  position: absolute;
  top: -5px;
  right: -10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  flex-shrink: 0;
}
.order-notif-dot--red {
  background: #ef4444;
  animation: pulse-red-nav 2s infinite;
}
.order-notif-dot--green {
  background: #22c55e;
  animation: pulse-green-nav 2s infinite;
}
@keyframes pulse-red-nav {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
  50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
}
@keyframes pulse-green-nav {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
  50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
}


/* ── HERO ── */
.hero {
  position: relative;
  margin: 1.5rem auto 0;
  max-width: 1000px;
  border-radius: 20px;
  background: linear-gradient(135deg, #ede4fb 0%, #f8f5fe 55%, #f0e6fb 100%);
  padding: 2.75rem 1.5rem 2.25rem;
  text-align: center;
  overflow: hidden;
}
.hero::before,
.hero::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.08);
}
.hero::before { width: 140px; height: 140px; top: -50px; left: -40px; }
.hero::after { width: 110px; height: 110px; bottom: -40px; right: -20px; background: rgba(124, 58, 237, 0.08); }
.hero__ribbon {
  position: absolute;
  top: 18px;
  right: -46px;
  transform: rotate(40deg);
  background: var(--danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 6px 52px;
  display: flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
}
.hero__ribbon svg { width: 13px; height: 13px; }
.hero__emblem {
  width: 68px;
  height: 68px;
  margin: 0 auto 0.75rem;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  box-shadow: 0 6px 16px rgba(109, 40, 217, 0.18);
  position: relative;
  z-index: 1;
}
.hero__emblem svg { width: 30px; height: 30px; }
.hero__title {
  position: relative;
  z-index: 1;
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0;
  color: var(--text);
}

/* ── CONTENT ── */
.content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 2.5rem;
}

/* ── TABS ── */
.tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.5rem;
  overflow-x: auto;
}
.tab {
  border: none;
  background: transparent;
  padding: 0.7rem 1.1rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2.5px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover { color: var(--primary); }
.tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* ── CARDS ── */
.order-cards {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.order-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.4rem 1.6rem;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(109, 40, 217, 0.1);
  border-color: #d8c6f5;
}

/* ── NOTIFICATION DOTS ── */
.notif-dot {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.18);
  z-index: 2;
}
.notif-dot--red { background: var(--danger); animation: pulse-red 2s infinite; }
.notif-dot--green { background: var(--success); animation: pulse-green 2s infinite; }
@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,79,67,0.55), 0 2px 6px rgba(0,0,0,0.18); }
  50%       { box-shadow: 0 0 0 5px rgba(201,79,67,0),   0 2px 6px rgba(0,0,0,0.18); }
}
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(63,157,104,0.55), 0 2px 6px rgba(0,0,0,0.18); }
  50%       { box-shadow: 0 0 0 5px rgba(63,157,104,0),  0 2px 6px rgba(0,0,0,0.18); }
}

/* ── CARD HEAD ── */
.order-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}
.order-card__id {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text);
}
.status-label {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
  margin-right: 4px;
}
.status-value {
  font-size: 0.9rem;
  font-weight: 800;
}

/* ── ITEMS ── */
.order-items {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1rem;
}
.order-item {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.order-item__img {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.order-item__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.order-item__img svg { width: 26px; height: 26px; }
.order-item__info {
  flex: 1;
  min-width: 0;
}
.order-item__name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-item__variant {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--muted);
  font-weight: 500;
}
.order-item__price,
.order-item__x {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
  flex-shrink: 0;
}
.order-item__subtotal {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text);
  flex-shrink: 0;
  min-width: 78px;
  text-align: right;
}

.expand-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.expand-icon {
  width: 13px;
  height: 13px;
  transition: transform 0.2s;
}
.expand-icon--open { transform: rotate(180deg); }

/* ── PROGRESS TRACKER ── */
.progress-track {
  display: flex;
  align-items: center;
  margin: 0.9rem 0 1.1rem;
}
.progress-step {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ede7f9;
  color: #b8aed1;
  transition: background 0.2s, color 0.2s;
}
.progress-step svg { width: 15px; height: 15px; }
.progress-step--active {
  background: var(--success);
  color: #fff;
}
.progress-step__line {
  flex: 1;
  height: 3px;
  background: #ede7f9;
  margin: 0 2px;
  transition: background 0.2s;
}
.progress-step__line--active { background: var(--success); }
.progress-track--cancelled {
  gap: 8px;
  color: var(--danger);
  font-weight: 700;
  font-size: 0.85rem;
}
.progress-track--cancelled svg { width: 18px; height: 18px; }

/* ── META CHIPS ── */
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.meta-chip {
  font-size: 0.76rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
}
.meta-chip--warn {
  background: #f2ecfd;
  color: var(--primary-dark);
}

/* ── CARD FOOT ── */
.order-card__foot {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 0.9rem;
  border-top: 1px dashed var(--border);
}
.foot-count {
  font-size: 0.88rem;
  color: var(--muted);
  font-weight: 600;
}
.foot-total {
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--primary-dark);
}

/* ── STATES ── */
.state-wrap {
  text-align: center;
  padding: 4rem 1rem;
  color: var(--muted);
}
.state-wrap--small { padding: 2.5rem 1rem; }
.loader {
  border: 4px solid #ede7f9;
  border-top: 4px solid var(--primary);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 0.75rem;
  color: #c9b8ef;
}
.empty-text {
  font-size: 1rem;
  font-weight: 700;
}
.error-box {
  background: #fbeae8;
  border: 1px solid #f0c6c0;
  border-radius: 10px;
  padding: 1rem;
  color: var(--danger);
  margin-bottom: 1rem;
  font-weight: 600;
}
.btn-retry {
  padding: 8px 24px;
  border-radius: 20px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

/* ── INVALID SLIP ALERT ── */
.invalid-slip-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  margin-bottom: 0.9rem;
  background: #fbeae8;
  border: 1.5px solid #f0b3ab;
  color: var(--danger);
}
.invalid-slip-alert__icon svg { width: 18px; height: 18px; }
.invalid-slip-alert__icon { flex-shrink: 0; margin-top: 1px; }
.invalid-slip-alert__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.invalid-slip-alert__body strong {
  font-size: 0.84rem;
  font-weight: 800;
}
.invalid-slip-alert__body span {
  font-size: 0.76rem;
  font-weight: 500;
  opacity: 0.85;
  line-height: 1.4;
}

/* ── TRUST BADGES ── */
.trust-badges {
  max-width: 1000px;
  margin: 1rem auto 0;
  padding: 1.75rem 1.5rem;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
  border-top: 1px solid var(--border);
}
.trust-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.trust-item svg {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  color: var(--primary);
}
.trust-item p {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 800;
  color: var(--text);
}
.trust-item span {
  font-size: 0.74rem;
  color: var(--muted);
  font-weight: 500;
}

/* ── SITE FOOTER ── */
.site-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 1.25rem 1rem 2rem;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}
.logo-icon--footer { width: 18px; height: 18px; }

/* ── RESPONSIVE ── */
@media (max-width: 720px) {
  .trust-badges { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .navbar { padding: 0 1rem; }
  .navbar__tabs { display: none; }
  .search-input { width: 100px; }
}
@media (max-width: 600px) {
  .navbar { gap: 0.5rem; }
  .content { padding: 1.25rem 0.85rem 2rem; }
  .order-card { padding: 1.1rem 1.1rem; }
  .order-item__subtotal { min-width: 60px; }
  .trust-badges { grid-template-columns: 1fr; }
}
</style>