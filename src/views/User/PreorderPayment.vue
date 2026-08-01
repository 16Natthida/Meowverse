<script setup>
// Helper to display the correct price (import fee or original price)
function displayPrice(item) {
  // Use import_fee as the effective price when in import fee stage and fee is set
  if (isImportFeePaymentStage.value) {
    return Number(item.import_fee ?? item.Import_fee ?? 0)
  }
  return Number(item.price || item.Price || item.unit_price || 0)
}
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const route = useRoute()
useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const order = ref(null)
// ── PRODUCT IMAGE MAP ──
const productImageMap = ref({})

const fetchProductImages = async (prodIds) => {
  const uniqueIds = [...new Set(prodIds.filter(Boolean))]
  await Promise.all(
    uniqueIds.map(async (prodId) => {
      if (productImageMap.value[prodId]) return
      try {
        const res = await fetch(`${API_BASE_URL}/product-images?prod_id=${prodId}`)
        if (!res.ok) return
        const imgs = await res.json()
        const arr = Array.isArray(imgs) ? imgs : (imgs.data ?? imgs.images ?? [])
        const map = {}
        arr.forEach((img) => {
          const rawFlavor = img.flavor
          const key =
            rawFlavor == null || String(rawFlavor).trim() === ''
              ? '__default__'
              : String(rawFlavor).trim()
          if (map[key] === undefined || img.sort_order < map[key].sort_order) {
            map[key] = { url: img.image_url, sort_order: img.sort_order }
          }
        })
        const urlMap = {}
        Object.entries(map).forEach(([k, v]) => {
          urlMap[k] = v.url
        })
        productImageMap.value[prodId] = urlMap
      } catch {
        /* ignore */
      }
    }),
  )
}

function resolveItemImage(it) {
  const imgs = productImageMap.value[it.prod_id]
  const flavorKey = it.flavor ? String(it.flavor) : null
  if (imgs) {
    if (flavorKey && imgs[flavorKey]) return imgs[flavorKey]
    if (imgs['__default__']) return imgs['__default__']
    const first = Object.values(imgs)[0]
    if (first) return first
  }
  return it.image ?? null
}

const loading = ref(true)
const error = ref(null)
const notice = ref({ msg: '', type: '' })

// ── สรุปยอดและประเภทสินค้าของ Preorder ──
const importFeeTotal = computed(() => Number(order.value?.import_fee_total || 0))

const IMPORT_FEE_PAYMENT_STATUSES = [
  'wait for import fee',
  'pending import fee',
  'import slip submitted',
  'invalid import slip',
]

const normalizedOrderStatus = computed(() =>
  String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' '),
)

// รอบ 2 ต้องยึดทั้งสถานะและยอดค่านำเข้า เพื่อรองรับออเดอร์เก่าที่สถานะเคยถูกบันทึกเป็นค่าว่าง
const isImportFeePaymentStage = computed(() => {
  const status = normalizedOrderStatus.value
  if (IMPORT_FEE_PAYMENT_STATUSES.includes(status)) return true
  return importFeeTotal.value > 0 && !['paid', 'ready to ship'].includes(status)
})

// แสดงกล่องข้อมูลจัดส่งเมื่อเข้าสู่สเตจค่านำเข้า รวมถึงสถานะหลังจากนั้นทั้งหมดด้วย
const isImportFeeStage = computed(() => {
  return isImportFeePaymentStage.value || ['paid', 'ready to ship'].includes(normalizedOrderStatus.value)
})

// รอแอดมินแจ้งค่านำเข้า: ล็อกทุกอย่างยกเว้นขอเลื่อนเวลา
const isWaitingForImportFee = computed(() => {
  const status = String(order.value?.status || '')
    .trim()
    .toLowerCase()
  return status === 'wait_for_import_fee'
})

const isRoundOpen = computed(() => {
  const roundStatus = String(order.value?.preorder_round_status || '')
    .trim()
    .toLowerCase()
  return ['active', 'open'].includes(roundStatus)
})

// ล็อกฟอร์มเมื่อสถานะเป็น Ready_to_Ship หรือ Cancelled
// ยังให้แก้ไขได้ในช่วงรอค่านำเข้าและตอนสลิปค่านำเข้าไม่ถูกต้อง
const isShippingLocked = computed(() => {
  const status = normalizedOrderStatus.value
  // รอบ 2 ใช้กรอกที่อยู่พร้อมชำระค่านำเข้า และล็อกเมื่อส่งสลิปรอบ 2 แล้ว
  return [
    'slip submitted',
    'import slip submitted',
    'paid',
    'ready to ship',
    'cancelled',
  ].includes(status)
})

// ล็อกทั้งหน้าเฉพาะเมื่อออเดอร์จบหรือยกเลิกแล้ว รอบค่านำเข้ายังต้องแนบสลิปได้
const isReadOnlyStage = computed(() =>
  ['paid', 'ready to ship', 'cancelled'].includes(normalizedOrderStatus.value),
)

// ✅ ซ่อนปุ่มขอเลื่อนกำหนดชำระเงิน และสกัดการเลือกช่องทางการโอนเมื่อออเดอร์จ่ายเสร็จสมบูรณ์/จัดส่งแล้ว
const isFullyPaid = computed(() => {
  const status = String(order.value?.status || '')
    .trim()
    .toLowerCase()
  return ['ready_to_ship', 'slip_submitted'].includes(status)
})

// ✅ ปรับเงื่อนไข Amount Due ถ้ายืนยันชำระครบ (Paid หรือ Ready to Ship) ให้แสดงยอดรวม 2 รอบ
const amountDue = computed(() => {
  const status = normalizedOrderStatus.value

  if (['paid', 'ready to ship'].includes(status)) {
    return Number(order.value?.total_amount || 0) + Number(order.value?.import_fee_total || 0)
  }

  return isImportFeePaymentStage.value
    ? Number(order.value?.import_fee_total || 0)
    : Number(order.value?.total_amount || 0)
})

const readyItems = computed(
  () => order.value?.items?.filter((item) => item.item_type === 'ready-to-ship') || [],
)
const preorderItems = computed(
  () => order.value?.items?.filter((item) => item.item_type === 'preorder') || [],
)
const unspecifiedItems = computed(
  () =>
    order.value?.items?.filter(
      (item) => item.item_type !== 'ready-to-ship' && item.item_type !== 'preorder',
    ) || [],
)

const shippingInfo = ref({
  name: '',
  phone: '',
  address: '',
  notes: '',
  carrier: '',
})

// ── Slip ──
const slipFile = ref(null)
const slipPreview = ref(null)
const slipFileInput = ref(null)
const slipImageUrl = computed(() => {
  const status = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
  // invalid import slip → ล้างสลิปเก่าออก ต้องแนบใหม่เสมอ
  if (status === 'invalid import slip') {
    return slipPreview.value || null
  }
  // หน้าจ่ายค่านำเข้ารอบปกติ → แสดง import_fee_slip ถ้ามี (ไม่เอา Order_fee slip)
  if (['wait for import fee', 'pending import fee', 'import slip submitted'].includes(status)) {
    return slipPreview.value || order.value?.saved_shipping?.import_fee_slip_url || null
  }
  return slipPreview.value || order.value?.saved_shipping?.slip_url || null
})
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

// ── label + สีสถานะที่แสดงให้ลูกค้าเห็น (Preorder) ──
const orderStatusDisplay = computed(() => {
  const s = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')

  const getIcon = (svgContent) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`

  const map = {
    pending: {
      label: 'รอชำระเงิน',
      color: '#f59e0b',
      icon: getIcon(
        '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      ),
    },
    'slip submitted': {
      label: 'แนบสลิปแล้ว รอตรวจสอบ',
      color: '#3b82f6',
      icon: getIcon(
        '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
      ),
    },
    paid: {
      label: 'จ่ายเงินสำเร็จ รอแอดมินเรียกเก็บค่าจัดส่งในLINE',
      color: '#10b981',
      icon: getIcon(
        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      ),
    },
    'wait for import fee': {
      label: 'รอแจ้งค่านำเข้า',
      color: '#6366f1',
      icon: getIcon(
        '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
      ),
    },
    'pending import fee': {
      label: 'รอชำระค่านำเข้า',
      color: '#f59e0b',
      icon: getIcon(
        '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
      ),
    },
    'import slip submitted': {
      label: 'แนบสลิปค่านำเข้าแล้ว รอตรวจสอบ',
      color: '#3b82f6',
      icon: getIcon(
        '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
      ),
    },
    'invalid slip': {
      label: 'สลิปไม่ถูกต้อง',
      color: '#ef4444',
      icon: getIcon(
        '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      ),
    },
    'invalid import slip': {
      label: 'สลิปค่านำเข้าไม่ถูกต้อง',
      color: '#ef4444',
      icon: getIcon(
        '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      ),
    },
    'ready to ship': {
      label: 'เตรียมพร้อมส่ง',
      color: '#10b981',
      icon: getIcon(
        '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',
      ),
    },
    cancelled: {
      label: 'ยกเลิกแล้ว',
      color: '#6b7280',
      icon: getIcon(
        '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>',
      ),
    },
  }
  return (
    map[s] || {
      label: order.value?.status || '-',
      color: '#6b7280',
      icon: getIcon(
        '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
      ),
    }
  )
})

// ── สถานะสลิปไม่ถูกต้อง (แอดมินปฏิเสธ) ──
const isInvalidSlip = computed(() => {
  const s = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
  return s === 'invalid slip'
})

// สลิปค่านำเข้าถูกปฏิเสธ
const isInvalidImportSlip = computed(() => {
  const s = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
  return s === 'invalid import slip'
})

// ── Payment & Shipping ──
const selectedPaymentMethod = ref('bank_transfer')

const defaultPaymentMethods = [
  {
    id: 'bank_transfer',
    name: 'โอนเงินผ่านธนาคาร',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align: middle;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>',
  },
  {
    id: 'promptpay',
    name: 'พร้อมเพย์',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align: middle;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
  },
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
        username: item.username || null,
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

const showPostponeForm = ref(false)
const postponeSubmitting = ref(false)
const latestPostpone = ref(null)
const postponeRequest = ref({
  new_deadline: '',
  reason: '',
  contact_phone: '',
  details: '',
})

const postponeStatusLabel = computed(() => {
  const s = latestPostpone.value?.status
  if (s === 'Pending') return { text: 'รอการพิจารณา', cls: 'status--pending' }
  if (s === 'Approved') return { text: 'อนุมัติแล้ว', cls: 'status--approved' }
  if (s === 'Rejected') return { text: 'ถูกปฏิเสธ', cls: 'status--rejected' }
  return null
})

function formatThaiDateTime(value, fallback = '-') {
  if (!value) return fallback

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback

  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const fetchLatestPostpone = async (orderId) => {
  if (!orderId) return
  try {
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}/postpone/latest`)
    if (!res.ok) return
    const data = await res.json()
    if (data && data.post_id) {
      latestPostpone.value = data
      if (data.new_deadline) {
        postponeRequest.value.new_deadline = data.new_deadline.replace(' ', 'T').slice(0, 16)
      }
      postponeRequest.value.reason = data.request_reason || ''
      postponeRequest.value.contact_phone = data.contact_phone || ''
      postponeRequest.value.details = data.post_detail || ''
    }
  } catch {
    // ไม่มีข้อมูล postpone ก็ไม่เป็นไร
  }
}

const orderDeadlineDisplay = computed(() => {
  return formatThaiDateTime(order.value?.deadline, 'ยังไม่กำหนด')
})

const isCancelled = computed(
  () =>
    String(order.value?.status || '')
      .trim()
      .toLowerCase() === 'cancelled',
)

const onFileChange = async (e) => {
  // ✅ บล็อกถ้าสถานะเป็น ReadOnly หรือชำระเงินเรียบร้อยแล้ว (Paid)
  if (isReadOnlyStage.value || isFullyPaid.value || isRoundOpen.value) return
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    showNotice('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error')
    return
  }
  slipFile.value = file
  slipPreview.value = URL.createObjectURL(file)

  // ลบส่วนที่เคยยิง API fetch PATCH status ออกไปทั้งหมด
  // ปล่อยให้หน้าที่การบันทึกสลิปและเปลี่ยนสถานะเป็นของฝั่ง Backend ตอนที่กด confirmPayment
  // ถ้าสถานะเป็น Invalid import slip → อัปเดตเป็น Import_slip_submitted ทันทีที่แนบสลิปใหม่
  const currentStatus = String(order.value?.status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
  if (currentStatus === 'invalid import slip' && order.value?.order_id) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Import_slip_submitted' }),
      })
      if (res.ok) {
        order.value = { ...order.value, status: 'Import_slip_submitted' }
      }
    } catch {
      // ไม่รบกวน UX ถ้า call ล้มเหลว จะ retry ตอน confirmPayment
    }
  }
}

const editSlipImage = () => {
  // ✅ บล็อกการคลิกแก้รูปสลิป ถ้าสถานะเป็น ReadOnly หรือชำระเงินเรียบร้อยแล้ว (Paid)
  if (isReadOnlyStage.value || isFullyPaid.value || isRoundOpen.value) return
  if (slipFileInput.value) slipFileInput.value.click()
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
        Order_type: 'Preorder',
        user_id: pendingData.user_id,
        preorder_round_status:
          (pendingData.items || []).find((item) => item.preorder_round_status)?.preorder_round_status || null,
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

    if (data.Order_type !== 'Preorder') {
      router.replace(`/order/${orderId}`)
      return
    }
    order.value = data
    const apiProdIds = (data.items || []).map((i) => i.prod_id)
    await fetchProductImages(apiProdIds)

    await fetchLatestPostpone(data.order_id)

    if (data.saved_shipping) {
      shippingInfo.value.name = data.saved_shipping.name || ''
      shippingInfo.value.phone = data.saved_shipping.phone || ''
      shippingInfo.value.address = data.saved_shipping.address || ''
      shippingInfo.value.notes = data.saved_shipping.notes || ''
      shippingInfo.value.carrier =
        data.saved_shipping.carrier || data.saved_shipping.Shipping_Carrier || ''
      resolveSelectedPaymentMethod(data.saved_shipping.payment_method || 'bank_transfer')

      // โหลด slip ให้ตรงกับ type:
      // - หน้าค่านำเข้า (Wait/Pending_import_fee/Invalid import slip) → ใช้ import_fee_slip_url
      // - หน้าอื่น → ใช้ slip_url (Order_fee)
      const orderStatus = String(data.status || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
      const isImportFeeRound = [
        'wait for import fee',
        'pending import fee',
        'import slip submitted',
        'invalid import slip',
      ].includes(orderStatus)
      const slipToLoad = isImportFeeRound
        ? data.saved_shipping.import_fee_slip_url
        : data.saved_shipping.slip_url
      if (slipToLoad) {
        const url = slipToLoad
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
  if (loading.value || isReadOnlyStage.value || isRoundOpen.value) {
    if (isRoundOpen.value) {
      showNotice('รอบพรีออเดอร์ยังไม่ปิด จึงยังไม่สามารถชำระเงินได้', 'warning')
    }
    return
  }

  // แปลงสถานะเพื่อเช็กเงื่อนไขให้ง่ายขึ้น
  const currentStatus = String(order.value?.status || '')
    .trim()
    .toLowerCase()
  const normalizedStatus = currentStatus.replace(/_/g, ' ')

  // หากเป็นกรณีสเตจพรีออเดอร์ทั่วไป ให้ตรวจสอบค่าความถูกต้องของอินพุตจัดส่งก่อนส่งฟอร์มเสมอ
  const isInputActiveStage = [
    'wait for import fee',
    'pending import fee',
    'import slip submitted',
    'invalid import slip',
    'paid',
  ].includes(normalizedStatus)

  if (isInputActiveStage) {
    if (
      !shippingInfo.value.name ||
      !shippingInfo.value.phone ||
      !shippingInfo.value.address ||
      !shippingInfo.value.carrier
    ) {
      showNotice(
        'กรุณากรอกข้อมูลจัดส่ง ชื่อ เบอร์โทร บริษัทขนส่ง และที่อยู่ให้ครบถ้วนก่อนส่งประวัติข้อมูล',
        'error',
      )
      return
    }
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
        body: JSON.stringify({ user_id: pendingData.user_id, items: pendingData.items }),
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

      showNotice('ส่งข้อมูลและหลักฐานเรียบร้อย! รอการตรวจสอบจากทีมงาน', 'success')
      sessionStorage.removeItem('pending_order_data')
      setTimeout(() => router.push('/order-list'), 2500)
      return
    }

    // สถานะที่ต้องการแค่อัปเดตที่อยู่จัดส่ง ไม่ต้องส่ง payment และไม่ต้องเปลี่ยน status
    const isShippingOnlyStage = ['paid'].includes(normalizedStatus)

    if (isShippingOnlyStage) {
      // อัปเดตแค่ที่อยู่จัดส่ง ผ่าน /shipping endpoint ที่ไม่แตะ payment และ status
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
        throw new Error(
          errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลจัดส่ง',
        )
      }
      showNotice('อัปเดตข้อมูลการจัดส่งเรียบร้อยแล้ว!', 'success')
      setTimeout(() => router.push('/order-list'), 2500)
      return
    }

    // สถานะอื่นๆ → ส่ง payment พร้อม slip ตามปกติ
    const formData = new FormData()
    formData.append('payment_method', getSelectedPaymentMethodValue())
    if (slipFile.value) formData.append('slip', slipFile.value)
    formData.append('shipping_name', shippingInfo.value.name)
    formData.append('shipping_phone', shippingInfo.value.phone)
    formData.append('shipping_address', shippingInfo.value.address)
    formData.append('shipping_carrier', shippingInfo.value.carrier)
    formData.append('notes', shippingInfo.value.notes || '')

    if (
      ['wait for import fee', 'pending import fee', 'invalid import slip'].includes(
        normalizedStatus,
      )
    ) {
      formData.append('type', 'Import_Fee')
    }

    const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/payment`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null)
      throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
    }

    showNotice('อัปเดตข้อมูลการจัดส่งเรียบร้อยแล้ว!', 'success')
    setTimeout(() => router.push('/order-list'), 2500)
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    loading.value = false
  }
}

const submitPostponeRequest = async () => {
  if (postponeSubmitting.value || isFullyPaid.value) return
  if (!order.value?.order_id) {
    showNotice('ไม่สามารถส่งคำขอเลื่อนสำหรับคำสั่งชั่วคราว กรุณาสร้างออเดอร์ก่อน', 'error')
    return
  }

  if (!postponeRequest.value.new_deadline) {
    showNotice('กรุณาเลือกวันที่ขอเลื่อน', 'error')
    return
  }
  if (!postponeRequest.value.reason.trim()) {
    showNotice('กรุณาระบุเหตุผลการขอเลื่อน', 'error')
    return
  }

  try {
    postponeSubmitting.value = true
    const deadlineValue = String(postponeRequest.value.new_deadline || '').replace('T', ' ')
    const res = await fetch(`${API_BASE_URL}/orders/${order.value.order_id}/postpone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_deadline: deadlineValue,
        reason: postponeRequest.value.reason,
        contact_phone: postponeRequest.value.contact_phone,
        details: postponeRequest.value.details,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null)
      throw new Error(errorBody?.error || errorBody?.message || 'เกิดข้อผิดพลาดในการส่งคำขอเลื่อน')
    }

    showNotice('ส่งคำขอเลื่อนเวลาเรียบร้อยแล้ว', 'success')
    showPostponeForm.value = false
    postponeRequest.value = {
      new_deadline: '',
      reason: '',
      contact_phone: '',
      details: '',
    }
    await fetchLatestPostpone(order.value.order_id)
  } catch (err) {
    showNotice(err.message, 'error')
  } finally {
    postponeSubmitting.value = false
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
        <span class="logo-mark"
          ><svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.5 0 3.5-3.58 4-8.9 4-5.33 0-9-1.5-9-5 0-1.26.43-2.43 1-3.5 0 0-1.82-6.42-.42-7 1.39-.58 4.64.26 6.42 2.26.65-.17 1.33-.26 2-.26z"
            ></path></svg
        ></span>
        <span class="logo-text">Meowverse</span>
      </div>
    </nav>

    <transition name="slide-down">
      <div v-if="notice.msg" :class="['notice', `notice--${notice.type}`]">{{ notice.msg }}</div>
    </transition>

    <div class="content">
      <div v-if="loading && !order" class="state-wrap state-wrap--loading">
        <div class="loader"></div>
        <p>กำลังโหลดข้อมูลการชำระเงินพรีออเดอร์...</p>
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
                <span class="hero-chip hero-chip--soft">Preorder stock</span>
                <span class="hero-chip">Order #{{ order.order_id }}</span>
              </div>
              <h1>
                {{
                  importFeeTotal > 0
                    ? 'ชำระเงินค่านำเข้า (รอบ 2)'
                    : 'ชำระเงินสำหรับคำสั่งพรีออเดอร์'
                }}
              </h1>

              <p class="hero-subtitle" v-if="importFeeTotal === 0">
                <strong>รอบ 1 (ชำระแรก):</strong> สินค้า Preorder จะถูกนำเข้าหลังได้รับการชำระเงิน
                ทีมงานจะแจ้งค่านำเข้าเพิ่มเติมภายหลัง
              </p>
              <p class="hero-subtitle" v-else>
                <strong>รอบ 2 (ชำระค่านำเข้า):</strong> แอดมินได้แจ้งค่านำเข้าแล้ว
                กรุณาชำระเงินค่านำเข้าเพื่อดำเนินการต่อ
              </p>

              <div class="hero-meta">
                <div class="hero-meta-item">
                  <span class="hero-meta-label">รายการ</span>
                  <strong>{{ order.items?.length || 0 }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">ยอดรวม</span>
                  <strong>฿{{ amountDue.toLocaleString() }}</strong>
                </div>
                <div class="hero-meta-divider"></div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">สถานะ</span>
                  <strong
                    class="hero-meta-status"
                    :style="{
                      color: orderStatusDisplay.color + ' !important',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }"
                  >
                    <span
                      style="display: flex; align-items: center"
                      v-html="orderStatusDisplay.icon"
                    ></span>
                    {{ orderStatusDisplay.label }}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <div v-if="isRoundOpen" class="round-open-notice">
            <strong>รอบพรีออเดอร์ยังไม่ปิด</strong>
            <span>คุณสามารถดูรายละเอียดออเดอร์ได้ แต่จะยังชำระเงินหรือส่งสลิปไม่ได้จนกว่าแอดมินจะปิดรอบ</span>
          </div>

          <div class="section-card">
            <div class="section-header">
              <h2 class="section-title" style="display: flex; align-items: center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 8px"
                >
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                รายการสินค้าพรีออเดอร์
              </h2>
              <span class="section-pill">{{ order.items?.length || 0 }} รายการ</span>
            </div>

            <div
              v-if="readyItems.length > 0"
              class="order-category-block"
              style="margin-bottom: 1.5rem"
            >
              <h3
                style="
                  font-size: 0.9rem;
                  font-weight: 800;
                  color: #10b981;
                  margin-bottom: 0.6rem;
                  display: flex;
                  align-items: center;
                "
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                  style="margin-right: 6px"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                พร้อมส่ง
              </h3>
              <div class="item-list">
                <div v-for="it in readyItems" :key="it.detail_id" class="order-item">
                  <div class="item-img">
                    <img v-if="resolveItemImage(it)" :src="resolveItemImage(it)" :alt="it.name" />
                    <div v-else class="item-img-placeholder">
                      <svg viewBox="0 0 40 40" fill="none" width="28" height="28">
                        <rect width="40" height="40" rx="8" fill="#f0e6ff" />
                        <rect
                          x="8"
                          y="10"
                          width="24"
                          height="20"
                          rx="4"
                          stroke="#c9a8f0"
                          stroke-width="2"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="18"
                          r="3"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          fill="none"
                        />
                        <path
                          d="M8 26l8-7 6 6 4-4 6 5"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <div class="item-info">
                    <p class="item-name">
                      {{ it.name || it.prod_name }}
                      <span
                        v-if="it.flavor || it.Flavor"
                        style="
                          display: block;
                          color: #8b5cf6;
                          font-size: 0.85em;
                          font-weight: 600;
                          margin-top: 2px;
                        "
                      >
                        ({{ it.flavor || it.Flavor }})
                      </span>
                    </p>
                    <p class="item-price-small">
                      ราคา ฿{{ displayPrice(it).toLocaleString() }} / ชิ้น
                    </p>
                  </div>
                  <div class="item-meta">
                    <div class="item-qty">x{{ it.qty }}</div>
                    <div class="item-total">
                      ฿{{ (displayPrice(it) * Number(it.qty)).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="preorderItems.length > 0"
              class="order-category-block"
              style="margin-bottom: 1.5rem"
            >
              <h3
                style="
                  font-size: 0.9rem;
                  font-weight: 800;
                  color: #7c3aed;
                  margin-bottom: 0.6rem;
                  display: flex;
                  align-items: center;
                "
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 6px"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                พรีออเดอร์
              </h3>
              <div class="item-list">
                <div v-for="it in preorderItems" :key="it.detail_id" class="order-item">
                  <div class="item-img">
                    <img v-if="resolveItemImage(it)" :src="resolveItemImage(it)" :alt="it.name" />
                    <div v-else class="item-img-placeholder">
                      <svg viewBox="0 0 40 40" fill="none" width="28" height="28">
                        <rect width="40" height="40" rx="8" fill="#f0e6ff" />
                        <rect
                          x="8"
                          y="10"
                          width="24"
                          height="20"
                          rx="4"
                          stroke="#c9a8f0"
                          stroke-width="2"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="18"
                          r="3"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          fill="none"
                        />
                        <path
                          d="M8 26l8-7 6 6 4-4 6 5"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <div class="item-info">
                    <p class="item-name">
                      {{ it.name || it.prod_name }}
                      <span
                        v-if="it.flavor || it.Flavor"
                        style="
                          display: block;
                          color: #8b5cf6;
                          font-size: 0.85em;
                          font-weight: 600;
                          margin-top: 2px;
                        "
                      >
                        ({{ it.flavor || it.Flavor }})
                      </span>
                    </p>
                    <p
                      v-if="isImportFeeStage"
                      class="item-price-small"
                      style="color: #f59e42; font-weight: 600"
                    >
                      ราคานำเข้า: ฿{{ Number(it.import_fee).toLocaleString() }} / ชิ้น
                    </p>
                    <p v-else class="item-price-small">
                      ราคา ฿{{ displayPrice(it).toLocaleString() }} / ชิ้น
                    </p>
                  </div>
                  <div class="item-meta">
                    <div class="item-qty">x{{ it.qty }}</div>
                    <div class="item-total">
                      ฿{{ (displayPrice(it) * Number(it.qty)).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-if="unspecifiedItems.length > 0"
              class="order-category-block"
              style="margin-bottom: 1.5rem"
            >
              <h3
                style="
                  font-size: 0.9rem;
                  font-weight: 800;
                  color: #6b7280;
                  margin-bottom: 0.6rem;
                  display: flex;
                  align-items: center;
                "
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 6px"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                รายการอื่น ๆ
              </h3>
              <div class="item-list">
                <div v-for="it in unspecifiedItems" :key="it.detail_id" class="order-item">
                  <div class="item-img">
                    <img v-if="resolveItemImage(it)" :src="resolveItemImage(it)" :alt="it.name" />
                    <div v-else class="item-img-placeholder">
                      <svg viewBox="0 0 40 40" fill="none" width="28" height="28">
                        <rect width="40" height="40" rx="8" fill="#f0e6ff" />
                        <rect
                          x="8"
                          y="10"
                          width="24"
                          height="20"
                          rx="4"
                          stroke="#c9a8f0"
                          stroke-width="2"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="18"
                          r="3"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          fill="none"
                        />
                        <path
                          d="M8 26l8-7 6 6 4-4 6 5"
                          stroke="#c9a8f0"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <div class="item-info">
                    <p class="item-name">
                      {{ it.name || it.prod_name }}
                      <span
                        v-if="it.flavor || it.Flavor"
                        style="
                          display: block;
                          color: #8b5cf6;
                          font-size: 0.85em;
                          font-weight: 600;
                          margin-top: 2px;
                        "
                      >
                        ({{ it.flavor || it.Flavor }})
                      </span>
                    </p>
                    <p class="item-price-small">
                      ราคา ฿{{ displayPrice(it).toLocaleString() }} / ชิ้น
                    </p>
                  </div>
                  <div class="item-meta">
                    <div class="item-qty">x{{ it.qty }}</div>
                    <div class="item-total">
                      ฿{{ (displayPrice(it) * Number(it.qty)).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isImportFeeStage && !isWaitingForImportFee" class="section-card form-panel">
            <div class="section-header section-header--stacked">
              <h3 class="section-title" style="display: flex; align-items: center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 8px"
                >
                  <path
                    d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                  ></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                ข้อมูลจัดส่ง
              </h3>
              <span class="section-caption">{{
                isShippingLocked
                  ? 'ข้อมูลการจัดส่งสินค้าพรีออเดอร์ (ล็อกเนื่องจากเตรียมจัดส่งแล้ว)'
                  : 'สามารถแก้ไขข้อมูลจัดส่งได้จนกว่าสินค้าจะเตรียมจัดส่ง'
              }}</span>
            </div>
            <div class="order-info">
              <div class="field-group">
                <label for="recipient-name">ชื่อผู้รับ</label>
                <input
                  id="recipient-name"
                  v-model="shippingInfo.name"
                  placeholder="ชื่อผู้รับ"
                  :disabled="isShippingLocked"
                />
              </div>

              <div class="field-group field-group--two-cols">
                <div>
                  <label for="recipient-phone">เบอร์โทรศัพท์</label>
                  <input
                    id="recipient-phone"
                    v-model="shippingInfo.phone"
                    placeholder="0812345678"
                    :disabled="isShippingLocked"
                  />
                </div>
                <div>
                  <label for="shipping-carrier">บริษัทขนส่ง</label>
                  <select
                    id="shipping-carrier"
                    v-model="shippingInfo.carrier"
                    :disabled="isShippingLocked"
                  >
                    <option value="">-- เลือกบริษัทขนส่ง --</option>
                    <option value="Kerry">Kerry</option>
                    <option value="Flash">Flash</option>
                    <option value="J&T">J&T</option>
                    <option value="EMS">EMS</option>
                  </select>
                </div>
              </div>

              <div class="field-group">
                <label for="shipping-notes">หมายเหตุเพิ่มเติม</label>
                <input
                  id="shipping-notes"
                  v-model="shippingInfo.notes"
                  placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                  :disabled="isShippingLocked"
                />
              </div>

              <div class="field-group">
                <label for="recipient-address">ที่อยู่จัดส่ง</label>
                <textarea
                  id="recipient-address"
                  v-model="shippingInfo.address"
                  rows="4"
                  placeholder="ที่อยู่สำหรับจัดส่งสินค้า"
                  :disabled="isShippingLocked"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="payment-section">
          <div class="payment-sticky">
            <div v-if="!isFullyPaid" class="section-card postpone-card postpone-card--prominent">
              <div v-if="!isWaitingForImportFee" class="postpone-header">
                <div>
                  <p class="postpone-title" style="display: flex; align-items: center">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="margin-right: 6px"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    ข้อมูลกำหนดชำระ
                  </p>
                  <p class="postpone-subtitle">กำหนดชำระล่าสุด</p>
                </div>
                <strong>{{ orderDeadlineDisplay }}</strong>
              </div>

              <div v-if="isWaitingForImportFee" class="wait-import-notice">
                <span class="wait-import-notice__icon" style="display: flex; align-items: center"
                  ><svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline></svg
                ></span>
                <div class="wait-import-notice__text">
                  <strong>รอแอดมินแจ้งค่านำเข้า</strong>
                  <span>กรุณารอแอดมินคำนวณและแจ้งค่านำเข้าก่อน จึงจะสามารถชำระเงินรอบ 2 ได้</span>
                </div>
              </div>

              <button
                v-if="order.deadline != null"
                class="secondary-btn"
                type="button"
                @click="showPostponeForm = !showPostponeForm"
                :disabled="loading"
                style="font-size: 0.98rem; padding: 14px 18px"
              >
                {{ showPostponeForm ? 'ซ่อนแบบฟอร์มขอเลื่อน' : 'ขอเลื่อนเวลา' }}
              </button>

              <div
                v-if="latestPostpone"
                class="postpone-latest-banner"
                :class="'postpone-latest--' + latestPostpone.status.toLowerCase()"
              >
                <div class="postpone-latest-banner__row">
                  <span class="postpone-latest-banner__label">คำขอเลื่อนล่าสุด</span>
                  <span class="postpone-status-badge" :class="postponeStatusLabel?.cls">{{
                    postponeStatusLabel?.text
                  }}</span>
                </div>
                <div class="postpone-latest-banner__detail">
                  <span style="display: flex; align-items: center; gap: 4px">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    วันที่ขอเลื่อน:
                    <strong>{{
                      formatThaiDateTime(
                        latestPostpone.new_deadline || latestPostpone.Post_date,
                        'ยังไม่ระบุ',
                      )
                    }}</strong>
                  </span>
                  <span
                    v-if="latestPostpone.request_reason"
                    style="display: flex; align-items: flex-start; gap: 4px; margin-top: 2px"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="margin-top: 2px; flex-shrink: 0"
                    >
                      <path
                        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                      ></path>
                    </svg>
                    <span style="flex: 1">เหตุผล: {{ latestPostpone.request_reason }}</span>
                  </span>
                  <span
                    v-if="latestPostpone.contact_phone"
                    style="display: flex; align-items: center; gap: 4px; margin-top: 2px"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                      ></path>
                    </svg>
                    เบอร์ติดต่อ: {{ latestPostpone.contact_phone }}
                  </span>
                </div>
              </div>

              <div v-if="showPostponeForm" class="postpone-form">
                <p
                  v-if="latestPostpone"
                  class="postpone-prefill-note"
                  style="display: flex; align-items: center"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="margin-right: 6px; flex-shrink: 0"
                  >
                    <path
                      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                    ></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
                  ข้อมูลด้านล่างดึงมาจากคำขอครั้งล่าสุด แก้ไขได้ตามต้องการ
                </p>
                <div class="field-group">
                  <span class="form-label">วันที่ต้องการเลื่อน</span>
                  <input
                    class="form-input"
                    type="datetime-local"
                    v-model="postponeRequest.new_deadline"
                  />
                </div>
                <div class="field-group">
                  <span class="form-label">เหตุผลการขอเลื่อน</span>
                  <textarea
                    class="textarea-input"
                    rows="4"
                    v-model="postponeRequest.reason"
                    placeholder="ระบุเหตุผล เช่น ต้องการรอสินค้าเข้าคลัง, เปลี่ยนวันชำระเงิน ฯลฯ"
                  ></textarea>
                </div>
                <div class="field-group">
                  <span class="form-label">เบอร์ติดต่อ</span>
                  <input
                    class="form-input"
                    type="text"
                    v-model="postponeRequest.contact_phone"
                    placeholder="เช่น 0812345678"
                  />
                </div>
                <div class="field-group">
                  <span class="form-label">รายละเอียดเพิ่มเติม</span>
                  <textarea
                    class="textarea-input"
                    rows="3"
                    v-model="postponeRequest.details"
                    placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                  ></textarea>
                </div>
                <button
                  class="btn-checkout"
                  type="button"
                  @click="submitPostponeRequest"
                  :disabled="postponeSubmitting"
                >
                  {{ postponeSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเลื่อนเวลา' }}
                </button>
              </div>
            </div>

            <div v-if="isCancelled" class="cancelled-banner">
              <div class="cancelled-banner__icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
              </div>
              <div class="cancelled-banner__text">
                <strong>ออเดอร์นี้ถูกยกเลิกแล้ว</strong>
                <span>หากต้องการชำระเงินต่อ กรุณาขอเลื่อนกำหนดชำระก่อน แล้วรอแอดมินอนุมัติ</span>
              </div>
            </div>

            <div
              v-if="!isCancelled && !isWaitingForImportFee"
              class="section-card glass-card payment-panel"
            >
              <h3 class="section-title" style="display: flex; align-items: center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 8px"
                >
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                วิธีการชำระเงิน
              </h3>
              <div
                class="payment-methods"
                :style="isFullyPaid ? { pointerEvents: 'none', opacity: 0.75 } : {}"
              >
                <div
                  v-for="method in paymentMethods"
                  :key="method.qr_id || method.id"
                  class="payment-method"
                  :class="{
                    'payment-method--selected':
                      selectedPaymentMethod === (method.qr_id || method.id),
                  }"
                  @click="selectedPaymentMethod = method.qr_id || method.id"
                >
                  <div class="payment-method-summary">
                    <span class="method-name">{{ method.payment_method || method.name }}</span>
                  </div>

                  <div
                    v-if="selectedPaymentMethod === (method.qr_id || method.id)"
                    class="payment-method-qr"
                  >
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

              <h3 class="section-title" style="display: flex; align-items: center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style="margin-right: 8px"
                >
                  <path
                    d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                  ></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                หลักฐานการโอน
              </h3>

              <div v-if="isInvalidSlip" class="invalid-slip-banner">
                <div class="invalid-slip-banner__icon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    ></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <div class="invalid-slip-banner__text">
                  <strong>สลิปไม่ถูกต้อง กรุณาแนบสลิปใหม่</strong>
                  <span
                    >แอดมินตรวจสอบแล้วพบว่าสลิปที่แนบมาไม่ถูกต้อง กรุณาอัปโหลดสลิปใหม่อีกครั้ง</span
                  >
                </div>
              </div>

              <div
                v-if="isInvalidImportSlip"
                class="invalid-slip-banner invalid-slip-banner--import"
              >
                <div class="invalid-slip-banner__icon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    ></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <div class="invalid-slip-banner__text">
                  <strong>สลิปค่านำเข้าไม่ถูกต้อง กรุณาแนบสลิปใหม่</strong>
                  <span
                    >แอดมินตรวจสอบแล้วพบว่าสลิปค่านำเข้าที่แนบมาไม่ถูกต้อง
                    กรุณาอัปโหลดสลิปค่านำเข้าใหม่อีกครั้ง</span
                  >
                </div>
              </div>

              <div
                class="upload-area"
                :class="{ 'upload-area--invalid': isInvalidSlip || isInvalidImportSlip }"
              >
                <input
                  ref="slipFileInput"
                  type="file"
                  id="slip-file"
                  accept="image/*"
                  @change="onFileChange"
                  class="hidden-input"
                  :disabled="isReadOnlyStage || isFullyPaid || isRoundOpen"
                />
                <div v-if="!slipImageUrl" class="upload-label" @click="editSlipImage">
                  <div class="upload-prompt">
                    <span class="upload-icon"
                      ><svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line></svg
                    ></span>
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
                  <div
                    v-if="!(isReadOnlyStage || isFullyPaid)"
                    class="edit-overlay"
                    @click.stop="editSlipImage"
                  >
                    แตะเพื่อเปลี่ยนรูปภาพ
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="!isCancelled && !isWaitingForImportFee"
              class="section-card summary-card summary-card--wide summary-card--compact"
            >
              <div
                style="
                  display: flex;
                  flex-direction: column;
                  gap: 8px;
                  font-size: 0.85rem;
                  font-weight: 700;
                  color: #7d6e9a;
                  padding-inline: 4px;
                "
              >
                <div v-if="!isImportFeePaymentStage" style="display: flex; justify-content: space-between">
                  <span>ยอดรวมสินค้า</span>
                  <span>฿{{ Number(order.total_amount).toLocaleString() }}</span>
                </div>
                <div
                  style="display: flex; justify-content: space-between"
                  v-if="importFeeTotal > 0"
                >
                  <span>ค่านำเข้าแจ้งแล้ว</span>
                  <span>฿{{ importFeeTotal.toLocaleString() }}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span>สถานะค่านำเข้า</span>
                  <span
                    class="pending-text"
                    v-if="importFeeTotal === 0"
                    style="
                      color: #f59e0b;
                      background: #fffbeb;
                      padding: 2px 8px;
                      border-radius: 12px;
                      font-size: 0.74rem;
                      display: flex;
                      align-items: center;
                      gap: 4px;
                    "
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    รอแจ้งจากแอดมิน</span
                  >
                  <span v-else style="color: #10b981; display: flex; align-items: center; gap: 4px">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    แจ้งแล้ว
                  </span>
                </div>
              </div>
              <hr
                class="divider"
                style="border: none; border-top: 1px dashed #eadff5; margin: 4px 0"
              />

              <div class="summary-header">
                <span class="summary-label">ยอดรวม</span>
                <strong class="summary-amount"> ฿{{ amountDue.toLocaleString() }} </strong>
              </div>
              <div class="summary-note">
                สามารถกดบันทึกเพื่ออัปเดตข้อมูลจัดส่งใหม่เข้าสู่ฐานข้อมูลได้
              </div>
              <hr class="divider" />

              <button
                class="btn-checkout"
                @click="confirmPayment"
                :disabled="loading || isReadOnlyStage || isRoundOpen"
              >
                {{
                  loading
                    ? 'กำลังประมวลผล...'
                    : isRoundOpen
                      ? 'รอแอดมินปิดรอบก่อนจึงจะชำระเงินได้'
                      : isReadOnlyStage
                      ? 'ออเดอร์ถูกเตรียมจัดส่งแล้ว'
                      : order.status && ['paid'].includes(String(order.status).toLowerCase())
                        ? 'บันทึกอัปเดตข้อมูลจัดส่ง'
                        : importFeeTotal > 0
                          ? 'ยืนยันการชำระค่านำเข้า'
                          : 'ยืนยันการชำระเงิน Preorder'
                }}
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
/* (โค้ด CSS ของเดิมทั้งหมด ไม่มีการเปลี่ยนแปลง) */
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
  font-size: 0.8rem;
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
.field-group label,
.form-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #5a487c;
}
.field-group input,
.field-group textarea,
.field-group select,
.form-input,
.textarea-input {
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
.field-group select:focus,
.form-input:focus,
.textarea-input:focus {
  border-color: #7c63d8;
  box-shadow: 0 0 0 4px rgba(124, 99, 216, 0.12);
}
.field-group textarea,
.textarea-input {
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
.round-open-notice {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 1rem 0;
  padding: 1rem 1.1rem;
  border: 1px solid #f3c96b;
  border-radius: 14px;
  background: #fff8e7;
  color: #8a5a00;
  line-height: 1.5;
}
.round-open-notice strong {
  color: #704700;
}
.btn-checkout:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px rgba(111, 80, 160, 0.3);
}
.btn-checkout:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}
.secondary-btn {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #a78bfa;
  border-radius: 14px;
  background: #f8f5ff;
  color: #5b21b6;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
  margin-bottom: 1rem;
}
.secondary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(124, 99, 216, 0.12);
  background: #eef2ff;
}
.wait-import-notice {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: #fffbeb;
  border: 1.5px solid #fde68a;
  color: #92400e;
  margin-bottom: 0.75rem;
}
.wait-import-notice__icon {
  font-size: 1.2rem;
  flex-shrink: 0;
  margin-top: 1px;
}
.wait-import-notice__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wait-import-notice__text strong {
  font-size: 0.88rem;
  font-weight: 800;
}
.wait-import-notice__text span {
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.5;
  opacity: 0.9;
}
.cancelled-banner {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: #fff7ed;
  border: 1.5px solid #fed7aa;
  color: #9a3412;
}
.cancelled-banner__icon {
  font-size: 1.2rem;
  flex-shrink: 0;
  margin-top: 1px;
}
.cancelled-banner__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cancelled-banner__text strong {
  font-size: 0.88rem;
  font-weight: 800;
}
.cancelled-banner__text span {
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.5;
  opacity: 0.9;
}
.postpone-card {
  margin-top: 0;
}
.postpone-card--prominent {
  border: 1.8px solid #d6bcfa;
  background: linear-gradient(180deg, #ffffff, #faf6ff);
  padding: 1rem;
  box-shadow: 0 12px 30px rgba(111, 80, 160, 0.06);
  border-radius: 14px;
}
.postpone-latest-banner {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1.5px solid #e6d9ff;
  background: #faf7ff;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.postpone-latest--pending {
  border-color: #fde68a;
  background: #fffbeb;
}
.postpone-latest--approved {
  border-color: #6ee7b7;
  background: #f0fdf8;
}
.postpone-latest--rejected {
  border-color: #fca5a5;
  background: #fff7f7;
}
.postpone-latest-banner__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.postpone-latest-banner__label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #5f3fa8;
}
.postpone-latest-banner__detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: #4b3f72;
  line-height: 1.5;
}
.postpone-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 800;
}
.status--pending {
  background: #fef3c7;
  color: #92400e;
}
.status--approved {
  background: #d1fae5;
  color: #065f46;
}
.status--rejected {
  background: #fee2e2;
  color: #991b1b;
}
.postpone-prefill-note {
  margin: 0;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid #c7d2fe;
}
.postpone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.postpone-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #35235b;
}
.postpone-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: #7d6e9a;
}
.postpone-form {
  display: grid;
  gap: 1rem;
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
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
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .field-group--two-cols {
    grid-template-columns: 1fr;
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
}
