<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import { useAdminProductStore } from '@/stores/adminProductStore'

const MAX_IMAGE_COUNT = 6
const LOW_STOCK_THRESHOLD = 5
const CATEGORY_NAME_MAX_LENGTH = 100
const CATEGORY_DETAIL_MAX_LENGTH = 255

const store = useAdminProductStore()

const searchKeyword = ref('')
const productPanelOpen = ref(false)
const categoryPanelOpen = ref(false)
const editingProductId = ref(null)
const isSubmitting = ref(false)
const isCategorySubmitting = ref(false)

const notice = reactive({
  type: '',
  message: '',
})

const form = reactive({
  name: '',
  sku: '',
  categoryId: '',
  basePrice: 0,
  stock: 0,
  imageUrls: [],
  preorderEnabled: false,
  readyToShipEnabled: true,
})

const categoryForm = reactive({
  name: '',
  detail: '',
})

const categoryMap = computed(() => {
  return new Map(store.categories.map((category) => [category.id, category.name]))
})

const productCount = computed(() => store.products.length)

const categoryCount = computed(() => store.categories.length)

const lowStockCount = computed(() => {
  return store.products.filter((product) => Number(product.stock) <= LOW_STOCK_THRESHOLD).length
})

const isLoading = computed(() => store.isLoading)

const hasCategories = computed(() => store.categories.length > 0)

const isSubmitDisabled = computed(() => {
  return (
    isSubmitting.value ||
    isLoading.value ||
    !hasCategories.value ||
    !form.name.trim() ||
    !form.sku.trim() ||
    !form.categoryId
  )
})

const filteredProducts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return store.products
  }

  return store.products.filter((product) => {
    const categoryName = getCategoryName(product.categoryId).toLowerCase()

    return (
      product.name.toLowerCase().includes(keyword) ||
      product.sku.toLowerCase().includes(keyword) ||
      categoryName.includes(keyword)
    )
  })
})

function setNotice(type, message) {
  notice.type = type
  notice.message = message
}

function toThaiApiMessage(message) {
  const text = String(message || '').trim()
  if (!text) {
    return 'เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง'
  }

  const lookup = {
    'Category already exists.': 'มีหมวดหมู่นี้อยู่แล้ว',
    'Category name is required.': 'กรุณากรอกชื่อหมวดหมู่',
    [`Category name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`]: `ชื่อหมวดหมู่ต้องไม่เกิน ${CATEGORY_NAME_MAX_LENGTH} ตัวอักษร`,
    [`Category detail must be at most ${CATEGORY_DETAIL_MAX_LENGTH} characters.`]: `รายละเอียดหมวดหมู่ต้องไม่เกิน ${CATEGORY_DETAIL_MAX_LENGTH} ตัวอักษร`,
  }

  return lookup[text] || text
}

function resolveImageUrl(url) {
  if (!url) {
    return ''
  }

  return url
}

async function handleImageSelected(event) {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) {
    return
  }

  const remaining = MAX_IMAGE_COUNT - form.imageUrls.length
  if (remaining <= 0) {
    setNotice('error', `อัปโหลดรูปได้สูงสุด ${MAX_IMAGE_COUNT} รูป`)
    event.target.value = ''
    return
  }

  const filesToUpload = files.slice(0, remaining)
  let uploadedCount = 0

  for (const file of filesToUpload) {
    try {
      const result = await store.uploadProductImage(file)
      form.imageUrls.push(result.url)
      uploadedCount += 1
    } catch {
      setNotice('error', `อัปโหลดรูปไม่สำเร็จ: ${file.name}`)
    }
  }

  if (files.length > filesToUpload.length) {
    setNotice(
      'warning',
      `อัปโหลดแล้ว ${uploadedCount} รูป และมีบางไฟล์ถูกข้ามเพราะเกินลิมิต ${MAX_IMAGE_COUNT} รูป`,
    )
  } else if (uploadedCount > 0) {
    setNotice('success', `อัปโหลดรูปสำเร็จ ${uploadedCount} รูป`)
  }

  event.target.value = ''
}

function clearImage(index) {
  form.imageUrls.splice(index, 1)
}

async function submitForm() {
  if (!form.name.trim() || !form.sku.trim() || !form.categoryId) {
    setNotice('error', 'กรอกข้อมูลที่จำเป็นให้ครบก่อนบันทึกสินค้า')
    return
  }

  if (!hasCategories.value) {
    setNotice('error', 'กรุณาเพิ่มหมวดหมู่อย่างน้อย 1 หมวดก่อนเพิ่มสินค้า')
    return
  }

  isSubmitting.value = true

  try {
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      categoryId: form.categoryId,
      basePrice: Number(form.basePrice) || 0,
      stock: Number(form.stock) || 0,
      imageUrls: [...form.imageUrls],
      preorderEnabled: form.preorderEnabled,
      readyToShipEnabled: form.readyToShipEnabled,
    }

    if (editingProductId.value) {
      await store.updateProduct(editingProductId.value, payload)
      setNotice('success', 'อัปเดตสินค้าเรียบร้อยแล้ว')
    } else {
      await store.createProduct(payload)
      setNotice('success', 'เพิ่มสินค้าเรียบร้อยแล้ว')
    }

    resetForm()
  } catch {
    setNotice('error', 'บันทึกสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  } finally {
    isSubmitting.value = false
  }
}

async function submitCategoryForm() {
  const categoryName = categoryForm.name.trim()
  const categoryDetail = categoryForm.detail.trim()

  if (!categoryName) {
    setNotice('error', 'กรุณากรอกชื่อหมวดหมู่')
    return
  }

  if (categoryName.length > CATEGORY_NAME_MAX_LENGTH) {
    setNotice('error', `ชื่อหมวดหมู่ต้องไม่เกิน ${CATEGORY_NAME_MAX_LENGTH} ตัวอักษร`)
    return
  }

  if (categoryDetail.length > CATEGORY_DETAIL_MAX_LENGTH) {
    setNotice('error', `รายละเอียดหมวดหมู่ต้องไม่เกิน ${CATEGORY_DETAIL_MAX_LENGTH} ตัวอักษร`)
    return
  }

  isCategorySubmitting.value = true

  try {
    const createdCategory = await store.createCategory({
      name: categoryName,
      detail: categoryDetail,
    })

    form.categoryId = createdCategory.id
    categoryForm.name = ''
    categoryForm.detail = ''
    setNotice('success', 'เพิ่มหมวดหมู่เรียบร้อยแล้ว')
    categoryPanelOpen.value = false
  } catch (error) {
    if (error instanceof Error && error.message) {
      setNotice('error', toThaiApiMessage(error.message))
    } else {
      setNotice('error', 'เพิ่มหมวดหมู่ไม่สำเร็จ')
    }
  } finally {
    isCategorySubmitting.value = false
  }
}

function openCreateForm() {
  if (editingProductId.value) {
    resetForm()
  }

  productPanelOpen.value = true
  editingProductId.value = null
}

function openCategoryForm() {
  categoryPanelOpen.value = true
}

function closeCategoryForm() {
  categoryPanelOpen.value = false
  categoryForm.name = ''
  categoryForm.detail = ''
}

function editProduct(product) {
  productPanelOpen.value = true
  editingProductId.value = product.id

  form.name = product.name
  form.sku = product.sku
  form.categoryId = product.categoryId
  form.basePrice = Number(product.basePrice) || 0
  form.stock = Number(product.stock) || 0
  form.imageUrls = [...(product.imageUrls || [])]
  form.preorderEnabled = Boolean(product.preorderEnabled)
  form.readyToShipEnabled = Boolean(product.readyToShipEnabled)
}

function resetForm() {
  form.name = ''
  form.sku = ''
  form.categoryId = ''
  form.basePrice = 0
  form.stock = 0
  form.imageUrls = []
  form.preorderEnabled = false
  form.readyToShipEnabled = true

  editingProductId.value = null
  productPanelOpen.value = false
}

function getImageCount(product) {
  return Array.isArray(product.imageUrls) ? product.imageUrls.length : 0
}

function getPrimaryImage(product) {
  if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
    return resolveImageUrl(product.imageUrls[0])
  }

  return ''
}

async function deleteProduct(id) {
  if (!window.confirm('ยืนยันการลบสินค้านี้ใช่หรือไม่')) {
    return
  }

  try {
    await store.removeProduct(id)
    setNotice('success', 'ลบสินค้าเรียบร้อยแล้ว')
  } catch {
    setNotice('error', 'ไม่สามารถลบสินค้าได้')
  }
}

function getCategoryName(categoryId) {
  return categoryMap.value.get(categoryId) || 'ไม่ระบุหมวดหมู่'
}

function getAvailabilityText(product) {
  const statuses = []
  if (product.readyToShipEnabled) {
    statuses.push('พร้อมส่ง')
  }
  if (product.preorderEnabled) {
    statuses.push('พรีออเดอร์')
  }

  if (statuses.length === 0) {
    return 'ยังไม่เปิดขาย'
  }

  return statuses.join(' • ')
}

function getStockLevelClass(stock) {
  const amount = Number(stock) || 0
  if (amount <= 0) {
    return 'stock-pill stock-pill--out'
  }
  if (amount <= LOW_STOCK_THRESHOLD) {
    return 'stock-pill stock-pill--low'
  }
  return 'stock-pill stock-pill--ok'
}

function getStockLevelText(stock) {
  const amount = Number(stock) || 0
  if (amount <= 0) {
    return 'หมดสต็อก'
  }
  if (amount <= LOW_STOCK_THRESHOLD) {
    return 'ใกล้หมด'
  }
  return 'ปกติ'
}

onMounted(async () => {
  const [categoryResult, productResult] = await Promise.allSettled([
    store.fetchCategories(),
    store.fetchProducts(),
  ])

  if (categoryResult.status === 'rejected' && productResult.status === 'rejected') {
    setNotice('error', 'โหลดหมวดหมู่และสินค้าไม่สำเร็จ')
    return
  }

  if (categoryResult.status === 'rejected' || productResult.status === 'rejected') {
    setNotice('warning', 'ข้อมูลบางส่วนโหลดไม่สำเร็จ หากข้อมูลไม่ครบให้รีเฟรชหน้าอีกครั้ง')
    return
  }

  setNotice('success', 'โหลดข้อมูลสินค้าและหมวดหมู่เรียบร้อยแล้ว')
})
</script>

<template>
  <section class="admin-page">
    <header class="page-intro">
      <div>
        <p class="intro-overline">Product Control Center</p>
        <h1>จัดการสต็อกสินค้า</h1>
        <p class="intro-subtitle">เพิ่ม แก้ไข และจัดการสถานะสินค้าในหน้าจอเดียว</p>
      </div>
      <div class="intro-bubble">{{ productCount }} รายการ</div>
    </header>

    <header class="toolbar">
      <div class="summary-strip">
        <p class="chip">
          <span>สินค้าทั้งหมด</span><strong>{{ productCount }}</strong>
        </p>
        <p class="chip">
          <span>หมวดหมู่ทั้งหมด</span><strong>{{ categoryCount }}</strong>
        </p>
        <p class="chip">
          <span>สินค้าใกล้หมด</span><strong>{{ lowStockCount }}</strong>
        </p>
      </div>

      <div class="toolbar-actions">
        <input v-model="searchKeyword" placeholder="ค้นหาชื่อสินค้า, SKU, หมวดหมู่" type="text" />
        <button class="toolbar-btn toolbar-btn--secondary" type="button" @click="openCategoryForm">
          เพิ่มหมวดหมู่
        </button>
        <button class="toolbar-btn toolbar-btn--primary" type="button" @click="openCreateForm">
          {{ productPanelOpen ? 'กำลังแก้ไขสินค้า' : 'เพิ่มสินค้า' }}
        </button>
      </div>
    </header>

    <p v-if="isLoading" class="loading">กำลังโหลด...</p>
    <p v-if="notice.message" :class="['notice', notice.type]">{{ notice.message }}</p>

    <section v-if="categoryPanelOpen" class="form-panel">
      <div class="form-head">
        <h2>เพิ่มหมวดหมู่</h2>
        <button class="ghost" type="button" @click="closeCategoryForm">ปิด</button>
      </div>

      <form class="category-form" @submit.prevent="submitCategoryForm">
        <label>
          ชื่อหมวดหมู่ *
          <input v-model="categoryForm.name" placeholder="ระบุชื่อหมวดหมู่" type="text" />
        </label>

        <label>
          รายละเอียดหมวดหมู่
          <input
            v-model="categoryForm.detail"
            placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
            type="text"
          />
        </label>

        <div class="form-actions">
          <button :disabled="isCategorySubmitting || isLoading" type="submit">
            {{ isCategorySubmitting ? 'กำลังเพิ่ม...' : 'บันทึกหมวดหมู่' }}
          </button>
          <button class="ghost" type="button" @click="closeCategoryForm">ยกเลิก</button>
        </div>
      </form>
    </section>

    <section v-if="productPanelOpen" class="form-panel">
      <div class="form-head">
        <h2>{{ editingProductId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า' }}</h2>
        <button class="ghost" type="button" @click="resetForm">ปิด</button>
      </div>

      <form class="product-form" @submit.prevent="submitForm">
        <label>
          ชื่อสินค้า *
          <input v-model="form.name" type="text" />
        </label>

        <label>
          SKU *
          <input v-model="form.sku" type="text" />
        </label>

        <label>
          หมวดหมู่ *
          <select v-model="form.categoryId">
            <option disabled value="">เลือกหมวดหมู่</option>
            <option v-for="category in store.categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>

        <label>
          ราคา *
          <input v-model.number="form.basePrice" min="0" step="1" type="number" />
        </label>

        <label>
          จำนวนคงเหลือ
          <input v-model.number="form.stock" min="0" type="number" />
        </label>

        <label class="upload-field">
          รูปภาพ ({{ form.imageUrls.length }}/{{ MAX_IMAGE_COUNT }})
          <input
            :disabled="form.imageUrls.length >= MAX_IMAGE_COUNT"
            accept="image/*"
            multiple
            type="file"
            @change="handleImageSelected"
          />
        </label>

        <div class="image-list">
          <div
            v-for="(imageUrl, imageIndex) in form.imageUrls"
            :key="`${imageUrl}-${imageIndex}`"
            class="image-item"
          >
            <img :src="resolveImageUrl(imageUrl)" alt="product" />
            <button class="ghost" type="button" @click="clearImage(imageIndex)">ลบรูป</button>
          </div>
        </div>

        <div class="form-actions">
          <button :disabled="isSubmitDisabled" type="submit">
            {{
              isSubmitting ? 'กำลังบันทึก...' : editingProductId ? 'อัปเดตสินค้า' : 'บันทึกสินค้า'
            }}
          </button>
          <button class="ghost" type="button" @click="resetForm">ยกเลิก</button>
        </div>
      </form>
    </section>

    <section class="product-grid" v-if="filteredProducts.length > 0">
      <article v-for="product in filteredProducts" :key="product.id" class="product-card">
        <div class="media">
          <img
            v-if="getPrimaryImage(product)"
            :src="getPrimaryImage(product)"
            alt="product image"
          />
          <div v-else class="placeholder">ไม่มีรูปภาพ</div>
        </div>

        <div class="card-head">
          <h3>{{ product.name }}</h3>
          <span :class="getStockLevelClass(product.stock)">{{
            getStockLevelText(product.stock)
          }}</span>
        </div>

        <p class="caption">
          {{ getCategoryName(product.categoryId) }} • {{ getAvailabilityText(product) }}
        </p>
        <p class="meta">รหัส SKU: {{ product.sku }}</p>
        <p class="meta">
          ราคา:
          {{
            new Intl.NumberFormat('th-TH', {
              style: 'currency',
              currency: 'THB',
              maximumFractionDigits: 0,
            }).format(Number(product.basePrice) || 0)
          }}
        </p>
        <p class="meta">คงเหลือ: {{ product.stock }} ชิ้น</p>
        <p class="meta">รูปภาพทั้งหมด: {{ getImageCount(product) }}</p>

        <div class="card-actions">
          <button class="ghost" type="button" @click="editProduct(product)">แก้ไข</button>
          <button class="danger" type="button" @click="deleteProduct(product.id)">ลบ</button>
        </div>
      </article>
    </section>

    <section v-else class="empty-box">
      <h3>ไม่พบรายการสินค้า</h3>
      <p>ลองเปลี่ยนคำค้นหา หรือกดปุ่ม เพิ่มสินค้า เพื่อเริ่มต้นรายการใหม่</p>
      <button class="toolbar-btn toolbar-btn--primary" type="button" @click="openCreateForm">
        เพิ่มสินค้า
      </button>
    </section>
  </section>
</template>

<style scoped>
.admin-page {
  display: grid;
  gap: 1rem;
}

.page-intro {
  border: 1px solid #e8daf8;
  border-radius: 16px;
  background:
    radial-gradient(circle at right top, rgba(255, 194, 211, 0.36), transparent 48%),
    linear-gradient(140deg, rgba(255, 255, 255, 0.92), rgba(248, 241, 255, 0.96));
  box-shadow: 0 12px 28px rgba(89, 61, 125, 0.08);
  padding: 1rem 1.1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
}

.intro-overline {
  color: #9a7dbf;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 0.24rem;
}

.page-intro h1 {
  color: #3f2f5d;
  font-size: 1.85rem;
  line-height: 1.08;
  font-weight: 900;
}

.intro-subtitle {
  margin-top: 0.22rem;
  color: #75658f;
  font-size: 0.9rem;
}

.intro-bubble {
  border-radius: 999px;
  border: 1px solid #e2cdf8;
  background: #fff;
  color: #6f5095;
  font-weight: 800;
  padding: 0.45rem 0.9rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.8rem;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 0.62rem;
}

.chip {
  margin: 0;
  border-radius: 18px;
  border: 1px solid #eadff5;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(248, 241, 255, 0.9));
  padding: 0.78rem 0.86rem;
  display: grid;
  gap: 0.18rem;
  color: #64557d;
  box-shadow: 0 10px 20px rgba(87, 63, 122, 0.08);
}

.chip span {
  font-size: 0.82rem;
  color: #7e6b9c;
  font-weight: 700;
  line-height: 1.2;
}

.chip strong {
  color: #3f2f5d;
  font-weight: 900;
  font-size: 1.7rem;
  line-height: 1;
}

.chip:nth-child(1) {
  border-color: #d8c4f0;
  background: linear-gradient(160deg, #ffffff 0%, #f4eaff 100%);
}

.chip:nth-child(2) {
  border-color: #cde8ff;
  background: linear-gradient(160deg, #ffffff 0%, #ebf6ff 100%);
}

.chip:nth-child(3) {
  border-color: #ffe0c9;
  background: linear-gradient(160deg, #ffffff 0%, #fff3e9 100%);
}

.toolbar-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-btn {
  min-height: 40px;
  white-space: nowrap;
  padding-inline: 0.95rem;
}

.toolbar-btn--secondary {
  border-color: #d6b9f1;
  background: #f7efff;
  color: #6a4f89;
}

.toolbar-btn--secondary:hover {
  background: #f1e4ff;
}

.toolbar-btn--primary {
  border-color: #b788ea;
  background: linear-gradient(180deg, #cda2fb 0%, #b97be8 100%);
  color: #fff;
  box-shadow: 0 8px 18px rgba(132, 86, 179, 0.28);
}

.toolbar-btn--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 11px 22px rgba(132, 86, 179, 0.32);
}

.loading {
  color: #695981;
  font-weight: 700;
}

.notice {
  border-radius: 12px;
  padding: 0.58rem 0.72rem;
  border: 1px solid;
  font-size: 0.85rem;
}

.notice.success {
  color: #215f37;
  background: #e6f6eb;
  border-color: #cbecd7;
}

.notice.warning {
  color: #7d5e23;
  background: #fff8dd;
  border-color: #f5e8ad;
}

.notice.error {
  color: #8f3131;
  background: #fde9e9;
  border-color: #f3cbcb;
}

.form-panel {
  border-radius: 14px;
  border: 1px solid #eadff5;
  background: rgba(255, 255, 255, 0.9);
  padding: 1rem;
  box-shadow: 0 8px 22px rgba(63, 45, 95, 0.08);
}

.form-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
}

.form-head h2 {
  color: #4e3b67;
  font-size: 1.08rem;
  font-weight: 900;
  line-height: 1.2;
}

.product-form {
  display: grid;
  gap: 0.72rem;
}

.category-form {
  display: grid;
  gap: 0.6rem;
  border: 1px solid #eadff5;
  border-radius: 12px;
  padding: 0.72rem;
  margin-bottom: 0.78rem;
  background: #fff;
}

.product-form label {
  display: grid;
  gap: 0.35rem;
  color: #64557d;
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.35;
}

.upload-field input[type='file'] {
  border: 1px dashed #d8c4f0;
  background: #fdf8ff;
}

.image-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
  gap: 0.55rem;
}

.image-item {
  border: 1px solid #eadff5;
  border-radius: 10px;
  padding: 0.42rem;
  background: #fff;
}

.image-item img {
  width: 100%;
  height: 86px;
  object-fit: cover;
  border-radius: 7px;
  margin-bottom: 0.38rem;
}

.switch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.toggle-field {
  display: inline-flex;
  align-items: center;
  gap: 0.44rem;
  color: #5d4e76;
  font-size: 0.86rem;
  line-height: 1.35;
}

.toggle-field input {
  accent-color: #b684ed;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.7rem;
}

.product-card {
  border: 1px solid #eadff5;
  border-radius: 14px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.94), rgba(251, 246, 255, 0.9));
  padding: 0.62rem;
  min-width: 0;
  box-shadow: 0 9px 24px rgba(79, 62, 108, 0.12);
  transition:
    transform 0.2s ease,
    box-shadow 0.25s ease;
}

.product-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 28px rgba(79, 62, 108, 0.16);
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 0.45rem;
  align-items: flex-start;
}

.media {
  width: 100%;
  height: 112px;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.48rem;
  background: #f3effa;
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  color: #8d7ba8;
  font-size: 0.82rem;
}

.product-card h3 {
  font-size: 0.9rem;
  font-weight: 800;
  color: #45315f;
  line-height: 1.25;
  margin-bottom: 0.1rem;
}

.caption {
  font-size: 0.75rem;
  color: #8b7ba3;
  line-height: 1.2;
  margin-bottom: 0.15rem;
}

.meta {
  font-size: 0.78rem;
  color: #675980;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions {
  margin-top: 0.38rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.compact {
  font-size: 0.73rem;
  white-space: nowrap;
  line-height: 1.15;
}

.compact span {
  white-space: nowrap;
}

.stock-pill {
  border-radius: 999px;
  border: 1px solid;
  padding: 0.16rem 0.52rem;
  font-size: 0.67rem;
  font-weight: 800;
  white-space: nowrap;
}

.stock-pill--ok {
  color: #1f7a5a;
  background: #e4f8ef;
  border-color: #bcebd8;
}

.stock-pill--low {
  color: #9b6210;
  background: #fff2d9;
  border-color: #f7ddb0;
}

.stock-pill--out {
  color: #9c2f42;
  background: #ffe6ea;
  border-color: #f6bec8;
}

.empty-box {
  border: 1px dashed #dcc8f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
  padding: 1.3rem;
  text-align: center;
  display: grid;
  gap: 0.5rem;
  justify-items: center;
}

.empty-box h3 {
  font-size: 1rem;
  color: #463362;
  font-weight: 800;
}

.empty-box p {
  color: #75658f;
  font-size: 0.9rem;
}

button {
  border: 1px solid #d8c4f0;
  border-radius: 999px;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  font-weight: 800;
  font-size: 0.8rem;
  padding: 0.52rem 0.86rem;
  cursor: pointer;
  line-height: 1.15;
  letter-spacing: 0.01em;
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost {
  border-color: #e4d5f6;
  background: #fff;
  color: #6f5c89;
}

.ghost:hover {
  background: #faf7fe;
}

.danger {
  border-color: #efbcc2;
  background: #ffe8eb;
  color: #a74553;
}

.danger:hover {
  background: #ffdfe4;
}

input,
select {
  width: 100%;
  border: 1px solid #decdf1;
  border-radius: 10px;
  padding: 0.46rem 0.62rem;
  background: #fff;
  color: #4c3a65;
  font-size: 0.87rem;
  line-height: 1.3;
  outline: none;
}

input[type='checkbox'] {
  width: auto;
  flex: 0 0 auto;
}

input:focus,
select:focus {
  border-color: #bf93eb;
  box-shadow: 0 0 0 3px rgba(191, 147, 235, 0.2);
}

@media (max-width: 700px) {
  .summary-strip {
    grid-template-columns: 1fr;
  }

  .page-intro {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-intro h1 {
    font-size: 1.45rem;
  }

  .meta,
  .compact,
  .compact span {
    white-space: normal;
  }

  .product-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .toolbar,
  .toolbar-actions,
  .card-actions,
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-strip {
    width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
</style>
