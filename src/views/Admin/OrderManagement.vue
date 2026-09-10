<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

const statusConfig = {
  Pending: { label: 'รอดำเนินการ', color: '#f59e0b', bg: '#fffbeb' },
  Paid: { label: 'ชำระแล้ว', color: '#10b981', bg: '#ecfdf5' },
  Wait_for_Import_Fee: { label: 'รอนำเข้า', color: '#6366f1', bg: '#eef2ff' },
  Pending_import_fee: { label: 'รอชำระค่านำเข้า', color: '#7c3aed', bg: '#f3e8ff' },
  Ready_to_Ship: { label: 'พร้อมจัดส่ง', color: '#0ea5e9', bg: '#f0f9ff' },
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
  return String(orderType || '').toLowerCase() === 'preorder' ? '🕐 พรีออเดอร์' : '✅ พร้อมส่ง'
}

// ── ผูก path กับตัวกรองประเภทออเดอร์ ──
// /admin/sales -> ทั้งหมด, /admin/sales/ready-to-ship -> พร้อมส่ง, /admin/sales/preorder -> พรีออเดอร์
function syncFilterFromRoute() {
  const orderType = route.meta?.orderType
  if (orderType) {
    salesView.value = 'orders'
    typeFilter.value = orderType
  } else {
    typeFilter.value = 'all'
  }
}

watch(() => route.fullPath, syncFilterFromRoute, { immediate: true })

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

const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    const matchesType =
      typeFilter.value === 'all' ||
      String(order.Order_type || '').toLowerCase() === typeFilter.value
    const matchesStatus =
      statusFilter.value === 'all' ||
      String(order.status || '').toLowerCase() === statusFilter.value
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
  totalSales: orders.value.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0),
  paid: orders.value.filter((order) => normalizeStatus(order.status) === 'paid').length,
  preorder: orders.value.filter((order) => normalizeStatus(order.Order_type) === 'preorder').length,
  ready: orders.value.filter((order) => normalizeStatus(order.Order_type) === 'ready').length,
  pending: orders.value.filter((order) => normalizeStatus(order.status) === 'pending').length,
}))

const productSalesTotalQty = computed(() =>
  productSalesSummary.value.reduce((sum, item) => sum + (Number(item.sold_qty) || 0), 0),
)

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
    list = list.filter((p) => String(p.item_type || '').toLowerCase() === type)
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
    const key = `${flavor}|${type}|${unitPrice}`

    if (!map.has(key)) {
      map.set(key, {
        flavor,
        item_type: type,
        unit_price: unitPrice,
        sold_qty: Number(r.sold_qty || 0),
        total_amount: Number(r.sold_qty || 0) * unitPrice,
        category_name: r.category_name,
        name: r.name,
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
    const params = new URLSearchParams()
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
    if (typeFilter.value !== 'all') params.set('type', typeFilter.value)

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

onMounted(() => {
  refreshDashboard()
})
</script>

<template>
  <div class="admin-order-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">{{ salesPageMeta.eyebrow }}</p>
        <h1>{{ salesPageMeta.title }}</h1>
        <p>{{ salesPageMeta.subtitle }}</p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="goBack">กลับ Dashboard</button>
        <button class="primary-btn" type="button" @click="viewSlipList">ไปหน้าสลิป</button>
      </div>
    </section>

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
      <article class="kpi-card">
        <p class="kpi-label">ยอดขายรวม</p>
        <p class="kpi-value">{{ formatMoney(orderStats.totalSales) }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">รายการทั้งหมด</p>
        <p class="kpi-value">{{ orderStats.all }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">ชำระแล้ว</p>
        <p class="kpi-value">{{ orderStats.paid }}</p>
      </article>
      <article class="kpi-card">
        <p class="kpi-label">พรีออเดอร์</p>
        <p class="kpi-value">{{ orderStats.preorder }}</p>
      </article>
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
          ><strong>{{ productSalesSummary.length }} รายการ</strong>
        </div>
        <div>
          <span>จำนวนชิ้นรวม</span><strong>{{ productSalesTotalQty }} ชิ้น</strong>
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
              :class="{ active: productFilterType === 'ready-to-ship' }"
              type="button"
              @click="productFilterType = 'ready-to-ship'"
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
              <th>ราคาต่อชิ้น</th>
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
                <img
                  v-if="item.image_url"
                  :src="item.image_url"
                  :alt="item.name"
                  class="summary-thumb"
                  loading="lazy"
                />
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
              <td>{{ formatMoney(item.unit_price) }}</td>
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

        <button class="primary-btn order-filter-search-btn" type="button" @click="fetchOrders">
          ค้นหา
        </button>

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
            <option value="wait_for_import_fee">รอนำเข้า</option>
            <option value="pending_import_fee">รอชำระค่านำเข้า</option>
            <option value="ready_to_ship">พร้อมจัดส่ง</option>
          </select>
        </div>
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
              <th>ยอดเงิน</th>
              <th>สถานะ</th>
              <th>รายการ</th>
              <th>วันที่</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filteredOrders" :key="order.order_id">
              <td>
                <strong>#{{ order.order_id }}</strong>
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
              <td>{{ formatMoney(order.total_amount) }}</td>
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
    </section>

    <transition name="fade">
      <div v-if="selectedOrder" class="modal-overlay" @click.self="closeOrder">
        <div class="modal-card">
          <div class="modal-head">
            <div>
              <h3>ออเดอร์ #{{ selectedOrder.order_id }}</h3>
              <p>
                {{ selectedOrder.full_name || selectedOrder.username || '-' }} ·
                {{ getOrderTypeLabel(selectedOrder.Order_type) }}
              </p>
            </div>
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
                <span>ยอดรวม</span><strong>{{ formatMoney(selectedOrder.total_amount) }}</strong>
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
            </div>

            <div class="items-list">
              <div
                v-for="item in summarizedOrderItems"
                :key="item.detail_ids?.join('-') || item.detail_id"
                class="item-row"
              >
                <div class="item-thumb-cell">
                  <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="item-thumb"
                    loading="lazy"
                  />
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
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="showProductDetail" class="modal-overlay" @click.self="closeProductDetails">
        <div class="modal-card">
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
              class="item-row"
              v-for="row in aggregatedSelectedProductRows"
              :key="(row.flavor || 'nof') + '-' + row.item_type"
            >
              <div>
                <strong
                  >{{ row.name }} <small v-if="row.flavor">· {{ row.flavor }}</small></strong
                >
                <p v-if="row.category_name">{{ row.category_name }}</p>
              </div>
              <div>{{ formatMoney(row.unit_price) }}</div>
              <div>x{{ Number(row.sold_qty || 0) }}</div>
              <div>{{ formatMoney(row.total_amount) }}</div>
              <div>
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
  </div>
</template>

<style scoped>
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
  min-width: 880px;
  border-collapse: collapse;
}

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
  z-index: 50;
}

.modal-card {
  width: min(980px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.1rem;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
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

@media (max-width: 960px) {
  .hero-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .item-row {
    grid-template-columns: 56px 1fr;
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
  .orders-table td:nth-child(4)::before { content: 'ยอดเงิน'; }
  .orders-table td:nth-child(5)::before { content: 'สถานะ'; }
  .orders-table td:nth-child(6)::before { content: 'รายการ'; }
  .orders-table td:nth-child(7)::before { content: 'วันที่'; }
  .summary-table td:nth-child(1)::before { content: 'สินค้า'; }
  .summary-table td:nth-child(2)::before { content: 'ประเภท'; }
  .summary-table td:nth-child(3)::before { content: 'ราคา/ชิ้น'; }
  .summary-table td:nth-child(4)::before { content: 'จำนวนขาย'; }
  .summary-table td:nth-child(5)::before { content: 'รวม'; }
  .summary-table td:nth-child(6)::before { content: 'มูลค่ารวม'; }

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
</style>
