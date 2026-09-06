<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { logout, getUser } = useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const currentUser = computed(() => getUser())
const showUserMenu = ref(false)
const userMenuRef = ref(null)

// ── MOBILE NAV (hamburger menu + search toggle) ──
const mobileMenuOpen = ref(false)
const mobileMenuRef = ref(null)
const mobileSearchOpen = ref(false)

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
  if (mobileMenuOpen.value) mobileSearchOpen.value = false
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function toggleMobileSearch() {
  mobileSearchOpen.value = !mobileSearchOpen.value
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function closeUserMenu() {
  showUserMenu.value = false
}

function goToUserProfile() {
  closeUserMenu()
  closeMobileMenu()
  router.push('/profile')
}

function goToMyOrders() {
  closeUserMenu()
  closeMobileMenu()
  router.push('/order-list')
}

function handleOutsideClick(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    closeUserMenu()
  }
  if (
    mobileMenuRef.value &&
    !mobileMenuRef.value.contains(event.target) &&
    !event.target.closest('.navbar__hamburger')
  ) {
    closeMobileMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

const activeTab = ref('พร้อมส่ง')
const activeCategory = ref(null)
const products = ref([])
const categories = ref([])
const loading = ref(true)
const error = ref(null)
const currentPage = ref(1)
const itemsPerPage = 8
const searchQuery = ref('')
const cartNotice = ref({ msg: '', type: '' })
const cartLoading = ref({})
const cartCount = ref(0) // จำนวนสินค้าใน cart badge
const orderNotifDot = ref('') // 'red' | 'green' | ''
const selectedProduct = ref(null)
const selectedFlavor = ref('')
const selectedPreviewIndex = ref(0)
const detailQty = ref(1)
const batchSelections = ref([]) // [{ flavor, qty }]
const defaultBannerImageUrl = '/images/cat.jpg'
const heroBannerImage = ref(defaultBannerImageUrl)
const defaultLogoImageUrl = ''
const logoImage = ref(defaultLogoImageUrl)

// ตัวแปรสำหรับเก็บรอบพรีออเดอร์ที่กำลังเปิดรับ
const activePreorderRounds = ref([])

const tabs = ['หน้าหลัก', 'พร้อมส่ง', 'พรีออเดอร์','รายการออเดอร์']

// ── ผูก activeTab กับ path ปัจจุบัน เพื่อให้ "พร้อมส่ง" และ "พรีออเดอร์" มี path แยกกันชัดเจน ──
// /products/ready-to-ship -> พร้อมส่ง, /products/preorder -> พรีออเดอร์, /dashboard -> หน้าหลัก
function syncTabFromRoute() {
  const browseTab = route.meta?.browseTab
  if (browseTab) {
    activeTab.value = browseTab
  } else if (route.name === 'userDashboard') {
    activeTab.value = 'หน้าหลัก'
  }
}

watch(
  () => route.fullPath,
  () => syncTabFromRoute(),
  { immediate: true },
)

const iconMap = [
  { keyword: 'ขนม', icon: '🍬' },
  { keyword: 'เตียง', icon: '🛏️' },
  { keyword: 'บ้าน', icon: '🏠' },
  { keyword: 'ของเล่น', icon: '🎮' },
  { keyword: 'รูมมิ่ง', icon: '✂️' },
  { keyword: 'อาหาร', icon: '🥫' },
  { keyword: 'อุปกรณ์', icon: '🔧' },
]

function getCatIcon(name) {
  const match = iconMap.find((i) => name?.includes(i.keyword))
  return match ? match.icon : '🐾'
}

function parseFlavorList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }

  const text = String(value || '').trim()
  if (!text) {
    return []
  }

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // Fall back to line/comma separated input.
  }

  return text
    .split(/\r?\n|,/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function parseFlavorStock(value) {
  if (!value) return {}

  let data = value

  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return {}
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(data).map(([flavor, qty]) => [String(flavor || '').trim(), Number(qty) || 0]),
  )
}

// จัดรูปแบบวันที่เปิด-ปิดรอบพรีออเดอร์
function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' น.'
}

// ── FETCH CATEGORIES ──
const fetchCategories = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`)
    if (!res.ok) throw new Error(`categories API ${res.status}`)
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.data ?? data.categories ?? [])
    categories.value = arr.map((c) => ({
      id: c.cat_id ?? c.id ?? c.categoryId,
      name: c.cat_name ?? c.name ?? c.categoryName ?? '',
      icon: getCatIcon(c.cat_name ?? c.name ?? ''),
    }))
  } catch (err) {
    console.error('fetchCategories:', err)
  }
}

// ── FETCH PRODUCTS ──
const fetchProducts = async () => {
  try {
    loading.value = true
    error.value = null
    const res = await fetch(`${API_BASE_URL}/products/public`)
    if (!res.ok) throw new Error('Failed to fetch products')
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.data ?? data.products ?? [])
    products.value = arr.map((p) => ({
      preorderRoundId:
        p.preorderRoundId != null
          ? Number(p.preorderRoundId)
          : p.preorder_round_id != null
            ? Number(p.preorder_round_id)
            : null,
      preorderEnabled: Boolean(p.preorderEnabled ?? p.isPreorder ?? false),
      readyToShipEnabled:
        p.readyToShipEnabled != null || p.isReadyToShip != null
          ? Boolean(p.readyToShipEnabled ?? p.isReadyToShip)
          : !(p.preorderEnabled ?? p.isPreorder ?? false),
      imageUrls: Array.isArray(p.imageUrls)
        ? p.imageUrls.map((item) => (typeof item === 'string' ? item : item?.url || '')).filter(Boolean)
        : [],
      images: Array.isArray(p.images)
        ? p.images.map((img) => ({ url: img?.url || img || '', flavor: img?.flavor || '' })).filter((img) => img.url)
        : [],
      id: p.id,
      name: p.name,
      description: p.description || '',
      flavors: parseFlavorList(p.flavors),
      flavorStock: parseFlavorStock(p.flavorStock ?? p.flavor_stock),
      price: p.basePrice ?? p.price ?? 0,
      // For preorder items prefer the round-specific price (p.price comes from preorder_round_products subquery)
      preorderPrice: p.price ?? p.preorderPrice ?? p.preorder_price ?? p.basePrice ?? 0,
      chinaShippingFeeThb: Number(p.chinaShippingFeeThb ?? p.china_shipping_fee_thb) || 0,
      image: p.imageUrls?.[0] ?? p.image_url?.[0] ?? p.imageUrl ?? p.image ?? null,
      categoryId: p.categoryId != null ? Number(p.categoryId) : null,
      categoryName: p.categoryName ?? '',
      stock: p.stock ?? 0,
      isPreorder:
        Boolean(p.preorderEnabled ?? p.isPreorder ?? false) &&
        (p.preorderRoundId != null || p.preorder_round_id != null),
      isReadyToShip:
        p.readyToShipEnabled != null || p.isReadyToShip != null
          ? Boolean(p.readyToShipEnabled ?? p.isReadyToShip)
          : !(p.preorderEnabled ?? p.isPreorder ?? false),
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// ── FETCH CART COUNT ──
const fetchCartCount = async () => {
  const user = currentUser.value
  if (!user?.id) return
  try {
    const res = await fetch(`${API_BASE_URL}/cart?user_id=${user.id}`)
    if (!res.ok) return
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.items ?? [])
    cartCount.value = arr.reduce((sum, item) => sum + (Number(item.qty) || 1), 0)
  } catch (err) {
    console.error('fetchCartCount:', err)
  }
}

// ── FETCH ORDER NOTIFICATION DOT ──
const RED_DOT_STATUSES = ['pending', 'pending_import_fee', 'cancelled', 'invalid_slip', 'invalid_import_slip', 'missing']
const GREEN_DOT_STATUSES = ['paid', 'ready_to_ship']

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase().replace(/[\s]+/g, '_')
}

const fetchOrderNotif = async () => {
  const user = currentUser.value
  if (!user?.id) return
  try {
    const res = await fetch(`${API_BASE_URL}/orders?user_id=${user.id}`)
    if (!res.ok) return
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.orders ?? [])
    const hasRed = arr.some((o) => RED_DOT_STATUSES.includes(normalizeStatus(o.status)))
    if (hasRed) { orderNotifDot.value = 'red'; return }
    const hasGreen = arr.some((o) => GREEN_DOT_STATUSES.includes(normalizeStatus(o.status)))
    orderNotifDot.value = hasGreen ? 'green' : ''
  } catch (err) {
    console.error('fetchOrderNotif:', err)
  }
}


const fetchPreorderRounds = async () => {
  try {
    // เปลี่ยน URL ไปเรียก API เส้นใหม่ที่เพิ่งสร้าง
    const res = await fetch(`${API_BASE_URL}/preorder-rounds/active`)
    if (!res.ok) throw new Error('Failed to fetch preorder rounds')
    const data = await res.json()
    const rounds = Array.isArray(data) ? data : (data.data || [])
    
    // ไม่ต้อง .filter แล้วเพราะ Backend กรอง 'active' มาให้แล้ว
    activePreorderRounds.value = rounds
  } catch (err) {
    console.error('fetchPreorderRounds:', err)
  }
}

// ── ADD TO CART ──
const addToCart = async (product, flavor = '', qty = 1) => {
  const user = currentUser.value
  if (!user?.id) {
    showNotice('กรุณาเข้าสู่ระบบก่อนหยิบสินค้า', 'warn')
    return
  }

  const itemType = getEffectiveItemType(product)
  if (!itemType) {
    showNotice('สินค้านี้ยังไม่เปิดขาย', 'warn')
    return
  }

  const hasFlavors = Array.isArray(product.flavors) && product.flavors.length > 0

  const flavorToAdd = String(flavor || '').trim() || product.flavors?.[0] || ''
  const qtyToAdd = Math.max(1, Number(qty) || 1)

  if (itemType !== 'preorder') {
    if (hasFlavors) {
      const flavorStock = getFlavorStock(flavorToAdd, product)
      if (flavorStock === 0) {
        showNotice(`รสชาติ "${flavorToAdd}" หมดสต็อกแล้ว`, 'error')
        return
      }

      if (qtyToAdd > flavorStock) {
        showNotice(`สต็อกของ "${flavorToAdd}" มีเพียง ${flavorStock} ชิ้นเท่านั้น`, 'error')
        return
      }
    } else {
      const stock = Number(product.stock) || 0
      if (stock === 0) {
        showNotice('สินค้าหมดสต็อกแล้ว', 'error')
        return
      }

      if (qtyToAdd > stock) {
        showNotice(`สต็อกมีเพียง ${stock} ชิ้นเท่านั้น`, 'error')
        return
      }
    }
  }

  cartLoading.value = { ...cartLoading.value, [product.id]: true }

  try {
    const payload = {
      user_id: user.id,
      prod_id: product.id,
      qty: qtyToAdd,
      item_type: itemType,
      flavor: flavorToAdd,
    }

    const res = await fetch(`${API_BASE_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
    }

    showNotice(
      `เพิ่ม "${product.name}${payload.flavor ? ` (${payload.flavor})` : ''}" ลงตะกร้าแล้ว!`,
      'success',
    )
    await fetchCartCount() // อัปเดต badge
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    cartLoading.value = { ...cartLoading.value, [product.id]: false }
  }
}

// ── GO TO CART ──
function goToCart() {
  router.push('/cart')
}

// ── GO TO ORDERS ──
function goToOrders() {
  router.push('/order-list')
}

function openProductDetail(product) {
  selectedProduct.value = product
  selectedFlavor.value = product.flavors?.[0] || ''
  selectedPreviewIndex.value = 0
  detailQty.value = 1
}

function closeProductDetail() {
  selectedProduct.value = null
  selectedFlavor.value = ''
  selectedPreviewIndex.value = 0
  detailQty.value = 1
}

function increaseDetailQty() {
  const itemType = getEffectiveItemType(selectedProduct.value)
  if (itemType === 'preorder') {
    detailQty.value = Math.min(detailQty.value + 1, 999)
    return
  }

  const stock = selectedFlavorStock.value || Number(selectedProduct.value?.stock) || 0
  if (stock > 0) {
    detailQty.value = Math.min(detailQty.value + 1, stock)
  }
}

function decreaseDetailQty() {
  detailQty.value = Math.max(1, detailQty.value - 1)
}

// ทุกรูปของสินค้า (พร้อม flavor) — ใช้แสดงใน thumb row
const detailImages = computed(() => {
  const product = selectedProduct.value
  if (!product) return []

  const rawImages = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : (Array.isArray(product.imageUrls) ? product.imageUrls.map((url) => ({ url, flavor: '' })) : [])

  return rawImages
    .map((img) => ({ url: img.url || img, flavor: img.flavor || '' }))
    .filter((img) => img.url)
})

// รูปที่แสดงใน main — ใช้รูปของ thumb ที่กด
const activeDetailImage = computed(() => {
  const list = detailImages.value
  if (list.length === 0) return ''

  // ถ้าเลือกรสอยู่และมีรูปของรสนั้น ให้แสดงรูปรสก่อนเสมอ
  if (selectedFlavor.value) {
    const flavorImg = list.find((img) => img.flavor === selectedFlavor.value)
    if (flavorImg) return flavorImg.url
  }

  const safeIndex = Math.min(selectedPreviewIndex.value, list.length - 1)
  return list[safeIndex]?.url || ''
})

// ── GET FLAVOR STOCK ──
const getFlavorStock = (flavor, product = selectedProduct.value) => {
  if (!product) return 0

  const key = String(flavor || '').trim()
  const stockMap = product.flavorStock || {}

  if (Object.prototype.hasOwnProperty.call(stockMap, key)) {
    return Number(stockMap[key]) || 0
  }

  return 0
}

const selectedFlavorStock = computed(() => {
  if (!selectedProduct.value) return 0

  if (getEffectiveItemType(selectedProduct.value) === 'preorder') {
    return 999
  }

  if (!(selectedProduct.value.flavors?.length > 0)) {
    return Number(selectedProduct.value.stock) || 0
  }

  return getFlavorStock(selectedFlavor.value)
})

function removeBatchSelection(index) {
  batchSelections.value.splice(index, 1)
}

async function addBatchToCart() {
  if (!selectedProduct.value || batchSelections.value.length === 0) return
  for (const sel of batchSelections.value) {
    try {
      await addToCart(selectedProduct.value, sel.flavor, sel.qty)
    } catch (e) {
      console.error('addBatchToCart error', e)
    }
  }
  batchSelections.value = []
}

let noticeTimer = null
function showNotice(msg, type = 'success') {
  cartNotice.value = { msg, type }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    cartNotice.value = { msg: '', type: '' }
  }, 3500)
}

function getEffectiveItemType(product) {
  const supportsPreorder = Boolean(product?.isPreorder)
  const supportsReadyToShip = Boolean(product?.isReadyToShip)

  if (activeTab.value === 'พรีออเดอร์' && supportsPreorder) {
    return 'preorder'
  }

  if (activeTab.value === 'พร้อมส่ง' && supportsReadyToShip) {
    return 'ready-to-ship'
  }

  if (supportsReadyToShip && !supportsPreorder) {
    return 'ready-to-ship'
  }

  if (supportsPreorder && !supportsReadyToShip) {
    return 'preorder'
  }

  if (supportsReadyToShip) {
    return 'ready-to-ship'
  }

  if (supportsPreorder) {
    return 'preorder'
  }

  return ''
}

function getProductPrice(product) {
  const itemType = getEffectiveItemType(product)
  if (itemType === 'preorder') {
    return product.preorderPrice ?? product.price
  }
  return product.price
}

function getChinaShippingFee(product) {
  return Number(product?.chinaShippingFeeThb ?? product?.china_shipping_fee_thb ?? 0) || 0
}

function getTotalStock(product) {
  if (!product) return 0

  const flavorStock = product.flavorStock
  if (flavorStock && typeof flavorStock === 'object' && !Array.isArray(flavorStock)) {
    const totalFromFlavor = Object.values(flavorStock).reduce(
      (sum, qty) => sum + (Number(qty) || 0),
      0,
    )
    if (totalFromFlavor > 0 || (product.flavors?.length ?? 0) > 0) {
      return totalFromFlavor
    }
  }

  return Number(product.stock) || 0
}

function isOutOfStockForCurrentType(product) {
  const itemType = getEffectiveItemType(product)
  if (!itemType) {
    return true
  }

  if (itemType === 'preorder') {
    return false
  }

  return getTotalStock(product) === 0
}

function getProductTypeLabel(product) {
  const supportsPreorder = Boolean(product?.isPreorder)
  const supportsReadyToShip = Boolean(product?.isReadyToShip)

  if (supportsReadyToShip && supportsPreorder) {
    return 'พร้อมส่ง / พรีออเดอร์'
  }

  if (supportsReadyToShip) {
    return 'พร้อมส่ง'
  }

  if (supportsPreorder) {
    return 'พรีออเดอร์'
  }

  return 'ไม่ระบุ'
}

function getCardBadge(product) {
  const itemType = getEffectiveItemType(product)

  if (itemType === 'ready-to-ship') {
    return { label: 'พร้อมส่ง', className: 'badge--ready' }
  }

  if (itemType === 'preorder') {
    return { label: 'พรีออเดอร์', className: 'badge--preorder' }
  }

  return null
}

// ── FILTERING ──
// ── FILTERING ──
const filteredProducts = computed(() => {
  let list = products.value

  if (activeTab.value === 'พรีออเดอร์') {
    list = list.filter((p) => p.isPreorder)
  } else if (activeTab.value === 'พร้อมส่ง') {
    list = list.filter((p) => p.isReadyToShip)
  } else if (activeTab.value === 'หน้าหลัก') {
    // 💡 เพิ่มตรงนี้: หน้าหลักกรองสินค้าที่ไม่พร้อมส่ง (ready_to_ship_enabled เป็น 0 หรือ false) ออก
    list = list.filter((p) => p.isReadyToShip)
  }

  if (activeCategory.value !== null) {
    list = list.filter((p) => Number(p.categoryId) === Number(activeCategory.value))
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q),
    )
  }

  return list
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProducts.value.length / itemsPerPage)),
)

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredProducts.value.slice(start, start + itemsPerPage)
})

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) currentPage.value = page
}

function handleTabClick(tab) {
  closeMobileMenu()
  if (tab === 'รายการออเดอร์') {
    goToOrders()
    return
  }
  currentPage.value = 1
  if (tab === 'หน้าหลัก') {
    activeCategory.value = null
    if (route.name !== 'userDashboard') {
      router.push('/dashboard')
      return
    }
    activeTab.value = tab
    return
  }
  if (tab === 'พร้อมส่ง') {
    if (route.name !== 'products-ready-to-ship') {
      router.push('/products/ready-to-ship')
      return
    }
    activeTab.value = tab
    return
  }
  if (tab === 'พรีออเดอร์') {
    if (route.name !== 'products-preorder') {
      router.push('/products/preorder')
      return
    }
    activeTab.value = tab
    return
  }
  activeTab.value = tab
}

function handleCategoryClick(id) {
  activeCategory.value = id
  currentPage.value = 1
}

function handleLogout() {
  logout()
  router.push('/login')
}

function getStockStatusClass(stock) {
  const s = Number(stock) || 0
  if (s === 0) return 'badge--out'
  if (s <= 2) return 'badge--critical'
  if (s <= 8) return 'badge--warning'
  return 'badge--normal'
}

function resolveBannerImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) {
    return defaultBannerImageUrl
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }

  return `/${url}`
}

function resolveLogoImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) {
    return defaultLogoImageUrl
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }

  return `/${url}`
}

function appendCacheBuster(url) {
  if (!url) {
    return ''
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${Date.now()}`
}

async function fetchBannerImage() {
  try {
    const res = await fetch(`${API_BASE_URL}/site-settings/banner`)
    if (!res.ok) {
      return
    }

    const data = await res.json()
    heroBannerImage.value = resolveBannerImageUrl(data.imageUrl)
  } catch (error) {
    console.error('fetchBannerImage:', error)
  }
}

async function fetchLogoImage() {
  try {
    const res = await fetch(`${API_BASE_URL}/site-settings/logo`)
    if (!res.ok) {
      return
    }

    const data = await res.json()
    const resolved = resolveLogoImageUrl(data.imageUrl)
    logoImage.value = resolved ? appendCacheBuster(resolved) : ''
  } catch (error) {
    console.error('fetchLogoImage:', error)
  }
}

onMounted(async () => {
  await Promise.all([
    fetchCategories(),
    fetchProducts(),
    fetchCartCount(),
    fetchBannerImage(),
    fetchLogoImage(),
    fetchPreorderRounds(),
    fetchOrderNotif(),
  ])
})
</script>

<template>
  <div class="shop">
    <nav class="navbar">
      <button
        type="button"
        class="navbar__hamburger"
        :class="{ 'navbar__hamburger--open': mobileMenuOpen }"
        aria-label="เปิดเมนู"
        @click.stop="toggleMobileMenu"
      >
        <span></span><span></span><span></span>
      </button>

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
        <div class="search-box" :class="{ 'search-box--mobile-open': mobileSearchOpen }">
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

        <button
          type="button"
          class="mobile-search-btn"
          aria-label="ค้นหาสินค้า"
          @click.stop="toggleMobileSearch"
        >
          <svg viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>

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
          <span class="logout-btn__text">ออกจากระบบ</span>
        </button>
      </div>

      <!-- ── MOBILE SEARCH BAR ── -->
      <div v-if="mobileSearchOpen" class="mobile-search-bar">
        <svg viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาสินค้า"
          class="mobile-search-bar__input"
          autofocus
        />
      </div>

      <!-- ── MOBILE MENU (hamburger dropdown) ── -->
      <div v-if="mobileMenuOpen" class="mobile-menu" ref="mobileMenuRef">
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          class="mobile-menu__item"
          :class="{ 'mobile-menu__item--active': activeTab === tab }"
          @click="handleTabClick(tab)"
        >
          {{ tab }}
          <span
            v-if="tab === 'รายการออเดอร์' && orderNotifDot === 'red'"
            class="order-notif-dot order-notif-dot--red"
          ></span>
          <span
            v-else-if="tab === 'รายการออเดอร์' && orderNotifDot === 'green'"
            class="order-notif-dot order-notif-dot--green"
          ></span>
        </button>
        <div class="mobile-menu__divider"></div>
        <button type="button" class="mobile-menu__item" @click="goToUserProfile">บัญชีของฉัน</button>
        <button type="button" class="mobile-menu__item" @click="goToMyOrders">การซื้อของฉัน</button>
        <button type="button" class="mobile-menu__item mobile-menu__item--danger" @click="handleLogout">
          ออกจากระบบ
        </button>
      </div>
    </nav>

    <transition name="slide-down">
      <div v-if="cartNotice.msg" :class="['cart-notice', `cart-notice--${cartNotice.type}`]">
        <span v-if="cartNotice.type === 'success'">
          <svg viewBox="0 0 20 20" fill="currentColor" class="notice-icon">
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </span>
        <span v-else-if="cartNotice.type === 'error'">
          <svg viewBox="0 0 20 20" fill="currentColor" class="notice-icon">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
        </span>
        {{ cartNotice.msg }}
      </div>
    </transition>

    <section class="hero">
      <div class="hero__content">
        <p class="hero__eyebrow">Meowverse Store</p>
        <h1 class="hero__title">สวรรค์ของทาสแมวและเจ้าเหมียวตัวฟู ทุกสินค้า</h1>
        <div class="hero__actions">
          <button
            :class="['btn', activeTab === 'พร้อมส่ง' ? 'btn--primary' : 'btn--outline']"
            @click="handleTabClick('พร้อมส่ง')"
          >
            พร้อมส่งสินค้า
          </button>
          <button
            :class="['btn', activeTab === 'พรีออเดอร์' ? 'btn--primary' : 'btn--outline']"
            @click="handleTabClick('พรีออเดอร์')"
          >
            สินค้าพรีออเดอร์
          </button>
        </div>
      </div>
      <div class="hero__image">
        <img :src="heroBannerImage" alt="Meowverse banner" class="hero__cat-img" />
      </div>
    </section>

    <section class="categories">
      <div class="categories__header">
        <div>
          <p class="categories__eyebrow">Browse by category</p>
          <h2 class="categories__title">หมวดหมู่สินค้า</h2>
          <p class="categories__subtitle">แตะเพื่อกรองสินค้าที่คุณต้องการได้เร็วขึ้น</p>
        </div>
        <div class="categories__badge">{{ categories.length }} หมวด</div>
      </div>

      <div class="categories__track">
        <button
          :class="['cat-btn', { 'cat-btn--active': activeCategory === null }]"
          @click="handleCategoryClick(null)"
        >
          <span class="cat-btn__icon">🐾</span>
          <span class="cat-btn__label">ทั้งหมด</span>
        </button>

        <button
          v-for="cat in categories"
          :key="cat.id"
          :class="['cat-btn', { 'cat-btn--active': activeCategory === cat.id }]"
          @click="handleCategoryClick(cat.id)"
        >
          <span class="cat-btn__icon">{{ cat.icon }}</span>
          <span class="cat-btn__label">{{ cat.name }}</span>
        </button>
      </div>
    </section>

    <section class="products">
      <div class="products__header">
        <div>
          <h2 class="products__title">สินค้า</h2>
          <p class="products__sub">
            {{
              activeTab === 'พรีออเดอร์'
                ? 'รวมสินค้าที่ต้องสั่งล่วงหน้า รับเมื่อสรุปรอบและสั่งซื้อผ่านเว็บไซต์'
                : 'เลือกของดีๆ ให้กับทาสแมวและเจ้าเหมียวตัวฟู'
            }}
          </p>
        </div>
      </div>

      <div v-if="activeTab === 'พรีออเดอร์' && activePreorderRounds.length > 0" class="preorder-rounds-container">
        <h3 class="rounds-title">📢 ประกาศ: รอบพรีออเดอร์ที่กำลังเปิดรับ</h3>
        <div class="rounds-grid">
          <div v-for="round in activePreorderRounds" :key="round.round_id" class="round-card">
            <div class="round-header">
              <h4 class="round-name">{{ round.round_name }}</h4>
              <span class="round-status badge--active">กำลังเปิดรับ</span>
            </div>
            <p v-if="round.round_description" class="round-desc">{{ round.round_description }}</p>
            <div class="round-dates">
              <div class="date-item">
                <span class="date-label">เปิดรอบ:</span>
                <span class="date-val">{{ formatDateTime(round.start_date) }}</span>
              </div>
              <div class="date-item">
                <span class="date-label">ปิดรอบ:</span>
                <span class="date-val">{{ formatDateTime(round.end_date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="state-msg">กำลังโหลดสินค้า...</div>
      <div v-else-if="error" class="error-msg">{{ error }}</div>
      <div v-else-if="paginatedProducts.length === 0" class="state-msg">
        ไม่พบรอบสินค้าพรีออเดอร์ที่เปิดในขณะนี้
      </div>

      <div v-else class="product-grid">
        <article
          v-for="product in paginatedProducts"
          :key="product.id"
          class="product-card"
          role="button"
          tabindex="0"
          @click="openProductDetail(product)"
          @keydown.enter.prevent="openProductDetail(product)"
          @keydown.space.prevent="openProductDetail(product)"
        >
          <span
            v-if="getCardBadge(product)"
            :class="['product-card__badge', getCardBadge(product).className]"
            >{{ getCardBadge(product).label }}</span
          >

          <div class="product-card__img">
            <img v-if="product.image" :src="product.image" :alt="product.name" />
            <span v-else class="product-card__emoji">🐾</span>
          </div>

          <div class="product-card__body">
            <h3 class="product-card__name">{{ product.name }}</h3>
            <p class="product-card__desc">{{ product.description || product.categoryName }}</p>

            <div class="product-card__footer">
              <div class="product-card__price">
                <span class="price-currency">฿</span>
                <span class="price-amount">{{
                  Number(getProductPrice(product)).toLocaleString()
                }}</span>
              </div>
              <span
                v-if="getEffectiveItemType(product) !== 'preorder'"
                :class="['stock-badge', getStockStatusClass(getTotalStock(product))]"
              >
                {{
                  product.flavors?.length
                    ? `สต็อกรวม ${getTotalStock(product)} ชิ้น`
                    : `สต็อก ${getTotalStock(product)} ชิ้น`
                }}
              </span>
            </div>

            <button
              class="btn-cart"
              :disabled="cartLoading[product.id] || isOutOfStockForCurrentType(product)"
              @click.stop="
                product.flavors?.length ? openProductDetail(product) : addToCart(product)
              "
            >
              <span v-if="cartLoading[product.id]" class="btn-cart__inner">
                <svg class="spin cart-svg" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
                  <path
                    d="M12 2a10 10 0 0110 10"
                    stroke="white"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                </svg>
                กำลังเพิ่ม...
              </span>
              <span v-else-if="isOutOfStockForCurrentType(product)" class="btn-cart__inner">
                สินค้าหมด
              </span>
              <span v-else class="btn-cart__inner">
                <svg
                  class="cart-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path
                    d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.69l1.38-7.31H6"
                  />
                </svg>
                {{ product.flavors?.length ? 'เลือกรสชาติ' : 'หยิบใส่ตะกร้า' }}
              </span>
            </button>
          </div>
        </article>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          v-for="page in totalPages"
          :key="page"
          :class="['page-btn', { 'page-btn--active': currentPage === page }]"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </div>
    </section>

    <transition name="fade-scale">
      <div v-if="selectedProduct" class="detail-overlay" @click.self="closeProductDetail">
        <section
          class="detail-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="selectedProduct.name"
        >
          <button
            class="detail-close"
            type="button"
            @click="closeProductDetail"
            aria-label="ปิดรายละเอียดสินค้า"
          >
            ×
          </button>

          <div class="detail-layout">
            <div class="detail-media">
              <div class="detail-media-main">
                <img
                  v-if="activeDetailImage"
                  :src="activeDetailImage"
                  :alt="selectedProduct.name"
                />
                <div v-else class="detail-media__fallback">
                  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                    <rect width="80" height="80" rx="16" fill="#f0e6ff"/>
                    <rect x="18" y="22" width="44" height="36" rx="6" stroke="#c9a8f0" stroke-width="2.5" fill="none"/>
                    <circle cx="30" cy="35" r="5" stroke="#c9a8f0" stroke-width="2" fill="none"/>
                    <path d="M18 50l14-12 10 10 8-7 12 9" stroke="#c9a8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>

              <div v-if="detailImages.length > 1" class="detail-thumb-row">
                <button
                  v-for="(img, index) in detailImages"
                  :key="`${img.url}-${index}`"
                  type="button"
                  :class="[
                    'detail-thumb',
                    {
                      'detail-thumb--active':
                        selectedPreviewIndex === index ||
                        (img.flavor && img.flavor === selectedFlavor),
                    },
                  ]"
                  @click="selectedPreviewIndex = index; if (img.flavor) selectedFlavor = img.flavor"
                >
                  <img :src="img.url" :alt="`${selectedProduct.name} ${index + 1}`" />
                </button>
              </div>

              <span
                v-if="getCardBadge(selectedProduct)"
                :class="['detail-badge', getCardBadge(selectedProduct).className]"
                >{{ getCardBadge(selectedProduct).label }}</span
              >
            </div>

            <div class="detail-content">
              <p class="detail-eyebrow">รายละเอียดสินค้า</p>
              <h3 class="detail-title">{{ selectedProduct.name }}</h3>
              <p class="detail-desc">
                {{
                  selectedProduct.description ||
                  selectedProduct.categoryName ||
                  'ไม่มีรายละเอียดเพิ่มเติม'
                }}
              </p>

              <div class="detail-price-band">
                ฿{{ Number(getProductPrice(selectedProduct)).toLocaleString() }}
              </div>

              <div
                v-if="getEffectiveItemType(selectedProduct) === 'preorder'"
                :class="[
                  'china-shipping-notice',
                  { 'china-shipping-notice--free': getChinaShippingFee(selectedProduct) <= 0 },
                ]"
              >
                <span class="china-shipping-notice__title">ค่าส่งภายในประเทศจีน</span>
                <strong v-if="getChinaShippingFee(selectedProduct) > 0">
                  {{ getChinaShippingFee(selectedProduct).toLocaleString() }} บาท/ชิ้น
                </strong>
                <strong v-else>ไม่มีค่าส่งจีน</strong>
                <small v-if="getChinaShippingFee(selectedProduct) > 0">
                  รวมในยอดชำระค่าสินค้ารอบแรกของพรีออเดอร์
                  ({{ (getChinaShippingFee(selectedProduct) * detailQty).toLocaleString() }} บาทตามจำนวน)
                </small>
              </div>

              <div v-if="selectedProduct.flavors?.length" class="detail-flavor-section">
                <p class="detail-option-label">ตัวเลือกสินค้า</p>
                <div class="flavor-chip-row">
                  <button
                    v-for="flavor in selectedProduct.flavors"
                    :key="flavor"
                    type="button"
                    :class="[
                      'flavor-chip',
                      { 'flavor-chip--active': selectedFlavor === flavor },
                      {
                        'flavor-chip--out':
                          getEffectiveItemType(selectedProduct) !== 'preorder' &&
                          getFlavorStock(flavor) === 0,
                      },
                    ]"
                    :disabled="
                      getEffectiveItemType(selectedProduct) !== 'preorder' &&
                      getFlavorStock(flavor) === 0
                    "
                    @click="
                      selectedFlavor = flavor;
                      const fi = detailImages.findIndex((img) => img.flavor === flavor);
                      if (fi !== -1) selectedPreviewIndex = fi;
                    "
                  >
                    <img
                      v-if="detailImages.find((img) => img.flavor === flavor)"
                      :src="detailImages.find((img) => img.flavor === flavor).url"
                      :alt="flavor"
                      class="flavor-chip__img"
                    />
                    <span>{{ flavor }}</span>
                    <span
                      v-if="getEffectiveItemType(selectedProduct) !== 'preorder'"
                      class="flavor-stock"
                      >{{ getFlavorStock(flavor) }}</span
                    >
                  </button>
                </div>
              </div>

              <div class="detail-qty-row">
                <p class="detail-option-label">จำนวน</p>
                <div class="qty-picker">
                  <button
                    type="button"
                    class="qty-picker__btn"
                    :disabled="detailQty <= 1"
                    @click="decreaseDetailQty"
                  >
                    -
                  </button>
                  <span class="qty-picker__value">{{ detailQty }}</span>
                  <button
                    type="button"
                    class="qty-picker__btn"
                    :disabled="detailQty >= selectedFlavorStock"
                    @click="increaseDetailQty"
                  >
                    +
                  </button>
                </div>
              </div>

              <div class="detail-meta-grid">
                <div class="detail-meta">
                  <span class="detail-meta__label">หมวดหมู่</span>
                  <strong class="detail-meta__value">{{
                    selectedProduct.categoryName || '-'
                  }}</strong>
                </div>
                <div class="detail-meta">
                  <span class="detail-meta__label">
                    {{
                      getEffectiveItemType(selectedProduct) === 'preorder'
                        ? 'เงื่อนไขรอบพรีออเดอร์'
                        : selectedProduct.flavors?.length
                          ? 'สต็อกรสที่เลือก'
                          : 'สต็อก'
                    }}
                  </span>
                  <strong class="detail-meta__value">
                    {{
                      getEffectiveItemType(selectedProduct) === 'preorder'
                        ? 'สั่งตามยอดจอง'
                        : `${selectedProduct.flavors?.length ? selectedFlavorStock : getTotalStock(selectedProduct)} ชิ้น`
                    }}
                  </strong>
                </div>
                <div class="detail-meta">
                  <span class="detail-meta__label">ประเภท</span>
                  <strong class="detail-meta__value">{{
                    getProductTypeLabel(selectedProduct)
                  }}</strong>
                </div>
                <div
                  v-if="
                    getEffectiveItemType(selectedProduct) !== 'preorder' &&
                    selectedProduct.flavors?.length
                  "
                  class="detail-meta"
                >
                  <span class="detail-meta__label">สต็อกรวม</span>
                  <strong class="detail-meta__value"
                    >{{ getTotalStock(selectedProduct) }} ชิ้น</strong
                  >
                </div>
              </div>
              <div v-if="batchSelections.length" class="batch-selection">
                <p class="detail-option-label">รายการชุดพรีออเดอร์ที่เตรียมส่ง</p>
                <div class="batch-list">
                  <div v-for="(sel, idx) in batchSelections" :key="idx" class="batch-item">
                    <span>{{ sel.flavor }} × {{ sel.qty }}</span>
                    <button
                      type="button"
                      class="btn-remove-small"
                      @click="removeBatchSelection(idx)"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
                <div class="batch-actions">
                  <button class="btn btn--primary" @click="addBatchToCart">
                    เพิ่มทั้งหมดลงตะกร้า
                  </button>
                  <button class="btn btn--outline" @click="batchSelections = []">ยกเลิกชุด</button>
                </div>
              </div>

              <div class="detail-actions">
                <button
                  class="btn btn--primary detail-action-btn"
                  :disabled="
                    getEffectiveItemType(selectedProduct) !== 'preorder' &&
                    Number(selectedFlavorStock) === 0
                  "
                  @click="addToCart(selectedProduct, selectedFlavor, detailQty)"
                >
                  {{
                    selectedProduct.flavors?.length
                      ? 'เพิ่มลงตะกร้า (ตัวเลือกนี้)'
                      : 'เพิ่มลงตะกร้า'
                  }}
                </button>
                <button class="btn btn--outline detail-action-btn" @click="closeProductDetail">
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.shop {
  --primary: #6f50a0;
  --primary-light: #cda2fb;
  --primary-dark: #3f2f5d;
  --surface: #ffffff;
  --bg: #f8f5ff;
  --border: #eadff5;
  --text: #3f2f5d;
  --muted: #75658f;
  --radius: 14px;
  --radius-sm: 10px;
  --content-max: 1240px;

  font-family: inherit;
  background:
    radial-gradient(circle at 0% 0%, rgba(220, 190, 255, 0.28), transparent 28%),
    radial-gradient(circle at 100% 20%, rgba(255, 203, 217, 0.24), transparent 34%), var(--bg);
  min-height: 100vh;
  color: var(--text);
  padding-bottom: 2rem;
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

/* ── MOBILE NAV: HAMBURGER BUTTON (hidden on desktop, shown <=768px) ── */
.navbar__hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: 38px;
  height: 38px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.navbar__hamburger:hover {
  background: #f4eaff;
}
.navbar__hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: var(--primary);
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.navbar__hamburger--open span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}
.navbar__hamburger--open span:nth-child(2) {
  opacity: 0;
}
.navbar__hamburger--open span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

/* ── MOBILE SEARCH TOGGLE + BAR ── */
.mobile-search-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.mobile-search-btn svg {
  width: 16px;
  height: 16px;
  color: var(--muted);
}
.mobile-search-bar {
  display: none;
}

/* ── MOBILE DROPDOWN MENU (hamburger contents) ── */
.mobile-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 14px 26px rgba(89, 61, 125, 0.14);
  padding: 0.5rem;
  display: grid;
  gap: 0.15rem;
  z-index: 999;
  animation: mobile-menu-in 0.18s ease;
}
@keyframes mobile-menu-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.mobile-menu__item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.8rem 0.9rem;
  border-radius: 10px;
  font-size: 0.94rem;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.mobile-menu__item:active {
  background: #f4eaff;
}
.mobile-menu__item--active {
  color: var(--primary);
  background: #f6eeff;
}
.mobile-menu__item--danger {
  color: #e0455b;
}
.mobile-menu__divider {
  height: 1px;
  background: var(--border);
  margin: 0.4rem 0.2rem;
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

/* ── CART NOTICE ── */
.cart-notice {
  position: fixed;
  top: 66px;
  right: 1.5rem;
  z-index: 200;
  pointer-events: none;
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
.cart-notice--success {
  background: linear-gradient(160deg, #f0fdf5, #e4f8ef);
  border-color: #bcebd8;
  color: #1f7a5a;
}
.cart-notice--error {
  background: linear-gradient(160deg, #fef2f2, #fde9e9);
  border-color: #f3cbcb;
  color: #8f3131;
}
.cart-notice--warn {
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

/* ── HERO ── */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: var(--content-max);
  margin: 0.85rem auto 0;
  border: 1px solid rgba(213, 195, 236, 0.75);
  border-radius: 20px;
  padding: 2rem clamp(1.1rem, 2.3vw, 2rem) 2rem;
  background:
    radial-gradient(circle at right top, rgba(255, 194, 211, 0.36), transparent 48%),
    linear-gradient(140deg, rgba(255, 255, 255, 0.92), rgba(248, 241, 255, 0.96));
  position: relative;
  overflow: hidden;
  min-height: 190px;
  box-shadow: 0 4px 20px rgba(89, 61, 125, 0.06);
}
.hero__content {
  max-width: 440px;
  z-index: 1;
}
.hero__eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #9a7dbf;
  margin-bottom: 0.4rem;
}
.hero__title {
  font-size: clamp(1.15rem, 2.2vw, 1.65rem);
  font-weight: 900;
  color: var(--primary-dark);
  line-height: 1.18;
  margin-bottom: 1rem;
}
.hero__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 800;
  font-size: 0.83rem;
  cursor: pointer;
  transition: all 0.22s;
  min-height: 38px;
}
.btn--primary {
  border: 1px solid #b788ea;
  background: linear-gradient(180deg, #cda2fb, #b97be8);
  color: #fff;
  box-shadow: 0 8px 18px rgba(132, 86, 179, 0.28);
}
.btn--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 11px 22px rgba(132, 86, 179, 0.32);
}
.btn--outline {
  border: 1px solid #d6b9f1;
  background: #f7efff;
  color: #6a4f89;
}
.btn--outline:hover {
  background: #f1e4ff;
}

.hero__image {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 260px;
  z-index: 0;
}
.hero__cat-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  mask-image: linear-gradient(to left, rgba(0, 0, 0, 0.9) 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to left, rgba(0, 0, 0, 0.85) 60%, transparent 100%);
}

/* ── CATEGORIES ── */
.categories {
  display: grid;
  gap: 0.85rem;
  max-width: var(--content-max);
  margin: 0.85rem auto 0;
  border-radius: 20px;
  padding: 1rem 1rem 1.05rem;
  background:
    radial-gradient(circle at right top, rgba(205, 162, 251, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(249, 245, 255, 0.95));
  border: 1px solid rgba(213, 195, 236, 0.85);
  box-shadow: 0 10px 28px rgba(89, 61, 125, 0.06);
}

.categories__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.categories__eyebrow {
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #9a7dbf;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.categories__title {
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary-dark);
  line-height: 1.2;
}

.categories__subtitle {
  margin-top: 0.16rem;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

.categories__badge {
  align-self: center;
  border: 1px solid #d8c4f0;
  background: linear-gradient(180deg, #fff, #f7efff);
  color: var(--primary);
  border-radius: 999px;
  padding: 0.38rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(89, 61, 125, 0.06);
}

.categories__track {
  display: flex;
  gap: 0.72rem;
  overflow-x: auto;
  padding: 0.1rem 0.1rem 0.15rem;
}

.cat-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.38rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.92));
  border: 1px solid #eadff5;
  border-radius: 18px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
  padding: 0.6rem 0.7rem 0.55rem;
  min-width: 82px;
  box-shadow: 0 4px 12px rgba(89, 61, 125, 0.06);
}
.cat-btn:hover {
  transform: translateY(-2px);
  border-color: #bf93eb;
  box-shadow: 0 10px 18px rgba(132, 86, 179, 0.12);
}
.cat-btn__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.9));
  border: 1px solid #e3d7f1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  transition:
    border-color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 4px 10px rgba(89, 61, 125, 0.08);
}
.cat-btn--active .cat-btn__icon {
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  border-color: #b788ea;
  box-shadow: 0 6px 16px rgba(132, 86, 179, 0.25);
}
.cat-btn__label {
  font-size: 0.77rem;
  font-weight: 900;
  color: var(--muted);
  white-space: nowrap;
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-btn--active .cat-btn__label {
  color: var(--primary);
}

/* ── PRODUCTS ── */
.products {
  max-width: var(--content-max);
  margin: 0.9rem auto 0;
  border: 1px solid rgba(225, 212, 243, 0.92);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 246, 255, 0.88));
  padding: 1.15rem 1rem 1.35rem;
  box-shadow: 0 10px 28px rgba(89, 61, 125, 0.08);
}

.products__header {
  margin-bottom: 0.8rem;
}
.products__title {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--primary-dark);
}
.products__sub {
  font-size: 0.83rem;
  color: var(--muted);
  margin-top: 0.18rem;
}

.filter-row {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin-bottom: 1.2rem;
}
.filter-pill {
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #decdf1;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.9));
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(89, 61, 125, 0.06);
}
.filter-pill:hover {
  border-color: #bf93eb;
  color: var(--primary);
  background: #f7efff;
}
.filter-pill--active {
  border-color: #b788ea;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  box-shadow: 0 4px 12px rgba(132, 86, 179, 0.24);
}

/* ── PRODUCT GRID ── */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.85rem;
}

.product-card {
  border: 1px solid #eadff5;
  border-radius: var(--radius);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.94), rgba(251, 246, 255, 0.9));
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: 0 7px 20px rgba(79, 62, 108, 0.11);
  transition:
    transform 0.2s ease,
    box-shadow 0.25s ease;
  cursor: pointer;
}
.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 30px rgba(79, 62, 108, 0.17);
  border-color: #d8c4f0;
}

.product-card__badge {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2;
  padding: 0.18rem 0.52rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
}
.badge--preorder {
  background: #fff2d9;
  color: #9b6210;
  border: 1px solid #f7ddb0;
}
.badge--ready {
  background: #e8f9f2;
  color: #187f5d;
  border: 1px solid #bfead9;
}

.product-card__img {
  width: 100%;
  aspect-ratio: 1/1;
  background: linear-gradient(135deg, #f3effa, #fde9f3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.product-card__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s;
}
.product-card:hover .product-card__img img {
  transform: scale(1.04);
}
.product-card__emoji {
  font-size: 3rem;
  color: #c9a6f4;
}

.product-card__body {
  padding: 0.72rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.product-card__name {
  font-size: 0.9rem;
  font-weight: 800;
  color: #45315f;
  line-height: 1.25;
  margin-bottom: 0.25rem;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.product-card__desc {
  font-size: 0.75rem;
  color: #8b7ba3;
  margin-bottom: 0.65rem;
  flex: 1;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.product-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.product-card__price {
  display: flex;
  align-items: baseline;
  gap: 0.08rem;
}
.price-currency {
  font-size: 0.85rem;
  color: var(--muted);
}
.price-amount {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--primary-dark);
}

.stock-badge {
  font-size: 0.67rem;
  font-weight: 800;
  padding: 0.16rem 0.52rem;
  border-radius: 999px;
  border: 1px solid;
  flex-shrink: 0;
  white-space: nowrap;
}
.badge--normal {
  color: #1f7a5a;
  background: #e4f8ef;
  border-color: #bcebd8;
}
.badge--warning {
  color: #9b6210;
  background: #fff2d9;
  border-color: #f7ddb0;
}
.badge--critical {
  color: #9c2f42;
  background: #ffe6ea;
  border-color: #f6bec8;
}
.badge--out {
  color: #6b7280;
  background: #f3f4f6;
  border-color: #e5e7eb;
}

/* ── CART BUTTON ── */
.btn-cart {
  width: 100%;
  border: 1px solid #b788ea;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  padding: 0.58rem;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-weight: 800;
  font-size: 0.84rem;
  cursor: pointer;
  line-height: 1.15;
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease,
    opacity 0.2s;
}
.btn-cart:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(132, 86, 179, 0.28);
}
.btn-cart:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: linear-gradient(180deg, #d8c8ec, #c4b0de);
  border-color: #c9b6e0;
}

.btn-cart__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}
.cart-svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.8s linear infinite;
}

/* ── PAGINATION ── */
.pagination {
  display: flex;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 2rem;
}
.page-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid #d8c4f0;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.9));
  color: var(--muted);
  font-weight: 800;
  font-size: 0.86rem;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(89, 61, 125, 0.08);
}
.page-btn:hover {
  border-color: #bf93eb;
  color: var(--primary);
}
.page-btn--active {
  border-color: #b788ea;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  box-shadow: 0 4px 12px rgba(132, 86, 179, 0.24);
}

/* ── PRODUCT DETAIL MODAL ── */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(63, 47, 93, 0.42);
  backdrop-filter: blur(7px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.detail-modal {
  position: relative;
  width: min(1000px, 100%);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.98), rgba(250, 246, 255, 0.98));
  border: 1px solid #eadff5;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(63, 47, 93, 0.22);
  overflow: hidden;
}

.detail-close {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--primary-dark);
  font-size: 1.35rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(79, 62, 108, 0.12);
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(360px, 1fr);
}

.detail-media {
  position: relative;
  padding: 1rem;
  border-right: 1px solid #eadff5;
  background: linear-gradient(180deg, #f8f2ff, #fefbff);
}

.detail-media-main {
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1px solid #e7dbf4;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detail-media__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8f2ff, #ede0ff);
}

.detail-thumb-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 0.45rem;
  margin-top: 0.6rem;
}

.detail-thumb {
  border: 1px solid #ddd2ed;
  border-radius: 10px;
  background: #fff;
  padding: 0;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.detail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-thumb:hover {
  transform: translateY(-1px);
  border-color: #bf93eb;
}

.detail-thumb--active {
  border-color: #b788ea;
  box-shadow: 0 0 0 2px rgba(183, 136, 234, 0.22);
}

.detail-badge {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  background: #fff2d9;
  color: #9b6210;
  border: 1px solid #f7ddb0;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 800;
}

.detail-content {
  padding: 1.25rem 1.35rem 1.15rem;
}

.detail-eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #9a7dbf;
  text-transform: uppercase;
  margin-bottom: 0.35rem;
}

.detail-title {
  font-size: 1.45rem;
  font-weight: 900;
  color: var(--primary-dark);
  margin-bottom: 0.55rem;
}

.detail-desc {
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--muted);
  margin-bottom: 0.65rem;
}

.detail-price-band {
  margin-bottom: 0.95rem;
  padding: 0.62rem 0.82rem;
  border-radius: 10px;
  font-size: 1.35rem;
  font-weight: 900;
  color: #f05d23;
  background: linear-gradient(180deg, #fff8f2, #fff5eb);
  border: 1px solid #ffd9c8;
}

.detail-flavor-section {
  margin-bottom: 0.85rem;
}

.china-shipping-notice {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: -0.2rem 0 0.95rem;
  padding: 0.72rem 0.82rem;
  border: 1px solid #f2c27d;
  border-radius: 10px;
  background: #fff8ed;
  color: #7a4b18;
}

.china-shipping-notice__title {
  font-size: 0.78rem;
  font-weight: 800;
}

.china-shipping-notice strong {
  color: #d86b13;
  font-size: 0.96rem;
}

.china-shipping-notice small {
  color: #9a744b;
  font-size: 0.74rem;
  line-height: 1.45;
}

.china-shipping-notice--free {
  border-color: #b9e5ca;
  background: #f1fff6;
  color: #167542;
}

.china-shipping-notice--free strong {
  color: #167542;
}

.detail-option-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8a7aa3;
  margin-bottom: 0.45rem;
}

.flavor-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.45rem;
}

.flavor-chip {
  border: 1px solid #d8c9ec;
  background: #fff;
  color: var(--primary-dark);
  border-radius: 8px;
  padding: 0.35rem 0.88rem 0.35rem 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.flavor-chip__img {
  width: 32px;
  height: 32px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid #ede0ff;
}

.flavor-chip:hover {
  transform: translateY(-1px);
  border-color: #bf93eb;
  background: #fdf8ff;
  box-shadow: 0 4px 10px rgba(132, 86, 179, 0.1);
}

.flavor-chip--active {
  border-color: #f1a17f;
  background: #fff7f3;
  color: #d56639;
  box-shadow: 0 0 0 2px rgba(241, 161, 127, 0.2);
}

.flavor-chip--out {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
  color: #999;
}

.flavor-chip--out:hover {
  transform: none;
  border-color: #d8c9ec;
  background: #f5f5f5;
  box-shadow: none;
}

.flavor-stock {
  margin-left: 0.4rem;
  padding: 0.2rem 0.4rem;
  background: rgba(111, 80, 160, 0.1);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--primary);
}

.detail-qty-row {
  margin-bottom: 0.95rem;
}

.qty-picker {
  display: inline-flex;
  align-items: center;
  border: 1px solid #decdf1;
  border-radius: 10px;
  overflow: hidden;
}

.qty-picker__btn {
  width: 34px;
  height: 34px;
  border: none;
  background: #fff;
  color: #7e679f;
  font-size: 1.1rem;
  cursor: pointer;
}

.qty-picker__btn:not(:disabled):hover {
  background: #f7efff;
}

.qty-picker__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.qty-picker__value {
  min-width: 46px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--primary-dark);
  border-left: 1px solid #eadff5;
  border-right: 1px solid #eadff5;
  line-height: 34px;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 1.1rem;
}

.detail-meta {
  background: linear-gradient(160deg, #fff, #f8f2ff);
  border: 1px solid #eadff5;
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
}

.detail-meta__label {
  display: block;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.2rem;
  font-weight: 700;
}

.detail-meta__value {
  font-size: 0.95rem;
  color: var(--primary-dark);
}

.detail-actions {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.detail-action-btn {
  min-width: 160px;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.2s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
}

/* ── STATES ── */
.state-msg {
  text-align: center;
  padding: 3rem;
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 700;
}
.error-msg {
  border-radius: var(--radius-sm);
  padding: 0.58rem 0.72rem;
  border: 1px solid #f3cbcb;
  font-size: 0.84rem;
  color: #8f3131;
  background: #fde9e9;
  margin-bottom: 1rem;
}

/* ── RESPONSIVE ── */
@media (max-width: 768px) {
  .navbar {
    padding: 0 0.85rem;
    position: relative;
    gap: 0.6rem;
  }
  .navbar__hamburger {
    display: flex;
  }
  .mobile-search-btn {
    display: flex;
  }
  .mobile-search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-top: 1px solid var(--border);
    background: #fff;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 998;
    box-shadow: 0 10px 20px rgba(89, 61, 125, 0.1);
  }
  .mobile-search-bar svg {
    width: 16px;
    height: 16px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .mobile-search-bar__input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 0.92rem;
    font-family: inherit;
    background: transparent;
    min-width: 0;
  }
  .search-box {
    display: none;
  }
  .user-pill,
  .logout-btn {
    display: none;
  }
  .navbar__tabs {
    display: none;
  }
  .hero {
    margin-top: 0.65rem;
    padding: 1.2rem 1rem;
    min-height: 160px;
  }
  .hero__image {
    width: 180px;
  }
  .categories {
    margin-top: 0.65rem;
    padding: 0.9rem;
  }
  .categories__header {
    flex-direction: column;
  }
  .categories__badge {
    align-self: flex-start;
  }
  .categories__track {
    gap: 0.55rem;
  }
  .products {
    margin-top: 0.65rem;
    padding: 1rem 0.8rem 1.1rem;
  }
  .product-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
@media (max-width: 480px) {
  .cat-btn {
    min-width: 72px;
    padding-inline: 0.55rem;
  }
  .cat-btn__icon {
    width: 46px;
    height: 46px;
  }
  .product-grid {
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
  }
  .hero__title {
    font-size: 1.05rem;
  }

  .categories__title {
    font-size: 0.95rem;
  }
}

@media (max-width: 900px) {
  .detail-modal {
    max-height: calc(100vh - 1.5rem);
    overflow: auto;
  }

  .detail-layout {
    grid-template-columns: 1fr;
  }

  .detail-media {
    border-right: none;
    border-bottom: 1px solid #eadff5;
  }

  .detail-media-main {
    max-height: 300px;
  }
}

/* ── PREORDER ROUNDS INFO ── */
.preorder-rounds-container {
  margin-bottom: 1.5rem;
  background: linear-gradient(160deg, #fffaf5, #fff5f0);
  border: 1px dashed #f1a17f;
  border-radius: 16px;
  padding: 1.25rem;
}
.rounds-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: #d56639;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rounds-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}
.round-card {
  background: #ffffff;
  border: 1px solid #ffe3d5;
  border-radius: 12px;
  padding: 1.1rem;
  box-shadow: 0 4px 12px rgba(213, 102, 57, 0.06);
  transition: transform 0.2s, box-shadow 0.2s;
}
.round-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(213, 102, 57, 0.1);
}
.round-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}
.round-name {
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--primary-dark);
  margin: 0;
}
.round-status {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: #e8f9f2;
  color: #187f5d;
  border: 1px solid #bfead9;
}
.round-desc {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 0.9rem;
  line-height: 1.45;
}
.round-dates {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: linear-gradient(160deg, #fcf9ff, #f8f2ff);
  padding: 0.75rem;
  border-radius: 10px;
  border: 1px solid #f0e6ff;
}
.date-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
}
.date-label {
  color: var(--muted);
  font-weight: 700;
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
</style>
