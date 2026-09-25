<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'
import { printOrder } from '../../utils/printOrder'

const route = useRoute()
const router = useRouter()
const { getUser } = useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const currentUser = computed(() => getUser())

const orders = ref([])
const loading = ref(false)
const error = ref('')
const productSalesSummary = ref([])
const productSalesLoading = ref(false)
const productSalesError = ref('')
const productFilterName = ref('')
const productFilterType = ref('all')
const productFilterMinSold = ref(0)
const productFilterTopN = ref('all')
const showProductFilters = ref(false)
const salesView = ref('summary')
const searchQuery = ref('')
const typeFilter = ref('all')
const statusFilter = ref('all')
const selectedOrder = ref(null)
const selectedOrderLoading = ref(false)
const selectedOrderError = ref('')
const previewImage = ref(null)

function openImagePreview(url, title, subtitle) {
  if (!url) return
  previewImage.value = { url, title, subtitle }
}

function closeImagePreview() {
  previewImage.value = null
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

const statusConfig = {
  Pending: { label: 'รอดำเนินการ', color: '#f59e0b', bg: '#fffbeb' },
  Paid: { label: 'ชำระแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Slip_submitted: { label: 'รอตรวจสอบสลิป', color: '#0ea5e9', bg: '#f3e8ff' },
  Import_slip_submitted: { label: 'รอตรวจสอบสลิปค่านำเข้า', color: '#0ea5e9', bg: '#f3e8ff' },
  Wait_for_Import_Fee: { label: 'รอนำเข้า', color: '#6366f1', bg: '#eef2ff' },
  Pending_import_fee: { label: 'รอชำระค่านำเข้า', color: '#7c3aed', bg: '#f3e8ff' },
  Ready_to_Ship: { label: 'พร้อมจัดส่ง', color: '#0ea5e9', bg: '#f0f9ff' },
  Shipped: { label: 'กำลังจัดส่ง', color: '#0ea5e9', bg: '#f0f9ff' },
  Delivered: { label: 'ลูกค้าได้รับแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Delayed: { label: 'รอสินค้าที่แยกส่ง', color: '#d97706', bg: '#fff7ed' },
  Cancelled: { label: 'ยกเลิกแล้ว', color: '#ef4444', bg: '#fef2f2' },
}

function authHeaders() {
  const user = currentUser.value || {}
  return {
    'Content-Type': 'application/json',
    'x-user-role': String(user.role || '').toLowerCase() || 'admin',
    'x-user-id': String(user.user_id || user.id || ''),
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function getStatus(status) {
  return statusConfig[status] || { label: status || '-', color: '#888', bg: '#f5f5f5' }
}

function getOrderTypeLabel(orderType) {
  return String(orderType || '').toLowerCase() === 'preorder' ? 'สินค้าพรีออเดอร์' : 'สินค้าพร้อมส่ง'
}

// ── ยอดเงินรวมของแถวในตาราง "จัดการรายการยอดขาย" ──
// อิงตามประเภทของแต่ละออเดอร์เอง (order.Order_type) ไม่ใช่ตามหน้าที่กำลังดูอยู่
// เพื่อให้ยอดเงินของออเดอร์พรีออเดอร์ตรงกันไม่ว่าจะดูจากหน้า "ทั้งหมด" หรือหน้า "พรีออเดอร์" โดยเฉพาะ
// พรีออเดอร์: total_amount + ค่าจัดส่ง + ค่านำเข้า + ค่าส่งจากจีน (รวมทุกค่าใช้จ่ายจริง)
// พร้อมส่ง: total_amount เฉย ๆ (รวมค่าจัดส่งไว้แล้วตั้งแต่ตอนสร้างออเดอร์)
function getOrderRowTotal(order) {
  const total = Number(order.total_amount || 0)
  if (String(order?.Order_type || '').toLowerCase() !== 'preorder') return total
  return (
    total +
    Number(order.shipping_fee || 0) +
    Number(order.import_fee_total || 0) +
    Number(order.china_shipping_total_thb || 0)
  )
}

// ── ผูก path กับตัวกรองประเภทออเดอร์ ──
// /admin/sales -> ทั้งหมด, /admin/sales/ready-to-ship -> พร้อมส่ง, /admin/sales/preorder -> พรีออเดอร์
let previousSalesRoute = ''

function syncFilterFromRoute() {
  const orderType = route.meta?.orderType
  const routeChanged = route.fullPath !== previousSalesRoute
  if (routeChanged) salesView.value = orderType ? 'orders' : 'summary'
  typeFilter.value = orderType || 'all'
  previousSalesRoute = route.fullPath
}

watch(() => route.fullPath, syncFilterFromRoute, { immediate: true })

// ── ให้ตัวกรอง "สรุปยอดขายรายสินค้า" ตามตัวกรองประเภทออเดอร์ทุกครั้งที่เปลี่ยน ──
// (ไม่ว่าจะสลับด้วยเมนูด้านซ้าย ปุ่มทั้งหมด/พร้อมส่ง/พรีออเดอร์ หรือ path ตรง ๆ)
watch(typeFilter, (val) => {
  productFilterType.value = val
}, { immediate: true })

const salesPageMeta = computed(() => {
  if (route.meta?.orderType === 'ready') {
    return {
      eyebrow: 'Admin Sales · พร้อมส่ง',
      title: 'รายการยอดขายพร้อมส่ง',
      subtitle: 'ดูและจัดการออเดอร์สินค้าพร้อมส่งทุกสถานะ พร้อมเปิดรายละเอียดได้ทันที',
    }
  }
  if (route.meta?.orderType === 'preorder') {
    return {
      eyebrow: 'Admin Sales · พรีออเดอร์',
      title: 'รายการยอดขายพรีออเดอร์',
      subtitle: 'ดูและจัดการออเดอร์สินค้าพรีออเดอร์ทุกสถานะ พร้อมเปิดรายละเอียดได้ทันที',
    }
  }
  return {
    eyebrow: 'Admin Sales',
    title: 'รายการยอดขาย',
    subtitle: 'ดูยอดขายพร้อมส่งและพรีออเดอร์ทุกสถานะในที่เดียว พร้อมเปิดรายละเอียดได้ทันที',
  }
})

function goToSalesView(type) {
  if (type === 'ready') router.push('/admin/sales/ready-to-ship')
  else if (type === 'preorder') router.push('/admin/sales/preorder')
  else router.push('/admin/sales')
}

// ── ยอดรวมของออเดอร์ในหน้าต่างรายละเอียด (modal) ให้ตรงกับหน้า "รายการจัดส่ง" ──
// พรีออเดอร์: total_amount (ค่าสินค้า) + ค่าจัดส่ง + ค่านำเข้า + ค่าส่งจากจีน
// พร้อมส่ง: total_amount รวมค่าจัดส่งไว้แล้วตั้งแต่ตอนสร้างออเดอร์ จึงใช้ตรง ๆ ได้เลย
function getOrderDetailTotal(order) {
  const total = Number(order?.total_amount || 0)
  if (String(order?.Order_type || '').toLowerCase() !== 'preorder') return total
  return (
    total +
    Number(order?.shipping_fee || 0) +
    Number(order?.import_fee_total || 0) +
    Number(order?.china_shipping_total_thb || 0)
  )
}

// ── ค่าสินค้าล้วน ๆ ของออเดอร์ในหน้าต่างรายละเอียด (ไม่รวมค่าจัดส่ง/ค่านำเข้า/ค่าส่งจากจีน) ──
// รวมจากรายการสินค้าจริง (items) โดยตรง แทนที่จะใช้ total_amount เพราะออเดอร์ "พร้อมส่ง"
// เก็บค่าจัดส่งปนไว้ใน total_amount ตั้งแต่ตอนสร้างออเดอร์ ต่างจากออเดอร์ "พรีออเดอร์" ที่ total_amount
// เป็นค่าสินค้าล้วน ๆ อยู่แล้ว การรวมจาก items ตรง ๆ จะได้ตัวเลขที่ถูกต้องเสมอไม่ว่าประเภทไหน
function getOrderProductTotal(order) {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.qty || 0),
    0,
  )
}

function getOrderProductSubtotal(order) {
  const itemTotal = getOrderProductTotal(order)
  if (itemTotal > 0) return itemTotal

  return Math.max(
    (Number(order?.total_amount) || 0) - (Number(order?.shipping_fee) || 0),
    0,
  )
}

// ── ใช้จำกัดขอบเขตการแสดงคอลัมน์ "ค่าส่ง" ในตาราง "จัดการรายการยอดขาย"
// ให้เห็นเฉพาะหน้า /admin/sales/preorder เท่านั้น ไม่กระทบหน้า /admin/sales และ /admin/sales/ready-to-ship
const isPreorderSalesPage = computed(() => route.meta?.orderType === 'preorder')

const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    const matchesType =
      typeFilter.value === 'all' ||
      String(order.Order_type || '').toLowerCase() === typeFilter.value
    const matchesStatus =
      statusFilter.value === 'all' ||
      String(order.status || '').toLowerCase() === statusFilter.value.toLowerCase()
    const query = searchQuery.value.trim().toLowerCase()
    const matchesSearch =
      !query ||
      String(order.order_id).includes(query) ||
      String(order.username || '')
        .toLowerCase()
        .includes(query) ||
      String(order.full_name || '')
        .toLowerCase()
        .includes(query)

    return matchesType && matchesStatus && matchesSearch
  })
})

const orderStats = computed(() => ({
  all: orders.value.length,
  totalSales: orders.value.reduce(
    (sum, order) =>
      sum + Math.max((Number(order.total_amount) || 0) - (Number(order.shipping_fee) || 0), 0),
    0,
  ),
  paid: orders.value.filter((order) => normalizeStatus(order.status) === 'paid').length,
  preorder: orders.value.filter((order) => normalizeStatus(order.Order_type) === 'preorder').length,
  ready: orders.value.filter((order) => normalizeStatus(order.Order_type) === 'ready').length,
  pending: orders.value.filter((order) => normalizeStatus(order.status) === 'pending').length,
  Shipped: orders.value.filter((order) => normalizeStatus(order.status) === 'shipped').length,
  Delivered: orders.value.filter((order) => normalizeStatus(order.status) === 'delivered').length,
  Slip_submitted: orders.value.filter(
    (order) => normalizeStatus(order.status) === 'slip_submitted',
  ).length,
  Import_slip_submitted: orders.value.filter(
    (order) => normalizeStatus(order.status) === 'import_slip_submitted',
  ).length,
}))

// ── สถิติของออเดอร์ที่ถูกจำกัดขอบเขตตาม typeFilter (ทั้งหมด/พร้อมส่ง/พรีออเดอร์) ──
// ใช้กับการ์ดสรุปด้านบนตอนอยู่หน้า "จัดการรายการยอดขาย" เพื่อให้ตัวเลขตรงกับตัวกรองที่เลือก
const scopedOrders = computed(() => {
  if (typeFilter.value === 'all') return orders.value
  return orders.value.filter((order) => normalizeStatus(order.Order_type) === typeFilter.value)
})

const orderKpiStats = computed(() => {
  const list = scopedOrders.value
  // ให้ยอดขายรวม (ไม่รวมค่าส่ง) ใช้แหล่งข้อมูลเดียวกับหน้า "สรุปยอดขายรายสินค้า"
  // (รวมจาก order_details.Price * qty ตรง ๆ) เพื่อให้ตัวเลขตรงกันเสมอ แทนที่จะคำนวณจาก
  // orders.total_amount - orders.shipping_fee ซึ่งรวมค่าส่งจากจีนของพรีออเดอร์ปนอยู่
  const type = String(typeFilter.value || 'all').toLowerCase()
  let productRows = aggregatedProductSales.value
  if (type !== 'all') {
    productRows = productRows.filter((r) => {
      const itemType = String(r.item_type || '').toLowerCase()
      return type === 'preorder' ? itemType === 'preorder' : itemType !== 'preorder'
    })
  }
  return {
    totalSales: productRows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    all: list.length,
    paid: list.filter((order) => normalizeStatus(order.status) === 'paid').length,
  }
})

// ── สถิติของสรุปยอดขายรายสินค้าที่ถูกจำกัดขอบเขตตาม productFilterType ──
// ใช้กับการ์ดสรุปด้านบนตอนอยู่หน้า "สรุปยอดขายรายสินค้า" ให้ตัวเลขตรงกับตัวกรอง ทั้งหมด/พร้อมส่ง/พรีออเดอร์
const summaryKpiStats = computed(() => {
  const type = String(productFilterType.value || 'all').toLowerCase()
  let rows = aggregatedProductSales.value
  if (type !== 'all') {
    rows = rows.filter((r) => {
      const itemType = String(r.item_type || '').toLowerCase()
      return type === 'preorder' ? itemType === 'preorder' : itemType !== 'preorder'
    })
  }
  return {
    totalSales: rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    productCount: rows.length,
    totalQty: rows.reduce((sum, r) => sum + (Number(r.sold_qty) || 0), 0),
  }
})

// Aggregate product sales by product id and item type (ignore flavor) so preorder and ready-to-ship rows stay separate
const aggregatedProductSales = computed(() => {
  const rows = Array.isArray(productSalesSummary.value) ? productSalesSummary.value : []
  const map = new Map()

  for (const r of rows) {
    const itemType = String(r.item_type || '')
      .trim()
      .toLowerCase()
    const key = [String(r.prod_id || r.id || r.product_id || r.name).trim(), itemType].join('|')
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        prod_id: r.prod_id,
        name: r.name,
        category_name: r.category_name,
        item_type: itemType,
        image_url: r.image_url,
        // keep a representative unit_price (first seen)
        unit_price: r.unit_price,
        sold_qty: Number(r.sold_qty || 0),
        total_amount: Number(r.total_amount || 0),
        details: [r],
      })
      continue
    }
    existing.sold_qty += Number(r.sold_qty || 0)
    existing.total_amount += Number(r.total_amount || 0)
    if (!existing.image_url && r.image_url) {
      existing.image_url = r.image_url
    }
    existing.details.push(r)
  }

  // Recompute unit_price as a weighted average (total_amount / sold_qty) so it always
  // stays consistent with the summed qty and total, even when a product was sold at
  // more than one price (price changes, promos, multiple flavors, etc). Falling back
  // to the representative price only when qty is 0 avoids a divide-by-zero.
  for (const item of map.values()) {
    item.unit_price =
      item.sold_qty > 0 ? item.total_amount / item.sold_qty : Number(item.unit_price) || 0
    item.has_mixed_prices = item.details.length > 1 &&
      new Set(item.details.map((d) => Number(d.unit_price))).size > 1
  }

  return [...map.values()].sort((a, b) => {
    const typeRank = (value) => (String(value || '').toLowerCase() === 'preorder' ? 0 : 1)
    const rankDiff = typeRank(a.item_type) - typeRank(b.item_type)
    if (rankDiff !== 0) return rankDiff

    const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), 'th')
    if (nameDiff !== 0) return nameDiff

    return Number(b.sold_qty || 0) - Number(a.sold_qty || 0)
  })
})

const filteredProductSales = computed(() => {
  let list = aggregatedProductSales.value.slice()

  const name = String(productFilterName.value || '')
    .trim()
    .toLowerCase()
  const type = String(productFilterType.value || '')
    .trim()
    .toLowerCase()
  const minSold = Number(productFilterMinSold.value || 0)

  if (name) {
    list = list.filter((p) =>
      String(p.name || '')
        .toLowerCase()
        .includes(name),
    )
  }

  if (type && type !== 'all') {
    // item_type ของสินค้าพร้อมส่งจะถูกเก็บเป็นค่าว่าง ('') ไม่ใช่ 'ready' หรือ 'ready-to-ship'
    // ดังนั้นถือว่าอะไรก็ตามที่ไม่ใช่ 'preorder' คือสินค้าพร้อมส่ง
    list = list.filter((p) => {
      const itemType = String(p.item_type || '').toLowerCase()
      return type === 'preorder' ? itemType === 'preorder' : itemType !== 'preorder'
    })
  }

  if (!Number.isNaN(minSold) && minSold > 0) {
    list = list.filter((p) => Number(p.sold_qty || 0) >= minSold)
  }

  list = list.slice().sort((a, b) => Number(b.sold_qty || 0) - Number(a.sold_qty || 0))

  if (productFilterTopN.value && String(productFilterTopN.value) !== 'all') {
    const n = Number(productFilterTopN.value) || 0
    if (n > 0) list = list.slice(0, n)
  }

  return list
})

// Product detail modal state
const showProductDetail = ref(false)
const selectedProductDetails = ref(null)

function openProductDetails(prod) {
  selectedProductDetails.value = prod
  showProductDetail.value = true
}

function closeProductDetails() {
  selectedProductDetails.value = null
  showProductDetail.value = false
}

const aggregatedSelectedProductRows = computed(() => {
  const rows = Array.isArray(selectedProductDetails.value?.details)
    ? selectedProductDetails.value.details
    : []
  const map = new Map()

  for (const r of rows) {
    const flavor = String(r.flavor || '').trim()
    const type = String(r.item_type || '').trim()
    const unitPrice = Number(r.unit_price || 0)
    const roundId = r.preorder_round_id != null ? String(r.preorder_round_id) : ''
    const key = `${flavor}|${type}|${unitPrice}|${roundId}`

    if (!map.has(key)) {
      map.set(key, {
        flavor,
        item_type: type,
        unit_price: unitPrice,
        sold_qty: Number(r.sold_qty || 0),
        total_amount: Number(r.sold_qty || 0) * unitPrice,
        category_name: r.category_name,
        name: r.name,
        preorder_round_id: r.preorder_round_id ?? null,
        preorder_round_name: r.preorder_round_name || '',
      })
      continue
    }

    const e = map.get(key)
    e.sold_qty += Number(r.sold_qty || 0)
    e.total_amount += Number(r.sold_qty || 0) * unitPrice
  }

  return [...map.values()]
})

const selectedProductDetailTotals = computed(() => {
  return aggregatedSelectedProductRows.value.reduce(
    (totals, row) => {
      totals.qty += Number(row.sold_qty || 0)
      totals.amount += Number(row.unit_price || 0) * Number(row.sold_qty || 0)
      return totals
    },
    { qty: 0, amount: 0 },
  )
})

function toggleProductFilters() {
  showProductFilters.value = !showProductFilters.value
}

const summarizedOrderItems = computed(() => {
  const items = Array.isArray(selectedOrder.value?.items) ? selectedOrder.value.items : []
  const groupedItems = new Map()

  for (const item of items) {
    const unitPrice = Number(item.unit_price || 0)
    const quantity = Number(item.qty || 0)
    const flavor = String(item.flavor || '').trim()
    const groupKey = [
      String(item.name || '')
        .trim()
        .toLowerCase(),
      flavor.toLowerCase(),
      String(item.item_type || '')
        .trim()
        .toLowerCase(),
      String(unitPrice),
      String(item.category_name || '')
        .trim()
        .toLowerCase(),
    ].join('|')

    if (!groupedItems.has(groupKey)) {
      groupedItems.set(groupKey, {
        ...item,
        qty: quantity,
        unit_price: unitPrice,
        merged_count: 1,
        detail_ids: [item.detail_id],
      })
      continue
    }

    const groupedItem = groupedItems.get(groupKey)
    groupedItem.qty += quantity
    groupedItem.merged_count += 1
    groupedItem.detail_ids.push(item.detail_id)
  }

  return [...groupedItems.values()]
})

function getItemLabel(item) {
  const flavor = String(item?.flavor || '').trim()
  const labelParts = [String(item?.name || '-')]
  if (flavor) {
    labelParts.push(`รสชาติ: ${flavor}`)
  }
  return labelParts.join(' · ')
}

async function fetchProductSalesSummary() {
  productSalesLoading.value = true
  productSalesError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/admin/order-item-summary`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      throw new Error('โหลดสรุปยอดขายรายสินค้าไม่สำเร็จ')
    }

    productSalesSummary.value = await response.json()
  } catch (err) {
    productSalesError.value = translateError(err)
    productSalesSummary.value = []
  } finally {
    productSalesLoading.value = false
  }
}

async function refreshDashboard() {
  await Promise.all([fetchOrders(), fetchProductSalesSummary()])
}

async function fetchOrders() {
  loading.value = true
  error.value = ''

  try {
    // หมายเหตุ: ดึงออเดอร์ "ทั้งหมด" มาเก็บไว้เสมอ ไม่กรองที่ฝั่งเซิร์ฟเวอร์ด้วย type/status/search
    // เพราะตัวกรองประเภท (ทั้งหมด/พร้อมส่ง/พรีออเดอร์) ถูกสลับแบบ client-side (เปลี่ยน route โดยไม่โหลดหน้าใหม่)
    // ถ้ากรองตั้งแต่ตอนขอข้อมูล จะทำให้ orders.value ค้างเป็นชุดเก่าที่ไม่ตรงกับตัวกรองที่เพิ่งสลับไป
    const params = new URLSearchParams()

    const response = await fetch(`${API_BASE_URL}/admin/orders?${params.toString()}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      throw new Error('โหลดรายการออเดอร์ไม่สำเร็จ')
    }

    orders.value = await response.json()
  } catch (err) {
    error.value = translateError(err)
  } finally {
    loading.value = false
  }
}

async function openOrder(order) {
  selectedOrder.value = order
  selectedOrderError.value = ''
  selectedOrderLoading.value = true

  try {
    const orderSummary = selectedOrder.value
    const response = await fetch(`${API_BASE_URL}/orders/${order.order_id}`, {
      headers: authHeaders(),
    })
    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดรายละเอียดออเดอร์ได้')
    }
    const detail = await response.json()
    selectedOrder.value = {
      ...orderSummary,
      ...detail,
      full_name: detail.full_name || orderSummary?.full_name || '',
      username: detail.username || orderSummary?.username || '',
    }
  } catch (err) {
    selectedOrderError.value = translateError(err)
  } finally {
    selectedOrderLoading.value = false
  }
}

function closeOrder() {
  selectedOrder.value = null
  selectedOrderError.value = ''
}

let mobileOrderModalBodyOverflow = ''
let mobileOrderModalScrollLocked = false

function syncMobileOrderModalScrollLock(order) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const shouldLock = Boolean(order) && window.matchMedia('(max-width: 767px)').matches
  if (shouldLock && !mobileOrderModalScrollLocked) {
    mobileOrderModalBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobileOrderModalScrollLocked = true
    return
  }

  if (!shouldLock && mobileOrderModalScrollLocked) {
    document.body.style.overflow = mobileOrderModalBodyOverflow
    mobileOrderModalBodyOverflow = ''
    mobileOrderModalScrollLocked = false
  }
}

watch(selectedOrder, syncMobileOrderModalScrollLock, { immediate: true })

function printSelectedOrder() {
  if (!selectedOrder.value || selectedOrderLoading.value) return

  printOrder({
    ...selectedOrder.value,
    items: summarizedOrderItems.value,
  })
}

function goBack() {
  router.push('/admin/home')
}

function viewSlipList() {
  router.push('/admin/slips')
}

function handleKeydown(e) {
  if (e.key !== 'Escape') return
  if (previewImage.value) {
    closeImagePreview()
    return
  }
  if (
    selectedOrder.value &&
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  ) {
    closeOrder()
  }
}

onMounted(() => {
  refreshDashboard()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  syncMobileOrderModalScrollLock(null)
})
</script>

<template>
  <div class="admin-order-page">
    <AdminPageHeader :title="salesPageMeta.title" :description="salesPageMeta.subtitle"><div class="hero-actions">
        <button class="ghost-btn" type="button" @click="goBack">กลับ Dashboard</button>
        <button class="primary-btn" type="button" @click="viewSlipList">ไปหน้าสลิป</button>
      </div></AdminPageHeader>

    <!-- ── QUICK SWITCH: ทั้งหมด / พร้อมส่ง / พรีออเดอร์ ── -->
    <div class="sales-type-switch">
      <button
        type="button"
        class="sales-type-pill"
        :class="{ 'sales-type-pill--active': !route.meta?.orderType }"
        @click="goToSalesView('all')"
      >
        <span class="sales-type-pill__dot sales-type-pill__dot--all"></span>
        ทั้งหมด
        <span class="sales-type-pill__count">{{ orderStats.all }}</span>
      </button>
      <button
        type="button"
        class="sales-type-pill"
        :class="{ 'sales-type-pill--active': route.meta?.orderType === 'ready' }"
        @click="goToSalesView('ready')"
      >
        <span class="sales-type-pill__dot sales-type-pill__dot--ready"></span>
        พร้อมส่ง
        <span class="sales-type-pill__count">{{ orderStats.ready }}</span>
      </button>
      <button
        type="button"
        class="sales-type-pill"
        :class="{ 'sales-type-pill--active': route.meta?.orderType === 'preorder' }"
        @click="goToSalesView('preorder')"
      >
        <span class="sales-type-pill__dot sales-type-pill__dot--pre"></span>
        พรีออเดอร์
        <span class="sales-type-pill__count">{{ orderStats.preorder }}</span>
      </button>
    </div>

    <section class="kpi-grid">
      <template v-if="salesView === 'summary'">
        <article class="kpi-card">
          <p class="kpi-label">ยอดขายรวม (ไม่รวมค่าส่ง)</p>
          <p class="kpi-value">{{ formatMoney(summaryKpiStats.totalSales) }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">รายการสินค้าทั้งหมด</p>
          <p class="kpi-value">{{ summaryKpiStats.productCount }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">จำนวนชิ้นที่ขายได้</p>
          <p class="kpi-value">{{ summaryKpiStats.totalQty }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">พรีออเดอร์</p>
          <p class="kpi-value">{{ orderStats.preorder }}</p>
        </article>
      </template>
      <template v-else>
        <article class="kpi-card">
          <p class="kpi-label">ยอดขายรวม (ไม่รวมค่าส่ง)</p>
          <p class="kpi-value">{{ formatMoney(orderKpiStats.totalSales) }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">รายการทั้งหมด</p>
          <p class="kpi-value">{{ orderKpiStats.all }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">ชำระแล้ว</p>
          <p class="kpi-value">{{ orderKpiStats.paid }}</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-label">พรีออเดอร์</p>
          <p class="kpi-value">{{ orderStats.preorder }}</p>
        </article>
      </template>
    </section>

    <div class="view-filter-row">
      <span class="view-filter-label">ตัวกรองมุมมอง</span>
      <select
        v-model="salesView"
        class="filter-select view-filter-select"
        aria-label="ตัวกรองมุมมอง"
      >
        <option value="summary">สรุปยอดขายรายสินค้า</option>
        <option value="orders">จัดการรายการยอดขาย</option>
      </select>
    </div>

    <section v-if="salesView === 'summary'" class="panel summary-panel">
      <header class="panel-head panel-head--stacked">
        <div>
          <h2>สรุปยอดขายรายสินค้า</h2>
          <p>ดูว่ารายการไหนถูกขายรวมทั้งหมดกี่ชิ้นจากทุกออเดอร์</p>
        </div>
        <button class="ghost-btn" type="button" @click="fetchProductSalesSummary">
          รีเฟรชสรุป
        </button>
      </header>

      <div class="summary-strip summary-strip--wide">
        <div>
          <span>สินค้าทั้งหมดที่ขายได้</span
          ><strong>{{ summaryKpiStats.productCount }} รายการ</strong>
        </div>
        <div>
          <span>จำนวนชิ้นรวม</span><strong>{{ summaryKpiStats.totalQty }} ชิ้น</strong>
        </div>
        <button class="ghost-btn summary-toggle-btn" type="button" @click="toggleProductFilters">
          {{ showProductFilters ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง' }}
        </button>
      </div>

      <transition name="fade">
        <div v-if="showProductFilters" class="summary-filters">
          <input
            v-model="productFilterName"
            class="filter-input"
            type="search"
            placeholder="ค้นหาชื่อสินค้า"
          />

          <div class="summary-type-buttons" role="group" aria-label="กรองประเภทสินค้า">
            <button
              class="filter-btn"
              :class="{ active: productFilterType === 'all' }"
              type="button"
              @click="productFilterType = 'all'"
            >
              ทั้งหมด
            </button>
            <button
              class="filter-btn"
              :class="{ active: productFilterType === 'ready' }"
              type="button"
              @click="productFilterType = 'ready'"
            >
              พร้อมส่งสินค้า
            </button>
            <button
              class="filter-btn"
              :class="{ active: productFilterType === 'preorder' }"
              type="button"
              @click="productFilterType = 'preorder'"
            >
              สินค้าพรีออเดอร์
            </button>
          </div>

          <input
            v-model.number="productFilterMinSold"
            class="filter-input filter-input--small"
            type="number"
            min="0"
            placeholder="จำนวนขั้นต่ำ"
          />

          <select v-model="productFilterTopN" class="filter-select">
            <option value="all">ทั้งหมด</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="50">Top 50</option>
          </select>

          <div class="filter-summary">
            แสดง {{ filteredProductSales.length }} / {{ productSalesSummary.length }}
          </div>
        </div>
      </transition>

      <div v-if="productSalesLoading" class="state-box">กำลังโหลดสรุปยอดขายรายสินค้า...</div>
      <div v-else-if="productSalesError" class="state-box state-box--error">
        {{ productSalesError }}
      </div>
      <div v-else-if="filteredProductSales.length === 0" class="empty-box">
        ยังไม่มีข้อมูลสรุปยอดขายรายสินค้า
      </div>
      <div v-else class="summary-table-wrap">
        <table class="summary-table">
          <thead>
            <tr>
              <th class="image-col">รูปภาพ</th>
              <th>สินค้า</th>
              <th>ประเภท</th>
              <th>ขายได้</th>
              <th>รวมมูลค่า</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredProductSales"
              :key="`prod-${item.prod_id}-${item.item_type}`"
            >
              <td class="image-col">
                <button
                  v-if="item.image_url"
                  type="button"
                  class="thumb-btn"
                  @click="openImagePreview(item.image_url, item.name, item.category_name)"
                  :aria-label="`ดูรูป ${item.name}`"
                >
                  <img
                    :src="item.image_url"
                    :alt="item.name"
                    class="summary-thumb"
                    loading="lazy"
                  />
                </button>
                <div v-else class="summary-thumb summary-thumb--placeholder">ไม่มีรูป</div>
              </td>
              <td>
                <strong>{{ item.name }}</strong>
                <p v-if="item.category_name">{{ item.category_name }}</p>
              </td>
              <td>
                <span
                  :class="[
                    'type-chip',
                    item.item_type === 'preorder' ? 'type-chip--pre' : 'type-chip--ready',
                  ]"
                >
                  {{ item.item_type === 'preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}
                </span>
              </td>
              <td>
                <strong>{{ Number(item.sold_qty || 0).toLocaleString('th-TH') }}</strong>
              </td>
              <td>{{ formatMoney(item.total_amount) }}</td>
              <td>
                <button class="slip-view-btn" type="button" @click="openProductDetails(item)">
                  รายละเอียด
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mobile-summary-product-list" aria-label="สรุปยอดขายรายสินค้า">
        <article v-for="item in filteredProductSales" :key="`mobile-product-${item.prod_id}-${item.item_type}`" class="mobile-summary-product-card">
          <div class="mobile-summary-product-card__head">
            <div>
              <strong>{{ item.name || '-' }}</strong>
              <span v-if="item.category_name">{{ item.category_name }}</span>
            </div>
            <span :class="['type-chip', item.item_type === 'preorder' ? 'type-chip--pre' : 'type-chip--ready']">
              {{ item.item_type === 'preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}
            </span>
          </div>
          <div class="mobile-summary-product-card__metrics">
            <div><span>ขายได้</span><strong>{{ Number(item.sold_qty || 0).toLocaleString('th-TH') }} ชิ้น</strong></div>
            <div><span>รวมมูลค่า</span><strong>{{ formatMoney(item.total_amount) }}</strong></div>
          </div>
          <button class="mobile-summary-product-card__detail" type="button" @click="openProductDetails(item)">
            ดูรายละเอียด
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </article>
      </div>
    </section>

    <section v-else class="panel">
      <header class="panel-head panel-head--stacked">
        <div>
          <h2>จัดการรายการยอดขาย</h2>
          <p>ค้นหาและกรองตามประเภทหรือสถานะการขาย</p>
        </div>
        <button class="ghost-btn" type="button" @click="refreshDashboard">รีเฟรช</button>
      </header>

      <div class="toolbar order-filter-toolbar">
        <input
          v-model="searchQuery"
          class="search-input order-filter-search"
          type="search"
          placeholder="ค้นหาด้วยเลขยอดขาย / ชื่อผู้ใช้ / ชื่อลูกค้า"
          @keyup.enter="fetchOrders"
        />

        <div class="order-filter-section" style="margin-left: auto">
          <label class="order-filter-title" for="order-type-select">ประเภทสลิป</label>
          <select
            id="order-type-select"
            v-model="typeFilter"
            class="filter-select order-filter-select"
          >
            <option value="all">ทั้งหมด</option>
            <option value="preorder">พรีออเดอร์</option>
            <option value="ready">พร้อมส่ง</option>
          </select>
        </div>

        <div class="order-filter-section">
          <label class="order-filter-title" for="order-status-select">สถานะการตรวจ</label>
          <select
            id="order-status-select"
            v-model="statusFilter"
            class="filter-select order-filter-select"
          >
            <option value="all">ทั้งหมด</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="paid">ชำระแล้ว</option>
            <option value="Shipped">กำลังจัดส่ง</option>
            <option value="Delivered">ลูกค้าได้รับแล้ว</option>
            <option value="Slip_submitted">รอตรวจสอบสลิป</option>
            <option value="Import_slip_submitted">รอตรวจสอบสลิปค่านำเข้า</option>
            <option value="wait_for_import_fee">รอนำเข้า</option>
            <option value="pending_import_fee">รอชำระค่านำเข้า</option>
            <option value="ready_to_ship">พร้อมจัดส่ง</option>
          </select>
        </div>

        <button class="primary-btn order-filter-search-btn" type="button" @click="fetchOrders">
          ค้นหา
        </button>
      </div>

      <div v-if="loading" class="state-box">กำลังโหลดรายการออเดอร์...</div>
      <div v-else-if="error" class="state-box state-box--error">{{ error }}</div>
      <div v-else-if="filteredOrders.length === 0" class="empty-box">ไม่พบรายการออเดอร์</div>

      <div v-else class="table-scroll">
        <table class="orders-table">
          <thead>
            <tr>
              <th>ออเดอร์</th>
              <th>ลูกค้า</th>
              <th>ประเภท</th>
              <th>รอบพรีออเดอร์</th>
              <th>ยอดเงิน{{ isPreorderSalesPage ? ' (รวมค่าส่ง)' : '' }}</th>
              <th>สถานะ</th>
              <th>รายการ</th>
              <th>วันที่</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filteredOrders" :key="order.order_id">
              <td>
                <strong>#{{ String(order.order_id).padStart(3, '0') }}</strong>
              </td>
              <td>
                <div class="customer-cell">
                  <strong>{{ order.full_name || order.username || '-' }}</strong>
                  <small>{{ order.username || '-' }}</small>
                </div>
              </td>
              <td>
                <span
                  :class="[
                    'type-chip',
                    order.Order_type === 'Preorder' ? 'type-chip--pre' : 'type-chip--ready',
                  ]"
                  >{{ getOrderTypeLabel(order.Order_type) }}</span
                >
              </td>
              <td>
                <span v-if="order.Order_type === 'Preorder' && order.preorder_round_name" class="round-badge">
                  {{ order.preorder_round_name }}
                </span>
                <span v-else class="round-badge round-badge--empty">-</span>
              </td>
              <td>{{ formatMoney(getOrderRowTotal(order)) }}</td>
              <td>
                <span
                  class="status-pill"
                  :style="{
                    color: getStatus(order.status).color,
                    background: getStatus(order.status).bg,
                  }"
                  >{{ getStatus(order.status).label }}</span
                >
              </td>
              <td>{{ order.item_count }} ชิ้น</td>
              <td>{{ formatDate(order.Order_date) }}</td>
              <td>
                <button class="slip-view-btn" type="button" @click="openOrder(order)">
                  ดูรายละเอียด
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="!loading && !error && filteredOrders.length"
        class="mobile-order-list"
        aria-label="รายการออเดอร์"
      >
        <article v-for="order in filteredOrders" :key="`mobile-${order.order_id}`" class="mobile-order-card">
          <header class="mobile-order-card__head">
            <div class="mobile-order-card__identity">
              <strong class="mobile-order-card__number">#{{ String(order.order_id).padStart(3, '0') }}</strong>
              <p>ลูกค้า: {{ order.full_name || order.username || '-' }}</p>
              <small>{{ order.username || '-' }}</small>
            </div>
            <div class="mobile-order-card__badges">
              <span :class="['type-chip', order.Order_type === 'Preorder' ? 'type-chip--pre' : 'type-chip--ready']">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
                {{ getOrderTypeLabel(order.Order_type) }}
              </span>
              <span class="status-pill mobile-order-status" :style="{ color: getStatus(order.status).color, background: getStatus(order.status).bg }">
                <span class="mobile-order-status__dot" :style="{ background: getStatus(order.status).color }"></span>
                {{ getStatus(order.status).label }}
              </span>
            </div>
          </header>

          <div class="mobile-order-divider"></div>

          <div class="mobile-order-card__meta">
            <div class="mobile-order-meta-item">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" /></svg>
              <span>จำนวนสินค้า</span>
              <strong>{{ order.item_count || order.total_qty || 0 }} ชิ้น</strong>
            </div>
            <div class="mobile-order-meta-item">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>
              <span>วันที่สั่งซื้อ</span>
              <strong>{{ formatDate(order.Order_date) }}</strong>
            </div>
            <div class="mobile-order-meta-item mobile-order-meta-item--total">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 14h3" /></svg>
              <span>ยอดรวม (ไม่รวมค่าส่ง)</span>
              <strong>{{ formatMoney(getOrderProductSubtotal(order)) }}</strong>
            </div>
          </div>

          <button class="mobile-order-detail-btn" type="button" @click="openOrder(order)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" /></svg>
            <span>ดูรายละเอียด</span>
            <svg class="mobile-order-detail-btn__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </article>
      </div>
    </section>

    <transition name="fade">
      <div v-if="selectedOrder" class="modal-overlay" @click.self="closeOrder">
        <div class="modal-card modal-card--order-detail">
          <div class="modal-head">
            <div>
              <h3>ออเดอร์ #{{ String(selectedOrder.order_id).padStart(3, '0') }}</h3>
              <p>
                {{ selectedOrder.full_name || selectedOrder.username || '-' }} ·
                {{ getOrderTypeLabel(selectedOrder.Order_type) }}
                <template v-if="selectedOrder.Order_type === 'Preorder' && selectedOrder.preorder_round_name">
                  · รอบ: {{ selectedOrder.preorder_round_name }}
                </template>
              </p>
            </div>
            <p class="mobile-order-subtitle">
              {{ selectedOrder.username || selectedOrder.user_id || '-' }} ·
              {{ getOrderTypeLabel(selectedOrder.Order_type) }}
            </p>
            <div class="modal-head__actions">
              <button
                v-if="!selectedOrderLoading && !selectedOrderError"
                class="print-order-btn"
                type="button"
                @click="printSelectedOrder"
              >
                พิมพ์ใบออเดอร์
              </button>
              <button class="close-btn" type="button" @click="closeOrder">✕</button>
            </div>
          </div>

          <div v-if="selectedOrderLoading" class="state-box">กำลังโหลดรายละเอียด...</div>
          <div v-else-if="selectedOrderError" class="state-box state-box--error">
            {{ selectedOrderError }}
          </div>
          <template v-else>
            <div class="summary-strip">
              <div>
                <span>ยอดรวม</span><strong>{{ formatMoney(getOrderDetailTotal(selectedOrder)) }}</strong>
              </div>
              <div>
                <span>ค่าสินค้า</span><strong>{{ formatMoney(getOrderProductTotal(selectedOrder)) }}</strong>
              </div>
              <div>
                <span>สถานะ</span><strong>{{ getStatus(selectedOrder.status).label }}</strong>
              </div>
              <div>
                <span>วันที่</span><strong>{{ formatDate(selectedOrder.Order_date) }}</strong>
              </div>
              <div>
                <span>จำนวนสินค้า</span><strong>{{ selectedOrder.total_qty || 0 }} ชิ้น</strong>
              </div>
              <div>
                <span>ค่าจัดส่ง</span><strong>{{ formatMoney(selectedOrder.shipping_fee || 0) }}</strong>
              </div>
              <template v-if="selectedOrder.Order_type === 'Preorder'">
                <div>
                  <span>ค่านำเข้า</span><strong>{{ formatMoney(selectedOrder.import_fee_total || 0) }}</strong>
                </div>
                <div>
                  <span>ค่าส่งจากจีน</span><strong>{{ formatMoney(selectedOrder.china_shipping_total_thb || 0) }}</strong>
                </div>
              </template>
            </div>

            <div class="items-list">
              <div
                v-for="item in summarizedOrderItems"
                :key="item.detail_ids?.join('-') || item.detail_id"
                class="item-row"
              >
                <div class="item-thumb-cell">
                  <button
                    v-if="item.image"
                    type="button"
                    class="thumb-btn"
                    @click="openImagePreview(item.image, getItemLabel(item), item.category_name)"
                    :aria-label="`ดูรูป ${getItemLabel(item)}`"
                  >
                    <img
                      :src="item.image"
                      :alt="item.name"
                      class="item-thumb"
                      loading="lazy"
                    />
                  </button>
                  <div v-else class="item-thumb item-thumb--placeholder">ไม่มีรูป</div>
                </div>
                <div>
                  <strong>{{ getItemLabel(item) }}</strong>
                  <p v-if="item.category_name">{{ item.category_name }}</p>
                  <p v-if="item.merged_count > 1" class="item-merge-note">
                    รวมจาก {{ item.merged_count }} รายการย่อย
                  </p>
                </div>
                <div>฿{{ Number(item.unit_price || 0).toLocaleString('th-TH') }}</div>
                <div>x{{ item.qty }}</div>
                <div>
                  ฿{{
                    (Number(item.unit_price || 0) * Number(item.qty || 0)).toLocaleString('th-TH')
                  }}
                </div>
                <div>
                  <span
                    :class="[
                      'type-chip',
                      item.item_type === 'preorder' ? 'type-chip--pre' : 'type-chip--ready',
                    ]"
                    >{{ item.item_type === 'preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}</span
                  >
                </div>
              </div>
            </div>
          </template>

          <div class="mobile-order-detail">
            <section class="mobile-order-total-panel">
              <div>
                <span>ยอดรวม</span>
                <strong>{{ formatMoney(getOrderDetailTotal(selectedOrder)) }}</strong>
              </div>
              <span class="mobile-order-detail-status" :style="{ color: getStatus(selectedOrder.status).color, background: getStatus(selectedOrder.status).bg }">
                <span class="mobile-order-status__dot" :style="{ background: getStatus(selectedOrder.status).color }"></span>
                {{ getStatus(selectedOrder.status).label }}
              </span>
            </section>

            <section class="mobile-order-detail-summary">
              <div class="mobile-order-detail-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-2 7H6zM7 7l2-4h6l2 4M8 18h8" /></svg>
                <span>ค่าสินค้า</span>
                <strong>{{ formatMoney(getOrderProductTotal(selectedOrder)) }}</strong>
              </div>
              <div class="mobile-order-detail-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h12v10H3zM15 10h4l2 3v4h-6zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>
                <span>ค่าจัดส่ง</span>
                <strong>{{ formatMoney(selectedOrder.shipping_fee || 0) }}</strong>
              </div>
              <div class="mobile-order-detail-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" /></svg>
                <span>จำนวนสินค้า</span>
                <strong>{{ selectedOrder.total_qty || 0 }} ชิ้น</strong>
              </div>
              <div class="mobile-order-detail-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>
                <span>วันที่</span>
                <strong>{{ formatDate(selectedOrder.Order_date) }}</strong>
              </div>
            </section>

            <div class="mobile-order-detail-divider"></div>
            <div class="mobile-order-items-heading">
              <h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" /></svg>รายการสินค้า</h4>
              <strong>{{ selectedOrder.total_qty || 0 }} ชิ้น</strong>
            </div>

            <div class="mobile-order-items">
              <article v-for="item in summarizedOrderItems" :key="`mobile-detail-${item.detail_ids?.join('-') || item.detail_id}`" class="mobile-order-item">
                <strong class="mobile-order-item__name">{{ item.name || '-' }}</strong>
                <span v-if="item.flavor" class="mobile-order-item__variant">รสชาติ: {{ item.flavor }}</span>
                <span v-if="item.category_name" class="mobile-order-item__category">{{ item.category_name }}</span>
                <div class="mobile-order-item__metrics">
                  <div><span>ราคาต่อชิ้น</span><strong>{{ formatMoney(item.unit_price) }}</strong></div>
                  <div><span>จำนวน</span><strong>x{{ item.qty }}</strong></div>
                  <div><span>ราคารวม</span><strong>{{ formatMoney(Number(item.unit_price || 0) * Number(item.qty || 0)) }}</strong></div>
                </div>
              </article>
            </div>

            <section class="mobile-order-breakdown">
              <div><span>ค่าสินค้า</span><strong>{{ formatMoney(getOrderProductTotal(selectedOrder)) }}</strong></div>
              <div><span>ค่าจัดส่ง</span><strong>{{ formatMoney(selectedOrder.shipping_fee || 0) }}</strong></div>
              <div class="mobile-order-breakdown__total"><span>ยอดรวม</span><strong>{{ formatMoney(getOrderDetailTotal(selectedOrder)) }}</strong></div>
            </section>
          </div>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="showProductDetail" class="modal-overlay" @click.self="closeProductDetails">
        <div class="modal-card modal-card--product">
          <div class="modal-head">
            <div>
              <h3>รายละเอียดสินค้า {{ selectedProductDetails?.name }}</h3>
              <p>{{ selectedProductDetails?.category_name || '' }}</p>
            </div>
            <button class="close-btn" type="button" @click="closeProductDetails">✕</button>
          </div>

          <div class="summary-strip">
            <div>
              <span>จำนวนชิ้นรวม</span>
              <strong>{{ selectedProductDetailTotals.qty.toLocaleString('th-TH') }} ชิ้น</strong>
            </div>
            <div>
              <span>รวมมูลค่า</span>
              <strong>{{ formatMoney(selectedProductDetailTotals.amount || 0) }}</strong>
            </div>
          </div>

          <div class="items-list">
            <div
              class="item-row product-detail-row"
              v-for="row in aggregatedSelectedProductRows"
              :key="(row.flavor || 'nof') + '-' + row.item_type + '-' + (row.preorder_round_id ?? 'none')"
            >
              <div class="product-detail-name">
                <strong>{{ row.name }}</strong>
                <small v-if="row.flavor">รสชาติ: {{ row.flavor }}</small>
                <p v-if="row.category_name">{{ row.category_name }}</p>
              </div>
              <div class="product-detail-metric">
                <span>ราคา/ชิ้น</span>
                <strong>{{ formatMoney(row.unit_price) }}</strong>
              </div>
              <div class="product-detail-metric">
                <span>จำนวน</span>
                <strong>x{{ Number(row.sold_qty || 0) }}</strong>
              </div>
              <div class="product-detail-metric product-detail-metric--total">
                <span>รวมมูลค่า</span>
                <strong>{{ formatMoney(row.total_amount) }}</strong>
              </div>
              <div class="product-detail-round">
                <span class="product-detail-label">รอบพรีออเดอร์</span>
                <span v-if="row.item_type === 'preorder' && row.preorder_round_name" class="round-badge">
                  {{ row.preorder_round_name }}
                </span>
                <span v-else class="round-badge round-badge--empty">-</span>
              </div>
              <div class="product-detail-type">
                <span
                  :class="[
                    'type-chip',
                    row.item_type === 'preorder' ? 'type-chip--pre' : 'type-chip--ready',
                  ]"
                >
                  {{ row.item_type === 'preorder' ? 'พรีออเดอร์' : 'พร้อมส่ง' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="previewImage" class="modal-overlay" @click.self="closeImagePreview">
        <div class="image-modal-card">
          <button type="button" class="close-btn image-modal-close" @click="closeImagePreview" aria-label="ปิด">✕</button>
          <img :src="previewImage.url" :alt="previewImage.title" class="image-modal-img" />
          <p class="image-modal-caption">
            {{ previewImage.title }}<span v-if="previewImage.subtitle"> · {{ previewImage.subtitle }}</span>
          </p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.price-mixed-hint {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.72rem;
  color: #8a7ba8;
  cursor: help;
}

.admin-order-page {
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(255, 183, 214, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 145, 255, 0.16), transparent 26%), #faf7ff;
  color: #2c2440;
  display: grid;
  gap: 1rem;
}

.hero-panel,
.panel,
.kpi-card,
.state-box,
.empty-box,
.modal-card {
  box-shadow: 0 18px 32px rgba(140, 99, 174, 0.08);
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.2rem;
  border-radius: 18px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background:
    radial-gradient(circle at right top, rgba(255, 147, 184, 0.22), transparent 52%),
    rgba(255, 255, 255, 0.9);
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  color: #a45bd6;
  font-weight: 700;
}

.hero-copy h1,
.panel-head h2,
.modal-head h3 {
  color: #432f61;
  font-weight: 900;
}

.hero-copy p {
  margin-top: 0.45rem;
  color: #6b5a84;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ── SALES TYPE QUICK SWITCH ── */
.sales-type-switch {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
  padding: 0.3rem;
  background: rgba(182, 115, 238, 0.08);
  border-radius: 999px;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
}

.sales-type-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: none;
  background: transparent;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #6b5a84;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.sales-type-pill:hover {
  color: #432f61;
}

.sales-type-pill--active {
  background: linear-gradient(135deg, var(--theme-primary, #b673ee), var(--theme-accent, #ff93b8));
  color: #fff;
  box-shadow: 0 6px 16px rgba(182, 115, 238, 0.35);
}

.sales-type-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sales-type-pill__dot--all {
  background: #8a7c9c;
}

.sales-type-pill__dot--ready {
  background: #15803d;
}

.sales-type-pill--active .sales-type-pill__dot--ready {
  background: #d7ffe9;
}

.sales-type-pill__dot--pre {
  background: #b45309;
}

.sales-type-pill--active .sales-type-pill__dot--pre {
  background: #ffe8c7;
}

.sales-type-pill--active .sales-type-pill__dot--all {
  background: #f1e9fb;
}

.sales-type-pill__count {
  font-size: 0.74rem;
  font-weight: 800;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}

.sales-type-pill--active .sales-type-pill__count {
  background: rgba(255, 255, 255, 0.28);
}

.kpi-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.kpi-card {
  border-radius: 15px;
  border: 1px solid rgba(160, 126, 191, 0.14);
  background: rgba(255, 255, 255, 0.9);
  padding: 0.9rem;
}

.kpi-label {
  margin: 0;
  color: #7b6992;
  font-size: 0.82rem;
}

.kpi-value {
  margin: 0.25rem 0 0;
  font-size: 1.7rem;
  font-weight: 900;
  color: #432f61;
}

.panel {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20px;
  padding: 1.1rem;
  border: 1px solid rgba(160, 126, 191, 0.14);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.panel-head--stacked {
  align-items: flex-start;
}

.view-filter-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.35rem 0 0.9rem;
  padding: 0.6rem 0.8rem;
  flex-wrap: wrap;
  width: fit-content;
  border: 1px dashed rgba(160, 126, 191, 0.22);
  border-radius: 14px;
  background: #fbf8ff;
}

.view-filter-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #6b5a84;
  white-space: nowrap;
}

.view-filter-select {
  min-width: 230px;
}

.view-filter-select:focus {
  outline: none;
  border-color: rgba(111, 80, 160, 0.45);
  box-shadow: 0 0 0 3px rgba(161, 125, 242, 0.12);
}

.toolbar,
.filter-row {
  display: flex;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.order-filter-toolbar {
  align-items: center;
  overflow-x: auto;
  padding-bottom: 0.15rem;
}

.order-filter-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px dashed rgba(160, 126, 191, 0.22);
  border-radius: 14px;
  background: #fbf8ff;
  flex: 0 0 auto;
}

.order-filter-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #6b5a84;
  white-space: nowrap;
  margin-right: 0.45rem;
}

.order-filter-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: nowrap;
  flex: 0 0 auto;
}

.order-filter-search {
  flex: 0 0 360px;
}

.order-filter-search-btn {
  flex: 0 0 auto;
}

.order-filter-bar .filter-btn {
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 0.4rem 0.78rem;
}

.order-filter-bar .search-input {
  margin-bottom: 0;
}

.filter-row--muted {
  padding-bottom: 0.2rem;
}

.search-input {
  flex: 1 1 300px;
  min-width: 0;
  border: 1px solid rgba(160, 126, 191, 0.2);
  border-radius: 999px;
  padding: 0.8rem 1rem;
  background: #fff;
}

.ghost-btn,
.primary-btn,
.filter-btn,
.slip-view-btn,
.close-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
}

.filter-row .filter-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.summary-filters {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin: 0.8rem 0 1rem 0;
  flex-wrap: wrap;
  padding: 0.85rem 0.9rem;
  border: 1px dashed rgba(160, 126, 191, 0.22);
  border-radius: 14px;
  background: #fbf8ff;
}

.summary-type-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.summary-toggle-btn {
  margin-left: auto;
  white-space: nowrap;
}

.filter-input {
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(160, 126, 191, 0.12);
  min-width: 180px;
}

.filter-input--small {
  width: 110px;
}

.filter-select {
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  border: 1px solid rgba(160, 126, 191, 0.12);
  background: #fff;
}

.order-filter-select {
  min-width: 160px;
}

.filter-summary {
  margin-left: auto;
  color: #6b5a84;
  font-size: 0.9rem;
}

.summary-strip--wide {
  align-items: center;
}

.ghost-btn,
.filter-btn {
  background: #fff;
  color: #6f50a0;
  border: 1px solid rgba(160, 126, 191, 0.16);
}

.primary-btn,
.slip-view-btn {
  background: linear-gradient(160deg, #a17df2, #6f50a0);
  color: #fff;
}

.filter-btn {
  padding: 0.45rem 0.8rem;
}

.filter-btn.active {
  background: #efe4ff;
}

.primary-btn,
.ghost-btn,
.slip-view-btn {
  padding: 0.75rem 1rem;
}

.state-box,
.empty-box {
  padding: 1rem;
  border-radius: 14px;
  text-align: center;
  color: #6d5c8f;
}

.state-box--error {
  color: #b42318;
  background: #fff7f8;
}

.table-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.orders-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;
}

.orders-table th:nth-child(1),
.orders-table td:nth-child(1) { width: 8%; }
.orders-table th:nth-child(2),
.orders-table td:nth-child(2) { width: 14%; }
.orders-table th:nth-child(3),
.orders-table td:nth-child(3) { width: 11%; }
.orders-table th:nth-child(4),
.orders-table td:nth-child(4) { width: 16%; }
.orders-table th:nth-child(5),
.orders-table td:nth-child(5) { width: 10%; }
.orders-table th:nth-child(6),
.orders-table td:nth-child(6) { width: 13%; }
.orders-table th:nth-child(7),
.orders-table td:nth-child(7) { width: 8%; }
.orders-table th:nth-child(8),
.orders-table td:nth-child(8) { width: 11%; }
.orders-table th:nth-child(9),
.orders-table td:nth-child(9) { width: 9%; }

.orders-table th,
.orders-table td {
  padding: 0.9rem 0.75rem;
  border-bottom: 1px solid #f0e8fb;
  text-align: left;
  vertical-align: middle;
}

.orders-table th {
  color: #7b6992;
  font-size: 0.84rem;
  text-transform: uppercase;
}

.customer-cell {
  display: grid;
}

.customer-cell small {
  color: #8b7aa3;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.type-chip--pre {
  background: #fff1dc;
  color: #b45309;
}

.type-chip--ready {
  background: #e5f8ef;
  color: #15803d;
}

.round-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: #f1e9fb;
  color: #6d4fa0;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.round-badge--empty {
  background: transparent;
  color: #b7aecb;
  font-weight: 500;
  padding-left: 0;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(44, 36, 64, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  /* Keep order/product popups above the fixed admin sidebar. */
  z-index: 1300;
}

.modal-card {
  width: min(980px, calc(100vw - 2rem));
  max-height: min(88vh, 820px);
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.35rem;
  scrollbar-gutter: stable;
}

.modal-card--product {
  width: min(920px, calc(100vw - 2rem));
}

.modal-head {
  position: sticky;
  top: -1.35rem;
  z-index: 3;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin: -1.35rem -1.35rem 1.1rem;
  padding: 1.1rem 1.35rem 0.9rem;
  background: #fff;
  border-bottom: 1px solid #f0e8fb;
}

.modal-head__actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.print-order-btn {
  padding: 0.55rem 0.85rem;
  border: 1px solid #7c5cdb;
  border-radius: 999px;
  background: #7c5cdb;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
}

.print-order-btn:hover {
  background: #6848bf;
}

.modal-head p {
  margin: 0.25rem 0 0;
  color: #7b6992;
}

.close-btn {
  width: 36px;
  height: 36px;
  background: #f5ecff;
  color: #6f50a0;
}

.summary-strip {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 1rem;
}

.summary-strip div {
  background: #faf7ff;
  border: 1px solid #ede4fb;
  border-radius: 14px;
  padding: 0.85rem;
}

.summary-strip span {
  display: block;
  color: #7b6992;
  font-size: 0.82rem;
}

.summary-strip strong {
  color: #432f61;
  font-size: 1.05rem;
}

.summary-strip--wide {
  margin-bottom: 1rem;
}

.summary-panel {
  display: grid;
  gap: 0.85rem;
}

.summary-table-wrap {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.summary-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

.summary-table th,
.summary-table td {
  padding: 0.9rem 0.75rem;
  border-bottom: 1px solid #f0e8fb;
  text-align: left;
  vertical-align: middle;
}

.summary-table th {
  color: #7b6992;
  font-size: 0.84rem;
  text-transform: uppercase;
}

.summary-table td p {
  margin: 0.15rem 0 0;
  color: #8b7aa3;
  font-size: 0.82rem;
}

.image-col {
  width: 64px;
}

.summary-thumb {
  display: block;
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #ede4fb;
  background: #f8f5ff;
}

.summary-thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a996c9;
  font-size: 0.62rem;
  text-align: center;
  line-height: 1.2;
}

.thumb-btn {
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  display: block;
  line-height: 0;
  border-radius: 10px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.thumb-btn:hover,
.thumb-btn:focus-visible {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(140, 99, 174, 0.28);
  outline: none;
}

.image-modal-card {
  width: min(480px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.1rem;
  position: relative;
  text-align: center;
}

.image-modal-close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
}

.image-modal-img {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 14px;
  background: #f8f5ff;
}

.image-modal-caption {
  margin: 0.75rem 0 0;
  color: #2c2440;
  font-weight: 600;
  font-size: 0.9rem;
}

.items-list {
  display: grid;
  gap: 0.65rem;
}

.item-row {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 56px 1.5fr 0.8fr 0.5fr 0.8fr 0.7fr;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid #ede4fb;
  border-radius: 14px;
}

.product-detail-row {
  grid-template-columns: minmax(0, 1fr) 112px 90px 140px minmax(120px, 1fr) 116px;
  min-width: 0;
  padding: 1rem 1.05rem;
  background: linear-gradient(135deg, #fff 0%, #fcf9ff 100%);
}

.product-detail-name {
  min-width: 0;
}

.product-detail-name strong {
  display: block;
  color: #32234b;
  font-size: 1rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.product-detail-name small {
  display: block;
  margin-top: 0.28rem;
  color: #806b9d;
  font-size: 0.8rem;
}

.product-detail-metric {
  display: grid;
  gap: 0.22rem;
  color: #46335e;
  font-size: 0.94rem;
}

.product-detail-metric span {
  color: #917eaa;
  font-size: 0.72rem;
  font-weight: 700;
}

.product-detail-metric--total strong {
  color: #5f3ca0;
  font-size: 1rem;
}

.product-detail-round {
  display: grid;
  gap: 0.22rem;
  justify-items: start;
}

.product-detail-label {
  color: #917eaa;
  font-size: 0.72rem;
  font-weight: 700;
}

.product-detail-type {
  display: flex;
  align-items: center;
}

.item-thumb-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #ede4fb;
  background: #f8f5ff;
}

.item-thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a996c9;
  font-size: 0.6rem;
  text-align: center;
  line-height: 1.15;
}

.item-row p {
  margin: 0.15rem 0 0;
  color: #8b7aa3;
  font-size: 0.82rem;
}

.item-merge-note {
  color: #8a5bbf;
  font-weight: 600;
}

.detail-row {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: 2fr 0.85fr 0.6fr 0.9fr 1fr 0.85fr;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid #ede4fb;
  border-radius: 14px;
}

.detail-row__name strong {
  display: block;
  word-break: break-word;
  line-height: 1.35;
}

.detail-row__name p {
  margin: 0.2rem 0 0;
  color: #8b7aa3;
  font-size: 0.82rem;
}

.detail-row__cell {
  font-size: 0.85rem;
  color: #4a3d63;
}

.detail-row__cell--strong {
  font-weight: 700;
  color: #2c2440;
}

@media (max-width: 720px) {
  .detail-row {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .detail-row__cell {
    display: flex;
    justify-content: space-between;
  }
}

@media (max-width: 960px) {
  .hero-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .item-row {
    grid-template-columns: 56px 1fr;
  }

  .product-detail-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-detail-name {
    grid-column: 1 / -1;
  }

  .product-detail-round,
  .product-detail-type {
    align-self: start;
  }

  .item-thumb-cell {
    grid-row: span 4;
  }

  .order-filter-search {
    flex: 1 1 100%;
  }

  .order-filter-search-btn {
    flex: 1 1 100%;
  }

  .order-filter-section {
    flex: 1 1 100%;
    margin-left: 0 !important;
  }

  .sales-type-switch {
    width: 100%;
  }

  .sales-type-pill {
    flex: 1;
    justify-content: center;
  }
}

@media (max-width: 600px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .order-filter-section {
    flex-direction: column;
    align-items: stretch;
  }

  .order-filter-select {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 600px) {
  .table-scroll,
  .summary-table-wrap {
    overflow: visible;
  }

  .orders-table,
  .summary-table {
    display: block;
    width: 100%;
    border: 0;
  }

  .orders-table thead,
  .summary-table thead {
    display: none;
  }

  .orders-table tbody,
  .orders-table tr,
  .summary-table tbody,
  .summary-table tr {
    display: block;
    width: 100%;
  }

  .orders-table tr,
  .summary-table tr {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 1px solid #eadcf6;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(84, 54, 113, 0.06);
  }

  .orders-table td,
  .summary-table td {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.45rem 0;
    border: 0;
    text-align: right;
  }

  .orders-table td::before,
  .summary-table td::before {
    flex: 0 0 auto;
    color: #8a789f;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
  }

  .orders-table td:nth-child(1)::before { content: 'ออเดอร์'; }
  .orders-table td:nth-child(2)::before { content: 'ลูกค้า'; }
  .orders-table td:nth-child(3)::before { content: 'ประเภท'; }
  .orders-table td:nth-child(4)::before { content: 'รอบพรีออเดอร์'; }
  .orders-table td:nth-child(5)::before { content: 'ยอดเงิน'; }
  .orders-table td:nth-child(6)::before { content: 'สถานะ'; }
  .orders-table td:nth-child(7)::before { content: 'รายการ'; }
  .orders-table td:nth-child(8)::before { content: 'วันที่'; }

  .summary-table td:nth-child(1)::before { content: 'สินค้า'; }
  .summary-table td:nth-child(2)::before { content: 'ประเภท'; }
  .summary-table td:nth-child(3)::before { content: 'จำนวนขาย'; }
  .summary-table td:nth-child(4)::before { content: 'รวม'; }
  .summary-table td:nth-child(5)::before { content: 'มูลค่ารวม'; }

  .orders-table td:last-child {
    display: block;
    padding-top: 0.7rem;
  }

  .orders-table td:last-child::before {
    display: none;
  }

  .orders-table td:last-child button {
    width: 100%;
  }

  .summary-table td:last-child {
    display: flex;
  }

  .summary-table td:last-child::before {
    display: block;
  }

  .customer-cell,
  .orders-table td > .status-pill {
    text-align: right;
  }
}
@media (max-width: 600px) {
  .orders-table, .summary-table { min-width: 0; table-layout: fixed; }
  .orders-table td, .summary-table td { min-width: 0; max-width: 100%; flex-wrap: wrap; overflow-wrap: anywhere; }
  .orders-table td::before, .summary-table td::before { max-width: 40%; }
  .orders-table td > *, .summary-table td > * { min-width: 0; max-width: 58%; overflow-wrap: anywhere; }
  .orders-table td:last-child > *, .summary-table td:last-child > * { max-width: 100%; }
}

.mobile-summary-product-list,
.mobile-order-list,
.mobile-order-detail,
.mobile-order-subtitle {
  display: none;
}

@media (max-width: 767px) {
  .admin-order-page {
    width: 100%;
    min-width: 0;
    padding: 1rem;
    gap: 0.75rem;
    overflow-x: hidden;
  }

  .admin-order-page :deep(.admin-page-heading) {
    margin: 0;
    padding: 1rem;
    gap: 0.75rem;
    border-radius: 18px;
  }

  .admin-order-page :deep(.admin-page-heading h1) {
    font-size: clamp(1.35rem, 6vw, 1.7rem);
    line-height: 1.3;
  }

  .admin-order-page :deep(.admin-page-heading p) {
    margin-top: 0.45rem;
    font-size: 0.88rem;
    line-height: 1.55;
  }

  .admin-order-page :deep(.admin-page-heading__actions),
  .admin-order-page :deep(.hero-actions) {
    width: 100%;
  }

  .admin-order-page :deep(.hero-actions) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .admin-order-page :deep(.hero-actions) .ghost-btn,
  .admin-order-page :deep(.hero-actions) .primary-btn {
    min-width: 0;
    padding: 0.65rem 0.5rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .sales-type-switch {
    width: 100%;
    margin: 0;
    gap: 0.2rem;
    padding: 0.25rem;
    overflow: visible;
  }

  .sales-type-pill {
    min-width: 0;
    flex: 1 1 0;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.58rem 0.2rem;
    font-size: clamp(0.72rem, 3.1vw, 0.84rem);
  }

  .sales-type-pill__dot {
    width: 7px;
    height: 7px;
  }

  .sales-type-pill__count {
    padding: 0.05rem 0.34rem;
    font-size: 0.7rem;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .kpi-card {
    min-width: 0;
    min-height: 6.4rem;
    padding: 0.85rem 0.75rem;
    border-radius: 17px;
  }

  .kpi-label,
  .kpi-value {
    overflow-wrap: break-word;
  }

  .kpi-label {
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .kpi-value {
    font-size: clamp(1.3rem, 6vw, 1.85rem);
    line-height: 1.1;
  }

  .view-filter-row {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0.85rem;
    display: grid;
    grid-template-columns: minmax(5.2rem, 0.7fr) minmax(0, 1.3fr);
    align-items: center;
    gap: 0.55rem;
    border-style: solid;
    border-radius: 17px;
  }

  .view-filter-label {
    white-space: normal;
    font-size: 0.82rem;
    line-height: 1.3;
  }

  .view-filter-select {
    width: 100%;
    min-width: 0;
    padding: 0.7rem 0.65rem;
    font-size: 0.83rem;
  }

  .panel {
    min-width: 0;
    padding: 1rem;
    border-radius: 19px;
  }

  .panel-head {
    min-width: 0;
    align-items: flex-start;
    gap: 0.65rem;
    margin-bottom: 0.85rem;
  }

  .panel-head h2 {
    margin: 0;
    font-size: clamp(1.3rem, 6vw, 1.7rem);
    line-height: 1.25;
  }

  .panel-head p {
    margin: 0.35rem 0 0;
    color: #7b6992;
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .panel-head > .ghost-btn {
    flex: 0 0 auto;
    padding: 0.6rem 0.7rem;
    font-size: 0.78rem;
  }

  .summary-panel .summary-table-wrap {
    display: none;
  }

  .mobile-summary-product-list {
    display: grid;
    gap: 0.7rem;
    min-width: 0;
  }

  .mobile-summary-product-card {
    min-width: 0;
    padding: 0.9rem;
    border: 1px solid #eadcf6;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 8px 18px rgba(84, 54, 113, 0.06);
  }

  .mobile-summary-product-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem;
    min-width: 0;
  }

  .mobile-summary-product-card__head > div {
    min-width: 0;
  }

  .mobile-summary-product-card__head strong,
  .mobile-summary-product-card__head span:not(.type-chip) {
    display: block;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .mobile-summary-product-card__head strong {
    color: #2d2050;
    font-size: 0.92rem;
    line-height: 1.4;
  }

  .mobile-summary-product-card__head span:not(.type-chip) {
    margin-top: 0.2rem;
    color: #8a789f;
    font-size: 0.76rem;
  }

  .mobile-summary-product-card__head .type-chip {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: 0.7rem;
  }

  .mobile-summary-product-card__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    margin-top: 0.75rem;
    padding-top: 0.65rem;
    border-top: 1px solid #eee7f7;
  }

  .mobile-summary-product-card__metrics span,
  .mobile-summary-product-card__metrics strong {
    display: block;
    overflow-wrap: break-word;
  }

  .mobile-summary-product-card__metrics span {
    color: #927fa9;
    font-size: 0.72rem;
  }

  .mobile-summary-product-card__metrics strong {
    margin-top: 0.2rem;
    color: #2d2050;
    font-size: 0.9rem;
  }

  .mobile-summary-product-card__metrics > div:last-child {
    text-align: right;
  }

  .mobile-summary-product-card__detail {
    width: 100%;
    min-width: 0;
    margin-top: 0.7rem;
    padding: 0.55rem 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 1px solid #d7c5f5;
    border-radius: 11px;
    background: #fbf8ff;
    color: #7041cc;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
  }

  .mobile-summary-product-card__detail svg {
    width: 0.95rem;
    height: 0.95rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .toolbar.order-filter-toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    align-items: stretch;
    min-width: 0;
    overflow: visible;
    padding: 0;
  }

  .order-filter-search {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    flex: none;
    padding: 0.75rem 0.9rem;
    font-size: 0.84rem;
  }

  .order-filter-section {
    min-width: 0;
    width: 100%;
    margin: 0 !important;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
    border: 0;
    background: transparent;
  }

  .order-filter-title {
    margin: 0;
    font-size: 0.78rem;
  }

  .order-filter-select {
    width: 100%;
    min-width: 0;
    padding: 0.7rem 0.55rem;
    font-size: 0.8rem;
  }

  .order-filter-search-btn {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    flex: none;
    padding: 0.75rem 1rem;
  }

  .table-scroll {
    display: none;
  }

  .mobile-order-list {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .mobile-order-card {
    min-width: 0;
    padding: 0.95rem;
    border: 1px solid #eadcf6;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 9px 20px rgba(84, 54, 113, 0.07);
  }

  .mobile-order-card__head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 44%);
    gap: 0.65rem;
    align-items: start;
    min-width: 0;
  }

  .mobile-order-card__identity,
  .mobile-order-card__badges {
    min-width: 0;
  }

  .mobile-order-card__number {
    display: block;
    color: #211653;
    font-size: 1.55rem;
    line-height: 1.05;
  }

  .mobile-order-card__identity p,
  .mobile-order-card__identity small {
    display: block;
    min-width: 0;
    margin: 0.3rem 0 0;
    color: #493c67;
    font-size: 0.83rem;
    line-height: 1.35;
    overflow-wrap: break-word;
  }

  .mobile-order-card__identity small {
    margin-top: 0.12rem;
    color: #8a789f;
  }

  .mobile-order-card__badges {
    display: grid;
    justify-items: stretch;
    gap: 0.35rem;
  }

  .mobile-order-card__badges .type-chip,
  .mobile-order-card__badges .status-pill {
    min-width: 0;
    justify-content: center;
    white-space: normal;
    text-align: center;
    line-height: 1.25;
    overflow-wrap: break-word;
  }

  .mobile-order-card__badges svg {
    width: 0.95rem;
    height: 0.95rem;
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mobile-order-status__dot {
    width: 0.45rem;
    height: 0.45rem;
    flex: 0 0 auto;
    border-radius: 50%;
  }

  .mobile-order-divider {
    height: 1px;
    margin: 0.85rem 0;
    background: #eee7f7;
  }

  .mobile-order-card__meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem 0.75rem;
    min-width: 0;
  }

  .mobile-order-meta-item {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    column-gap: 0.45rem;
    align-items: start;
    min-width: 0;
    color: #6f6282;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .mobile-order-meta-item svg {
    grid-row: span 2;
    width: 1rem;
    height: 1rem;
    margin-top: 0.1rem;
    fill: none;
    stroke: #7652bd;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mobile-order-meta-item strong {
    min-width: 0;
    color: #251955;
    font-size: 0.8rem;
    font-weight: 800;
    overflow-wrap: break-word;
  }

  .mobile-order-meta-item--total {
    grid-column: 1 / -1;
  }

  .mobile-order-meta-item--total strong {
    color: #5f3ca0;
    font-size: 1rem;
  }

  .mobile-order-detail-btn {
    width: 100%;
    min-width: 0;
    margin-top: 0.9rem;
    padding: 0.7rem 0.75rem;
    display: grid;
    grid-template-columns: 1.1rem minmax(0, 1fr) 1.1rem;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid #8052e6;
    border-radius: 13px;
    background: #fff;
    color: #7041cc;
    font: inherit;
    font-size: 0.86rem;
    font-weight: 800;
    cursor: pointer;
  }

  .mobile-order-detail-btn svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mobile-order-detail-btn__chevron {
    justify-self: end;
  }

  .mobile-order-detail-btn:hover,
  .mobile-order-detail-btn:focus-visible {
    background: #f5efff;
    outline: none;
  }

  .modal-overlay {
    align-items: center;
    padding: 0.5rem;
    background: rgba(36, 27, 57, 0.62);
  }

  .modal-card--order-detail {
    width: calc(100vw - 1rem);
    max-width: none;
    height: calc(100dvh - 1rem);
    max-height: calc(100dvh - 1rem);
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 1rem;
    border-radius: 27px;
    scrollbar-width: thin;
    scrollbar-color: #b9a5d5 transparent;
  }

  .modal-card--order-detail .modal-head {
    top: -1rem;
    min-width: 0;
    margin: -1rem -1rem 1rem;
    padding: 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.7rem;
    border-bottom: 1px solid #eee7f7;
  }

  .modal-card--order-detail .modal-head > div:first-child {
    min-width: 0;
  }

  .modal-card--order-detail .modal-head h3 {
    margin: 0;
    color: #241756;
    font-size: clamp(1.5rem, 7vw, 2rem);
    line-height: 1.15;
    overflow-wrap: break-word;
  }

  .modal-card--order-detail .modal-head > div:first-child > p {
    display: none;
  }

  .modal-card--order-detail .modal-head .mobile-order-subtitle {
    grid-column: 1 / -1;
    grid-row: 2;
    display: block;
    margin: -0.25rem 0 0.1rem;
    color: #81719d;
    font-size: 0.92rem;
    line-height: 1.35;
    overflow-wrap: break-word;
  }

  .modal-card--order-detail .modal-head__actions {
    min-width: 0;
    display: grid;
    grid-column: 1 / -1;
    grid-row: 3;
    grid-template-columns: minmax(0, 1fr) 2.7rem;
    align-items: center;
    gap: 0.4rem;
  }

  .modal-card--order-detail .print-order-btn {
    min-width: 0;
    padding: 0.7rem 0.75rem;
    font-size: 0.78rem;
    line-height: 1.2;
    white-space: nowrap;
  }

  .modal-card--order-detail .close-btn {
    width: 2.7rem;
    height: 2.7rem;
    font-size: 1.2rem;
  }

  .modal-card--order-detail > .summary-strip,
  .modal-card--order-detail > .items-list {
    display: none;
  }

  .mobile-order-detail {
    display: block;
    min-width: 0;
  }

  .mobile-order-total-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid #eee5fb;
    border-radius: 19px;
    background: linear-gradient(135deg, #faf6ff, #f4edff);
  }

  .mobile-order-total-panel > div {
    min-width: 0;
  }

  .mobile-order-total-panel span:first-child {
    display: block;
    color: #8874a8;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .mobile-order-total-panel strong {
    display: block;
    margin-top: 0.18rem;
    color: #241756;
    font-size: clamp(1.85rem, 10vw, 2.6rem);
    line-height: 1.05;
    overflow-wrap: break-word;
  }

  .mobile-order-detail-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    max-width: 48%;
    padding: 0.65rem 0.7rem;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    overflow-wrap: break-word;
  }

  .mobile-order-detail-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.7rem;
    min-width: 0;
  }

  .mobile-order-detail-field {
    min-width: 0;
    padding: 0.8rem;
    display: grid;
    grid-template-columns: 1.35rem minmax(0, 1fr);
    column-gap: 0.55rem;
    align-items: start;
    border: 1px solid #eadffd;
    border-radius: 16px;
    background: #fff;
  }

  .mobile-order-detail-field svg {
    grid-row: span 2;
    width: 1.35rem;
    height: 1.35rem;
    margin-top: 0.1rem;
    fill: none;
    stroke: #7652bd;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mobile-order-detail-field span {
    min-width: 0;
    color: #8874a8;
    font-size: 0.78rem;
    line-height: 1.3;
  }

  .mobile-order-detail-field strong {
    min-width: 0;
    margin-top: 0.2rem;
    color: #251955;
    font-size: 0.9rem;
    line-height: 1.25;
    overflow-wrap: break-word;
  }

  .mobile-order-detail-divider {
    height: 1px;
    margin: 1rem 0 0.85rem;
    background: #e8def5;
  }

  .mobile-order-items-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-width: 0;
    margin-bottom: 0.7rem;
  }

  .mobile-order-items-heading h4 {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: #32234b;
    font-size: 1.25rem;
    line-height: 1.25;
  }

  .mobile-order-items-heading h4 svg {
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    fill: none;
    stroke: #7652bd;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mobile-order-items-heading > strong {
    flex: 0 0 auto;
    color: #6f50a0;
    font-size: 0.95rem;
  }

  .mobile-order-items {
    display: grid;
    gap: 0.65rem;
    min-width: 0;
  }

  .mobile-order-item {
    min-width: 0;
    padding: 0.85rem;
    border: 1px solid #eadffd;
    border-radius: 16px;
    background: linear-gradient(135deg, #fff, #fcf9ff);
  }

  .mobile-order-item__name,
  .mobile-order-item__variant,
  .mobile-order-item__category {
    display: block;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .mobile-order-item__name {
    color: #2d2050;
    font-size: 0.96rem;
    line-height: 1.45;
  }

  .mobile-order-item__variant,
  .mobile-order-item__category {
    margin-top: 0.25rem;
    color: #8a789f;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .mobile-order-item__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 0.75rem;
    min-width: 0;
  }

  .mobile-order-item__metrics > div {
    min-width: 0;
  }

  .mobile-order-item__metrics span,
  .mobile-order-item__metrics strong {
    display: block;
    overflow-wrap: break-word;
  }

  .mobile-order-item__metrics span {
    color: #927fa9;
    font-size: 0.7rem;
    line-height: 1.25;
  }

  .mobile-order-item__metrics strong {
    margin-top: 0.2rem;
    color: #2d2050;
    font-size: 0.86rem;
    line-height: 1.25;
  }

  .mobile-order-item__metrics > div:last-child {
    text-align: right;
  }

  .mobile-order-breakdown {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.8rem;
    padding: 0.9rem;
    border-radius: 17px;
    background: #f7f1ff;
  }

  .mobile-order-breakdown > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    color: #796a91;
    font-size: 0.84rem;
  }

  .mobile-order-breakdown strong {
    flex: 0 0 auto;
    color: #3e2a65;
    overflow-wrap: break-word;
  }

  .mobile-order-breakdown__total {
    margin-top: 0.2rem;
    padding-top: 0.65rem;
    border-top: 1px solid #e5d9f3;
    color: #2d2050 !important;
    font-size: 1.12rem !important;
    font-weight: 900;
  }

  .mobile-order-breakdown__total strong {
    color: #241756;
    font-size: 1.25rem;
  }
}

@media (max-width: 360px) {
  .admin-order-page {
    padding: 0.75rem;
  }

  .mobile-order-card {
    padding: 0.8rem;
  }

  .mobile-order-card__head {
    grid-template-columns: minmax(0, 1fr) minmax(0, 47%);
    gap: 0.45rem;
  }

  .mobile-order-card__number {
    font-size: 1.4rem;
  }

  .mobile-order-meta-item {
    column-gap: 0.3rem;
    font-size: 0.7rem;
  }

  .mobile-order-meta-item strong {
    font-size: 0.74rem;
  }

  .modal-card--order-detail .modal-head {
    grid-template-columns: 1fr;
  }

  .modal-card--order-detail .modal-head__actions {
    width: 100%;
    grid-template-columns: minmax(0, 1fr) 2.7rem;
  }

  .mobile-order-total-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .mobile-order-detail-status {
    max-width: 100%;
  }

  .mobile-order-detail-field {
    padding: 0.7rem;
    grid-template-columns: 1.1rem minmax(0, 1fr);
    column-gap: 0.35rem;
  }

  .mobile-order-detail-field svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  .mobile-order-detail-field span {
    font-size: 0.7rem;
  }

  .mobile-order-detail-field strong {
    font-size: 0.78rem;
  }

  .mobile-order-item__metrics {
    gap: 0.25rem;
  }

  .mobile-order-item__metrics span {
    font-size: 0.64rem;
  }

  .mobile-order-item__metrics strong {
    font-size: 0.76rem;
  }
}
</style>
