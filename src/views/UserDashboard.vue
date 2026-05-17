<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { logout, getUser } = useAuth()

const currentUser = computed(() => getUser())
const activeSection = ref('home')
const activeCategory = ref('ทั้งหมด')
const products = ref([])
const preorderProducts = ref([])
const isLoadingPublic = ref(false)
const isLoadingPreorder = ref(false)
const error = ref('')
const searchQuery = ref('')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const isLoading = computed(() => isLoadingPublic.value || isLoadingPreorder.value)

const currentProducts = computed(() => {
  return activeSection.value === 'preorder' ? preorderProducts.value : products.value
})

const categories = computed(() => {
  const categorySet = new Set(currentProducts.value.map((product) => product.categoryName || 'อื่นๆ'))
  return ['ทั้งหมด', ...Array.from(categorySet)]
})

const filteredProducts = computed(() => {
  let list = currentProducts.value

  if (activeSection.value === 'ready') {
    list = list.filter((p) => p.readyToShipEnabled)
  }

  if (activeCategory.value !== 'ทั้งหมด') {
    list = list.filter((p) => p.categoryName === activeCategory.value)
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.categoryName || '').toLowerCase().includes(query),
    )
  }

  return list
})

const groupedProducts = computed(() => {
  const groups = {}
  filteredProducts.value.forEach((product) => {
    const category = product.categoryName || 'อื่นๆ'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(product)
  })
  return groups
})

const sectionTitle = computed(() => {
  switch (activeSection.value) {
    case 'preorder':
      return 'สินค้าพรีออเดอร์'
    case 'ready':
      return 'สินค้าพร้อมส่ง'
    case 'orders':
      return 'ติดตามคำสั่งซื้อ'
    default:
      return 'สินค้า'
  }
})

const sectionDescription = computed(() => {
  switch (activeSection.value) {
    case 'preorder':
      return 'สินค้าพรีออเดอร์จากรอบนำเข้าที่เปิดอยู่และจัดเรียงตามหมวดหมู่'
    case 'ready':
      return 'เลือกสินค้าพร้อมส่งทันที'
    case 'orders':
      return 'ตรวจสอบสถานะคำสั่งซื้อของคุณ'
    default:
      return 'เลือกของน่ารักให้ทาสแมวและเจ้านายตัวฟู'
  }
})

async function fetchProducts() {
  isLoadingPublic.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/products/public`)
    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดสินค้าได้')
    }

    products.value = await response.json()
  } catch (fetchError) {
    error.value = fetchError.message || 'เกิดข้อผิดพลาดเมื่อโหลดสินค้า'
  } finally {
    isLoadingPublic.value = false
  }
}

async function fetchPreorderProducts() {
  isLoadingPreorder.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/products/preorder`)
    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดสินค้าพรีออเดอร์ได้')
    }

    preorderProducts.value = await response.json()
  } catch (fetchError) {
    error.value = fetchError.message || 'เกิดข้อผิดพลาดเมื่อโหลดสินค้าพรีออเดอร์'
  } finally {
    isLoadingPreorder.value = false
  }
}

onMounted(() => {
  fetchProducts()
  fetchPreorderProducts()
})

watch(activeSection, (newSection) => {
  activeCategory.value = 'ทั้งหมด'
  if (newSection === 'preorder') {
    fetchPreorderProducts()
  }
})

function handleLogout() {
  logout()
  router.push('/login')
}

function addToCart(product) {
  alert(`เพิ่ม "${product.name}" ลงตะกร้าแล้ว!`)
}
</script>

<template>
  <div class="user-dashboard">
    <!-- HEADER -->
    <header class="dashboard-header">
      <div class="header-container">
        <div class="logo-section">
          <div class="logo-avatar">🐱</div>
          <h1 class="logo-text">Meowverse</h1>
        </div>

        <nav class="header-nav">
          <a
            href="#"
            class="nav-link"
            :class="{ active: activeSection === 'home' }"
            @click.prevent="activeSection = 'home'"
          >
            หน้าแรก
          </a>
          <a
            href="#"
            class="nav-link"
            :class="{ active: activeSection === 'ready' }"
            @click.prevent="activeSection = 'ready'"
          >
            พร้อมส่ง
          </a>
          <a
            href="#"
            class="nav-link"
            :class="{ active: activeSection === 'preorder' }"
            @click.prevent="activeSection = 'preorder'"
          >
            พรีออเดอร์
          </a>
          <a
            href="#"
            class="nav-link"
            :class="{ active: activeSection === 'orders' }"
            @click.prevent="activeSection = 'orders'"
          >
            ติดตามคำสั่งซื้อ
          </a>
        </nav>

        <div class="header-right">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="ค้นหา"
              class="search-input"
            />
          </div>
          <button class="btn-cart">🛒 ตะกร้า</button>
          <div class="user-info">
            <span class="user-icon">👤</span>
            <span class="username">{{ currentUser?.username }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- MAIN CONTENT -->
    <main class="dashboard-main">
      <!-- TITLE SECTION -->
      <section class="title-section">
        <h2>{{ sectionTitle }}</h2>
        <p>{{ sectionDescription }}</p>
      </section>

      <!-- CATEGORY TABS -->
      <div class="category-tabs">
        <button
          v-for="category in categories"
          :key="category"
          :class="['tab-btn', { active: activeCategory === category }]"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <div class="section-status">
        <p v-if="isLoading">กำลังโหลดสินค้า...</p>
        <p v-else-if="error" class="section-error">{{ error }}</p>
        <p v-else-if="filteredProducts.length === 0">ไม่มีสินค้าที่ตรงกับเงื่อนไขในขณะนี้</p>
      </div>

      <!-- PRODUCTS GRID -->
      <section v-if="activeSection === 'preorder'" class="category-groups">
        <div v-for="(items, category) in groupedProducts" :key="category" class="category-group">
          <h3 class="category-heading">{{ category }}</h3>
          <div class="products-grid">
            <div v-for="product in items" :key="product.id" class="product-card">
              <div class="product-image">
                <img v-if="product.imageUrls && product.imageUrls[0]" :src="product.imageUrls[0]" :alt="product.name" />
                <div v-else class="product-placeholder">🐾</div>
              </div>

              <div class="product-info">
                <div class="product-labels">
                  <span v-if="product.preorderEnabled" class="product-badge preorder">พรีออเดอร์</span>
                  <span v-if="product.readyToShipEnabled" class="product-badge ready">พร้อมส่ง</span>
                </div>
                <h3 class="product-name">{{ product.name }}</h3>
                <p class="product-description">{{ product.categoryName || 'สินค้าทั่วไป' }}</p>

                <div class="product-footer">
                  <div class="price-section">
                    <span class="currency">฿</span>
                    <span class="price">{{ product.basePrice }}</span>
                  </div>
                  <span class="stock">สต็อก: {{ product.stock }} ชิ้น</span>
                </div>

                <button class="btn-order" @click="addToCart(product)">หยิบใส่ตะกร้า</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section v-else class="products-grid">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          class="product-card"
        >
          <div class="product-image">
            <img v-if="product.imageUrls && product.imageUrls[0]" :src="product.imageUrls[0]" :alt="product.name" />
            <div v-else class="product-placeholder">🐾</div>
          </div>

          <div class="product-info">
            <div class="product-labels">
              <span v-if="product.preorderEnabled" class="product-badge preorder">พรีออเดอร์</span>
              <span v-if="product.readyToShipEnabled" class="product-badge ready">พร้อมส่ง</span>
            </div>
            <h3 class="product-name">{{ product.name }}</h3>
            <p class="product-description">{{ product.categoryName || 'สินค้าทั่วไป' }}</p>

            <div class="product-footer">
              <div class="price-section">
                <span class="currency">฿</span>
                <span class="price">{{ product.basePrice }}</span>
              </div>
              <span class="stock">สต็อก: {{ product.stock }} ชิ้น</span>
            </div>

            <button class="btn-order" @click="addToCart(product)">หยิบใส่ตะกร้า</button>
          </div>
        </div>
      </section>
    </main>

    <!-- LOGOUT BUTTON (Floating) -->
    <button class="btn-logout-floating" @click="handleLogout" title="ออกจากระบบ">
      🚪
    </button>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.user-dashboard {
  min-height: 100vh;
  background: linear-gradient(180deg, #fce4ec 0%, #f3e5f5 100%);
  font-family: 'Kanit', sans-serif;
}

/* HEADER */
.dashboard-header {
  background: white;
  border-bottom: 1px solid #f0f0f0;
  padding: 1rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.header-container {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2rem;
  gap: 2rem;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: max-content;
}

.logo-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c9a6ff, #ffb4d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.header-nav {
  display: flex;
  gap: 2rem;
  flex: 1;
}

.nav-link {
  text-decoration: none;
  color: #999;
  font-size: 0.9rem;
  font-weight: 500;
  padding-bottom: 0.5rem;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
}

.nav-link:hover,
.nav-link.active {
  color: #c9a6ff;
  border-bottom-color: #c9a6ff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-width: max-content;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  font-size: 0.9rem;
  color: #999;
  pointer-events: none;
}

.search-input {
  padding: 0.5rem 0.5rem 0.5rem 2rem;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fafafa;
  font-family: 'Kanit', sans-serif;
  width: 180px;
  font-size: 0.85rem;
  color: #666;
  transition: all 0.3s;
}

.search-input:focus {
  outline: none;
  border-color: #c9a6ff;
  background: white;
  box-shadow: 0 0 0 3px rgba(201, 166, 255, 0.1);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-left: 1rem;
  border-left: 1px solid #f0f0f0;
}

.user-icon {
  font-size: 1.2rem;
}

.username {
  font-weight: 600;
  color: #666;
  font-size: 0.9rem;
}

.btn-cart {
  padding: 0.6rem 1rem;
  background: #c9a6ff;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Kanit', sans-serif;
  font-size: 0.85rem;
  transition: all 0.3s;
}

.btn-cart:hover {
  background: #b890ff;
  transform: scale(1.05);
}

/* MAIN CONTENT */
.dashboard-main {
  width: 100%;
  padding: 3rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title-section {
  margin-bottom: 2rem;
  text-align: left;
  width: 100%;
  max-width: 1400px;
}

.title-section h2 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 0.5rem;
  font-weight: 700;
}

.title-section p {
  color: #999;
  font-size: 0.95rem;
}

/* CATEGORY TABS */
.category-tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 2.5rem;
  flex-wrap: wrap;
  justify-content: flex-start;
  width: 100%;
  max-width: 1400px;
}

.category-group {
  margin-bottom: 2.5rem;
}

.category-heading {
  font-size: 1.25rem;
  color: #5d2c7f;
  margin-bottom: 1rem;
}

.tab-btn {
  padding: 0.65rem 1.3rem;
  border: none;
  background: white;
  border-bottom: 3px solid transparent;
  color: #999;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Kanit', sans-serif;
  font-size: 0.9rem;
  transition: all 0.3s;
  border-radius: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.tab-btn:hover {
  color: #c9a6ff;
}

.tab-btn.active {
  color: #c9a6ff;
  border-bottom-color: #c9a6ff;
  background: white;
  box-shadow: none;
}

/* PRODUCTS GRID */
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
  width: 100%;
  max-width: 1400px;
}

.product-card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.product-image {
  width: 100%;
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, #f8f5f2, #ede8e1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3.5rem;
  overflow: hidden;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.product-labels {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.product-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.product-badge.preorder {
  background: #ffe0b2;
  color: #9c5c00;
}

.product-badge.ready {
  background: #c8e6c9;
  color: #2e7d32;
}

.section-status {
  max-width: 1400px;
  margin-bottom: 1.5rem;
  color: #666;
  font-size: 0.95rem;
}

.section-error {
  color: #d32f2f;
}

.product-info {
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.product-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.4rem;
  line-height: 1.3;
  min-height: 2.5em;
}

.product-description {
  font-size: 0.8rem;
  color: #999;
  margin-bottom: 0.8rem;
  line-height: 1.3;
  flex: 1;
}

.product-footer {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
  flex-direction: column;
}

.price-section {
  display: flex;
  align-items: baseline;
  gap: 0.15rem;
}

.currency {
  font-size: 0.85rem;
  color: #999;
}

.price {
  font-size: 1.4rem;
  font-weight: 700;
  color: #333;
}

.stock {
  font-size: 0.75rem;
  color: #bbb;
}

.btn-order {
  width: 100%;
  background: #c9a6ff;
  color: white;
  border: none;
  padding: 0.65rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Kanit', sans-serif;
  font-size: 0.85rem;
  transition: all 0.3s;
}

.btn-order:hover {
  background: #b890ff;
  transform: scale(1.02);
}

/* FLOATING LOGOUT BUTTON */
.btn-logout-floating {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b9d, #c44569);
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 107, 157, 0.3);
  transition: all 0.3s;
  z-index: 50;
}

.btn-logout-floating:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(255, 107, 157, 0.4);
}

/* RESPONSIVE */
@media (max-width: 1024px) {
  .header-container {
    padding: 0 1rem;
    gap: 1rem;
  }

  .header-nav {
    gap: 1rem;
    font-size: 0.85rem;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
}

@media (max-width: 768px) {
  .logo-text {
    display: none;
  }

  .header-nav {
    display: none;
  }

  .search-input {
    width: 140px;
  }

  .dashboard-main {
    padding: 1.5rem 1rem;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.75rem;
  }

  .tab-btn {
    padding: 0.5rem 0.9rem;
    font-size: 0.8rem;
  }

  .product-name {
    font-size: 0.85rem;
  }

  .price {
    font-size: 1.1rem;
  }
}
</style>




