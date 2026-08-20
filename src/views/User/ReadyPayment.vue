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
// ── PRODUCT IMAGE MAP ──
const productImageMap = ref({})

const fetchProductImages = async (prodIds) => {
  const uniqueIds = [...new Set(prodIds.filter(Boolean))]
  await Promise.all(uniqueIds.map(async (prodId) => {
    if (productImageMap.value[prodId]) return
    try {
      const res = await fetch(`${API_BASE_URL}/product-images?prod_id=${prodId}`)
      if (!res.ok) return
      const imgs = await res.json()
      const arr = Array.isArray(imgs) ? imgs : (imgs.data ?? imgs.images ?? [])
      const map = {}
      arr.forEach((img) => {
        const rawFlavor = img.flavor
        const key = (rawFlavor == null || String(rawFlavor).trim() === '') ? '__default__' : String(rawFlavor).trim()
        if (map[key] === undefined || img.sort_order < map[key].sort_order) {
          map[key] = { url: img.image_url, sort_order: img.sort_order }
        }
      })
      const urlMap = {}
      Object.entries(map).forEach(([k, v]) => { urlMap[k] = v.url })
      productImageMap.value[prodId] = urlMap
    } catch { /* ignore */ }
  }))
}

// 💡 แก้ไขฟังก์ชันนี้ให้เติม API_BASE_URL ด้านหน้า url รูปภาพ
function resolveItemImage(it) {
  const imgs = productImageMap.value[it.prod_id]
  const flavorKey = it.flavor ? String(it.flavor) : null
  let finalUrl = it.image ?? null

  if (imgs) {
    if (flavorKey && imgs[flavorKey]) finalUrl = imgs[flavorKey]
    else if (imgs['__default__']) finalUrl = imgs['__default__']
    else {
      const first = Object.values(imgs)[0]
      if (first) finalUrl = first
    }
  }

  if (finalUrl && finalUrl.startsWith('/uploads') && API_BASE_URL.includes('http')) {
    const originServer = new URL(API_BASE_URL).origin
    return `${originServer}${finalUrl}`
  }

  return finalUrl
}

const loading = ref(true)
const error = ref(null)
const notice = ref({ msg: '', type: '' })
const totalItemQuantity = computed(() =>
  Number(
    order.value?.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 0,
  ),
)
const itemsTotal = computed(() =>
  Number(
    order.value?.items?.reduce(
      (sum, item) =>
        sum + Number(item.price || item.Price || item.unit_price || 0) * Number(item.qty || 0),
      0,
    ) ||
      order.value?.total_amount ||
      0,
  ),
)

const shippingFee = computed(() => {
  const storedFee = Number(order.value?.shipping_fee || 0)
  if (storedFee > 0) return storedFee

  const orderType = String(order.value?.Order_type || '').trim().toLowerCase()
  const status = String(order.value?.status || '').trim().toLowerCase().replace(/[_\s]+/g, ' ')
  const isUnpaidReadyOrder = ['pending', 'slip submitted', 'invalid slip'].includes(status)

  return orderType === 'ready' && (isUnpaidReadyOrder || !order.value?.order_id) ? 49 : 0
})

const totalPayable = computed(() => {
  const storedFee = Number(order.value?.shipping_fee || 0)
  const orderTotal = Number(order.value?.total_amount ?? itemsTotal.value)
  return orderTotal + (storedFee > 0 ? 0 : shippingFee.value)
})

const slipFile = ref(null)
const slipPreview = ref(null)
const slipFileInput = ref(null)
const slipImageUrl = computed(() => slipPreview.value || order.value?.saved_shipping?.slip_url || null)
const imageViewerUrl = ref(null)
const isImageViewerOpen = ref(false)

const viewImage = (url) => {
  if (!url) return
  imageViewerUrl.value = url
  isImageViewerOpen.value = true
}

const viewSlipImage = () => {
  if (slipImageUrl.value) viewImage(slipImageUrl.value)
}

// ── สถานะสลิปไม่ถูกต้อง (แอดมินปฏิเสธ) ──
const isInvalidSlip = computed(() =>
  String(order.value?.status || '').trim().toLowerCase().replace(/[_\s]+/g, ' ') === 'invalid slip',
)
const selectedPaymentMethod = ref('bank_transfer')

const defaultPaymentMethods = [
  { id: 'bank_transfer', name: 'โอนเงินผ่านธนาคาร', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align: middle;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>' },
  { id: 'promptpay', name: 'พร้อมเพย์', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align: middle;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>' },
]

const paymentMethods = ref([])

const getQrImageUrl = (src) => {
  if (!src) return null
  if (src.startsWith('/uploads') && API_BASE_URL.includes('http')) {
    return `${new URL(API_BASE_URL).origin}${src}`
  }
  return src
}

const resolveSelectedPaymentMethod = (savedPaymentMethod) => {
  const selected = String(savedPaymentMethod || selectedPaymentMethod.value)
  const matched = paymentMethods.value.find(
    (method) =>
      String(method.qr_id) === selected ||
      String(method.id) === selected ||
      String(method.payment_method) === selected,
  )
  if (matched) {
    selectedPaymentMethod.value = matched.qr_id || matched.id
  } else if (paymentMethods.value.length > 0) {
    selectedPaymentMethod.value = paymentMethods.value[0].qr_id || paymentMethods.value[0].id
  }
}

const getSelectedPaymentMethodValue = () => {
  const selected = paymentMethods.value.find(
    (method) =>
      String(method.qr_id) === String(selectedPaymentMethod.value) ||
      String(method.id) === String(selectedPaymentMethod.value),
  )
  return selected?.payment_method || selectedPaymentMethod.value
}

const loadPaymentMethods = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/qrcodes`)
    if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลวิธีชำระเงินได้')
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      paymentMethods.value = data.map((item) => ({
        qr_id: item.qr_id,
        payment_method: item.payment_method,
        qr_image: item.qr_image || null,
        full_name: item.full_name || null,
        id: item.qr_id,
      }))
    } else {
      paymentMethods.value = defaultPaymentMethods
    }
  } catch {
    paymentMethods.value = defaultPaymentMethods
  } finally {
    resolveSelectedPaymentMethod()
  }
}

// แสดงสถานะที่เป็นมิตรต่อผู้ใช้ โดยอ้างอิงจาก order.status และข้อมูล payment (saved_shipping)
const displayStatus = computed(() => {
  const raw = String(order.value?.status || '').trim()
  const status = raw.toLowerCase()
  const normalized = status.replace(/[_\s]+/g, ' ')

  if (normalized === 'pending') {
    const hasPaymentEvidence = Boolean(
      order.value?.saved_shipping?.slip_url || order.value?.saved_shipping?.payment_status,
    )
    return hasPaymentEvidence ? 'รอแอดมินตรวจสอบ' : 'รอชำระเงิน'
  }

  if (normalized === 'paid') return 'จ่ายเงินสำเร็จ รอแอดมินตรวจสอบและจัดส่ง'

  if (normalized === 'shipped') return 'จัดส่งแล้ว'
  if (normalized === 'delivered') return 'นำจ่ายแล้ว'

  if (normalized === 'ready to ship' || status === 'ready_to_ship' || status === 'readytoship')
    return 'เตรียมพร้อมส่ง'

  if (normalized === 'invalid slip') return 'สลิปไม่ถูกต้อง'

  return order.value?.status || 'รอชำระเงิน'
})

// ถ้า order เป็น paid หรือ ready to ship จะไม่อนุญาตให้แก้ไขสลิป
const isPaidOrReady = computed(() => {
  const raw = String(order.value?.status || '').trim()
  const lower = raw.toLowerCase()
  const normalized = lower.replace(/[_\s]+/g, ' ')
  return (
    normalized === 'paid' ||
    normalized === 'ready to ship' ||
    lower === 'ready_to_ship' ||
    lower === 'readytoship'
  )
})

const isShippingLocked = computed(() => {
  const raw = String(order.value?.status || '').trim()
  const normalized = raw.toLowerCase().replace(/[_\s]+/g, ' ')
  return [
    'slip submitted',
    'import slip submitted',
    'paid',
    'ready to ship',
    'shipped',
    'delivered',
    'cancelled',
  ].includes(normalized)
})

const isPaymentComplete = computed(() => {
  const normalized = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
  return ['paid', 'ready to ship', 'shipped', 'delivered'].includes(normalized)
})

const primaryButtonLabel = computed(() => {
  if (isPaymentComplete.value) return 'ชำระเงินและจัดส่งเรียบร้อยแล้ว'
  if (isPaidOrReady.value) return loading.value ? 'กำลังประมวลผล...' : 'บันทึกข้อมูลจัดส่ง'
  return loading.value ? 'กำลังประมวลผล...' : 'ยืนยันการชำระเงิน'
})

async function onPrimaryAction() {
  if (isShippingLocked.value) {
    return
  }

  if (isPaidOrReady.value) {
    try {
      loading.value = true
      await saveShippingInfoOnly()
      showNotice('บันทึกข้อมูลจัดส่งเรียบร้อยแล้ว', 'success')
      setTimeout(() => router.push('/order-list'), 2000)
    } catch (err) {
      showNotice(err.message || 'เกิดข้อผิดพลาด', 'error')
    } finally {
      loading.value = false
    }
    return
  }

  await confirmPayment()
}

const selectPaymentMethod = (methodId) => {
  if (isShippingLocked.value || isPaymentComplete.value) return
  selectedPaymentMethod.value = methodId
}

const shippingInfo = ref({ name: '', phone: '', address: '', notes: '', carrier: '' })

const onFileChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    showNotice('กรุณาแนบไฟล์รูปภาพเท่านั้น (เช่น JPG, PNG)', 'error')
    e.target.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showNotice('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error')
    e.target.value = ''
    return
  }
  slipFile.value = file
  slipPreview.value = URL.createObjectURL(file)
}

const editSlipImage = () => {
  if (slipFileInput.value) {
    slipFileInput.value.click()
  }
}

const saveShippingInfoOnly = async () => {
  const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/shipping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shipping_name: shippingInfo.value.name,
      shipping_phone: shippingInfo.value.phone,
      shipping_address: shippingInfo.value.address,
      shipping_carrier: shippingInfo.value.carrier,
      notes: shippingInfo.value.notes || '',
    }),
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลจัดส่ง')
  }
}

const fetchOrder = async () => {
  const orderId = route.params.orderId
  if (!orderId) {
    const pendingDataJson = sessionStorage.getItem('pending_order_data')
    if (!pendingDataJson) {
      router.push('/cart')
      return
    }
    try {
      const pendingData = JSON.parse(pendingDataJson)
      order.value = {
        order_id: null,
        items: pendingData.items,
        total_amount: pendingData.total_amount,
        shipping_fee: pendingData.shipping_fee,
        Order_type: 'Ready',
        user_id: pendingData.user_id,
      }
      const pendingProdIds = (pendingData.items || []).map((i) => i.prod_id)
      await fetchProductImages(pendingProdIds)
    } catch {
      error.value = 'ข้อมูลชั่วคราวเสียหาย'
      setTimeout(() => router.push('/cart'), 2000)
      loading.value = false
      return
    }
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}`)
    if (!res.ok) throw new Error(`ไม่พบข้อมูลออเดอร์ (${res.status})`)
    const data = await res.json()
    if (data.Order_type && data.Order_type !== 'Ready') {
      if (String(data.Order_type).toLowerCase() === 'preorder') {
        router.replace(`/preorder-payment/${orderId}`)
        return
      }
    }
    order.value = data
    const apiProdIds = (data.items || []).map((i) => i.prod_id)
    await fetchProductImages(apiProdIds)

    if (data.saved_shipping) {
      shippingInfo.value.name = data.saved_shipping.name || ''
      shippingInfo.value.phone = data.saved_shipping.phone || ''
      shippingInfo.value.address = data.saved_shipping.address || ''
      shippingInfo.value.notes = data.saved_shipping.notes || ''
      shippingInfo.value.carrier = data.saved_shipping.carrier || ''
      resolveSelectedPaymentMethod(data.saved_shipping.payment_method || 'bank_transfer')

      if (data.saved_shipping.slip_url) {
        const url = data.saved_shipping.slip_url
        if (url.startsWith('/uploads') && API_BASE_URL.includes('http')) {
          const originServer = new URL(API_BASE_URL).origin
          slipPreview.value = `${originServer}${url}`
        } else {
          slipPreview.value = url
        }
      }
    }

    sessionStorage.removeItem('pending_order_data')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const confirmPayment = async () => {
  if (loading.value) return

  if (!slipFile.value && !slipImageUrl.value) {
    showNotice('กรุณาแนบหลักฐานการโอนเงิน', 'error')
    return
  }
  if (!shippingInfo.value.name || !shippingInfo.value.phone || !shippingInfo.value.address || !shippingInfo.value.carrier) {
    showNotice('กรุณากรอกข้อมูลและเลือกบริษัทขนส่งให้ครบถ้วน', 'error')
    return
  }

  try {
    loading.value = true

    if (!order.value.order_id) {
      const pendingDataJson = sessionStorage.getItem('pending_order_data')
      if (!pendingDataJson) {
        showNotice('ข้อมูลชั่วคราวหมดอายุ กรุณากลับไปหน้าตะกร้า', 'error')
        setTimeout(() => router.push('/cart'), 2000)
        return
      }
      const pendingData = JSON.parse(pendingDataJson)

      const res = await fetch(`${API_BASE_URL}/orders/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: pendingData.user_id,
          items: pendingData.items,
        }),
      })
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null)
        throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการสร้างออเดอร์')
      }
      const orderData = await res.json()
      const newOrderId = orderData.order_id

      const slipFormData = new FormData()
      slipFormData.append('payment_method', getSelectedPaymentMethodValue())
      if (slipFile.value) slipFormData.append('slip', slipFile.value)
      slipFormData.append('shipping_name', shippingInfo.value.name)
      slipFormData.append('shipping_phone', shippingInfo.value.phone)
      slipFormData.append('shipping_address', shippingInfo.value.address)
      slipFormData.append('shipping_carrier', shippingInfo.value.carrier)
      slipFormData.append('notes', shippingInfo.value.notes || '')

      const slipRes = await fetch(`${API_BASE_URL}/orders/${newOrderId}/payment`, {
        method: 'POST',
        body: slipFormData,
      })
      if (!slipRes.ok) {
        const errorBody = await slipRes.json().catch(() => null)
        throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการส่งหลักฐาน')
      }

      showNotice('ส่งหลักฐานเรียบร้อย! รอการตรวจสอบจากทีมงาน', 'success')
      sessionStorage.removeItem('pending_order_data')
      setTimeout(() => router.push('/order-list'), 2000)
      return
    }

    if (!slipFile.value && slipImageUrl.value) {
      await saveShippingInfoOnly()
      showNotice('อัปเดตข้อมูลจัดส่งเรียบร้อยแล้ว', 'success')
      setTimeout(() => router.push('/order-list'), 2000)
      return
    }

    const formData = new FormData()
    formData.append('payment_method', getSelectedPaymentMethodValue())
    if (slipFile.value) formData.append('slip', slipFile.value)
    formData.append('shipping_name', shippingInfo.value.name)
    formData.append('shipping_phone', shippingInfo.value.phone)
    formData.append('shipping_address', shippingInfo.value.address)
    formData.append('shipping_carrier', shippingInfo.value.carrier)
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
  router.back()
}

onMounted(async () => {
  await loadPaymentMethods()
  fetchOrder()
  if (currentUser.value && !shippingInfo.value.name) {
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
        <span class="logo-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.5 0 3.5-3.58 4-8.9 4-5.33 0-9-1.5-9-5 0-1.26.43-2.43 1-3.5 0 0-1.82-6.42-.42-7 1.39-.58 4.64.26 6.42 2.26.65-.17 1.33-.26 2-.26z"></path></svg></span>
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
                  <strong>{{ totalItemQuantity }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">ยอดรวม</span>
                  <strong v-if="isPaymentComplete">ชำระครบแล้ว</strong>
                  <strong v-else>฿{{ totalPayable.toLocaleString() }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">สถานะ</span>
                  <strong class="hero-meta-status">{{ displayStatus }}</strong>
                </div>
              </div>
            </div>
          </section>

          <div class="section-card">
            <div class="section-header">
              <h2 class="section-title" style="display: flex; align-items: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg> รายการสินค้า</h2>
              <span class="section-pill">{{ totalItemQuantity }} รายการ</span>
            </div>
            <div class="item-list">
              <div v-for="it in order.items" :key="it.detail_id" class="order-item">
                <div class="item-img">
                  <img v-if="resolveItemImage(it)" :src="resolveItemImage(it)" :alt="it.name" />
                  <div v-else class="item-img-placeholder">
                    <svg viewBox="0 0 40 40" fill="none" width="28" height="28"><rect width="40" height="40" rx="8" fill="#f0e6ff"/><rect x="8" y="10" width="24" height="20" rx="4" stroke="#c9a8f0" stroke-width="2" fill="none"/><circle cx="14" cy="18" r="3" stroke="#c9a8f0" stroke-width="1.5" fill="none"/><path d="M8 26l8-7 6 6 4-4 6 5" stroke="#c9a8f0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                </div>
                <div class="item-info">
                  <p class="item-name">
                      {{ it.name || it.prod_name }}
                      <span v-if="it.flavor || it.Flavor" style="display: block; color: #8b5cf6; font-size: 0.85em; font-weight: 600; margin-top: 2px;">
                       ({{ it.flavor || it.Flavor }})
                      </span>
                    </p>
                  <p class="item-price-small">
                    ราคา ฿{{ Number(it.price || it.Price || it.unit_price || 0).toLocaleString() }}
                    / ชิ้น
                  </p>
                </div>
                <div class="item-meta">
                  <div class="item-qty">x{{ it.qty }}</div>
                  <div class="item-total">
                    ฿{{
                      (
                        Number(it.price || it.Price || it.unit_price || 0) * Number(it.qty)
                      ).toLocaleString()
                    }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-card form-panel">
            <div class="section-header section-header--stacked">
              <h3 class="section-title" style="display: flex; align-items: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> ข้อมูลจัดส่ง</h3>
              <span class="section-caption">
                {{ isShippingLocked ? 'แอดมินตรวจสอบสลิปแล้ว ไม่สามารถแก้ไขข้อมูลจัดส่งได้' : 'ตรวจสอบให้ครบก่อนส่ง' }}
              </span>
            </div>
            <div class="order-info">
              <div class="field-group">
                <label for="recipient-name">ชื่อผู้รับ</label>
                <input
                  id="recipient-name"
                  v-model="shippingInfo.name"
                  placeholder="ระบุชื่อ-นามสกุล"
                  :disabled="isShippingLocked"
                />
              </div>

              <div class="field-group field-group--two-cols">
                <div>
                  <label for="recipient-phone">โทร</label>
                  <input
                    id="recipient-phone"
                    v-model="shippingInfo.phone"
                    placeholder="08x-xxx-xxxx"
                    :disabled="isShippingLocked"
                  />
                </div>
                <div>
                  <label for="shipping-carrier">บริษัทขนส่ง</label>
                  <select id="shipping-carrier" v-model="shippingInfo.carrier" :disabled="isShippingLocked">
                    <option value="">-- เลือกบริษัทขนส่ง --</option>
                    <option value="Kerry">Kerry</option>
                    <option value="Flash">Flash</option>
                    <option value="J&T">J&T</option>
                    <option value="EMS">EMS</option>
                  </select>
                </div>
              </div>

              <div class="field-group">
                <label for="shipping-notes">หมายเหตุ</label>
                <input
                  id="shipping-notes"
                  v-model="shippingInfo.notes"
                  placeholder="เช่น ฝากไว้หน้าบ้าน"
                  :disabled="isShippingLocked"
                />
              </div>

              <div class="field-group">
                <label for="recipient-address">ที่อยู่</label>
                <textarea
                  id="recipient-address"
                  v-model="shippingInfo.address"
                  rows="4"
                  placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                  :disabled="isShippingLocked"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="payment-section">
          <div class="payment-sticky">
            <div class="section-card glass-card payment-panel">
              <template v-if="!isPaymentComplete">
              <h3 class="section-title" style="display: flex; align-items: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> วิธีการชำระเงิน</h3>
              <div class="payment-methods">
                <div
                  v-for="method in paymentMethods"
                  :key="method.qr_id || method.id"
                  class="payment-method"
                  :class="{ 'payment-method--selected': selectedPaymentMethod === (method.qr_id || method.id), 'payment-method--disabled': isPaidOrReady }"
                  @click="selectPaymentMethod(method.qr_id || method.id)"
                >
                  <div class="payment-method-summary">
                    <span v-if="method.icon" v-html="method.icon"></span>
                    <span class="method-name">{{ method.payment_method || method.name }}</span>
                  </div>
                  <div v-if="selectedPaymentMethod === (method.qr_id || method.id)" class="payment-method-qr">
                    <div class="qr-label">สแกน QR เพื่อชำระเงิน</div>
                    <img
                      v-if="method.qr_image"
                      :src="getQrImageUrl(method.qr_image)"
                      :alt="method.payment_method || method.name"
                      class="payment-method-qr-image"
                      @click.stop="viewImage(getQrImageUrl(method.qr_image))"
                    />
                    <div v-else class="qr-missing">ยังไม่มีรูป QR สำหรับวิธีนี้</div>
                  </div>
                </div>
              </div>

              <div class="section-divider"></div>

              <h3 class="section-title" style="display: flex; align-items: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> แนบหลักฐานการโอน</h3>

              <div v-if="isInvalidSlip" class="invalid-slip-banner">
                <div class="invalid-slip-banner__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                <div class="invalid-slip-banner__text">
                  <strong>สลิปไม่ถูกต้อง กรุณาแนบสลิปใหม่</strong>
                  <span>แอดมินตรวจสอบแล้วพบว่าสลิปที่แนบมาไม่ถูกต้อง กรุณาอัปโหลดสลิปใหม่อีกครั้ง</span>
                </div>
              </div>

                <div class="upload-area" :class="{ 'upload-area--invalid': isInvalidSlip }">
                <input
                  ref="slipFileInput"
                  type="file"
                  id="slip-file"
                  accept="image/*"
                  @change="onFileChange"
                  class="hidden-input"
                  :disabled="isShippingLocked"
                />
                <div v-if="!slipImageUrl" class="upload-label" @click="editSlipImage">
                  <div class="upload-prompt">
                    <span class="upload-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></span>
                    <span>คลิกเพื่ออัปโหลดสลิป</span>
                    <small>รองรับ JPG, PNG, WEBP ไม่เกิน 5MB</small>
                  </div>
                </div>
                <div v-else class="preview-box">
                  <img
                    :src="slipImageUrl"
                    class="slip-preview clickable-image"
                    @click="viewSlipImage"
                    title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                  />
                  <div v-if="!isShippingLocked" class="edit-overlay" @click.stop="editSlipImage">แตะเพื่อเปลี่ยนรูปภาพ</div>
                </div>
              </div>
              </template>
              <div v-else class="payment-complete-banner">
                <strong>ชำระเงินเรียบร้อยแล้ว</strong>
                <span>ออเดอร์นี้ได้รับการชำระเงินและดำเนินการจัดส่งแล้ว</span>
              </div>
            </div>

              <div class="section-card summary-card summary-card--wide summary-card--compact">
              <div class="summary-row" style="display: flex; justify-content: space-between">
                <span class="summary-label">ยอดรวมสินค้า</span>
                <span class="summary-amount">฿{{ itemsTotal.toLocaleString() }}</span>
              </div>
              <div
                v-if="shippingFee > 0 && !isPaymentComplete"
                class="summary-row"
                style="display: flex; justify-content: space-between; margin-top: 8px"
              >
                <span class="summary-label">ค่าส่ง</span>
                <span class="summary-amount">฿{{ shippingFee.toLocaleString() }}</span>
              </div>
              <div class="summary-header" style="margin-top: 12px">
                <span class="summary-label">{{ isPaymentComplete ? 'สถานะการชำระเงิน' : 'ยอดรวมที่ต้องชำระ' }}</span>
                <strong v-if="isPaymentComplete" class="summary-amount summary-amount--paid">ชำระครบแล้ว</strong>
                <strong v-else class="summary-amount">฿{{ totalPayable.toLocaleString() }}</strong>
              </div>
              <div class="summary-note">ชำระด้วยสลิปโอนเงิน แล้วแอดมินจะตรวจสอบให้ทันที</div>
              <hr class="divider" />
              <button type="button" class="btn-checkout" @click="onPrimaryAction" :disabled="loading || isShippingLocked">
                {{ primaryButtonLabel }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="isImageViewerOpen" class="image-viewer-overlay" @click="isImageViewerOpen = false">
        <div class="viewer-content">
          <button class="viewer-close" @click="isImageViewerOpen = false">✕</button>
          <img :src="imageViewerUrl" class="full-slip-image" />
        </div>
      </div>
    </transition>
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
.item-img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8f2ff, #ede0ff);
  border-radius: inherit;
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
.payment-method-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
}
.payment-method-qr {
  margin-top: 0.95rem;
  padding: 0.95rem 0.95rem 0.75rem;
  border-radius: 14px;
  background: #f6f0ff;
  border: 1px dashed #d6bff7;
}
.qr-label {
  display: block;
  margin-bottom: 0.7rem;
  font-size: 0.84rem;
  font-weight: 700;
  color: #5f3fa8;
}
.payment-method-qr-image {
  width: 100%;
  max-width: 240px;
  border-radius: 14px;
  display: block;
  margin: 0 auto;
  cursor: zoom-in;
}
.qr-missing {
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: #fff4f4;
  color: #9b2c2c;
  text-align: center;
  font-size: 0.86rem;
}
.payment-method--disabled {
  opacity: 0.55;
  cursor: not-allowed;
  pointer-events: none;
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
.upload-area--invalid {
  border-color: #fca5a5;
  background: linear-gradient(180deg, #fff8f8 0%, #fff1f1 100%);
}
/* ── INVALID SLIP BANNER ── */
.invalid-slip-banner {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  margin-bottom: 0.75rem;
  background: #fff1f1;
  border: 1.5px solid #fca5a5;
  color: #b91c1c;
}
.invalid-slip-banner__icon {
  font-size: 1.2rem;
  flex-shrink: 0;
  margin-top: 1px;
}
.invalid-slip-banner__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.invalid-slip-banner__text strong {
  font-size: 0.88rem;
  font-weight: 800;
}
.invalid-slip-banner__text span {
  font-size: 0.80rem;
  font-weight: 500;
  line-height: 1.5;
  opacity: 0.9;
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
  cursor: pointer;
  transition: background 0.2s ease;
}
.edit-overlay:hover {
  background: linear-gradient(180deg, rgba(111, 80, 160, 0.1) 0%, rgba(111, 80, 160, 0.95) 100%);
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

.field-group input:disabled,
.field-group textarea:disabled,
.field-group select:disabled {
  background: #ece6f5;
  border-color: #c8b8e0;
  color: #6f5f84;
  cursor: not-allowed;
}

.field-group input,
.field-group textarea,
.field-group select {
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
.field-group textarea:focus,
.field-group select:focus {
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
  animation: spin 0.8s linear infinite;
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
.payment-complete-banner {
  display: grid;
  gap: 0.35rem;
  padding: 1.25rem;
  border: 1px solid #b7e5d0;
  border-radius: 14px;
  background: #f0fdf4;
  color: #047857;
}
.payment-complete-banner strong {
  font-size: 1.05rem;
}
.payment-complete-banner span {
  color: #527565;
  font-size: 0.88rem;
}
.summary-amount--paid {
  color: #059669;
  font-size: 1.1rem;
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

/* ── 💡 สไตล์งานระบบซูมรูปภาพสลิปใบใหญ่ทำงานครอบคลุมทุกอุปกรณ์ (Root Level) ── */
.clickable-image {
  cursor: zoom-in;
  transition: opacity 0.2s;
}
.clickable-image:hover {
  opacity: 0.9;
}
.image-viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
  backdrop-filter: blur(5px);
}
.viewer-content {
  position: relative;
  max-width: 90%;
  max-height: 90%;
}
.full-slip-image {
  max-width: 100%;
  max-height: 85vh;
  border-radius: 8px;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
  object-fit: contain;
}
.viewer-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: none;
  border: none;
  color: white;
  font-size: 2rem;
  cursor: pointer;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
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
