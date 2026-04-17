<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { logout, getUser } = useAuth()

const currentUser = computed(() => getUser())
const activeCategory = ref('ทั้งหมด')

// สินค้าตัวอย่าง
const products = ref([
  {
    id: 1,
    name: 'MOJO ขนมแลบลิ้นรสทูน่า',
    description: 'กลิ่มหวาน พอเพียงอยู่นี้จะให้รู้สึกสบายใจ',
    price: 125,
    image: '🐱',
    category: 'ทั้งหมด',
    stock: 24
  },
  {
    id: 2,
    name: 'บ้านเเมวซองนุ่ม',
    description: 'เหมาะสำหรับใช้งาน ถอดเก็บได้ง่าย',
    price: 820,
    image: '🎁',
    category: 'ทั้งหมด',
    stock: 8
  },
  {
    id: 3,
    name: 'เต็นล์แมวลายขนมหวาน',
    description: 'ผ้าพื้นฐานและทนทาน',
    price: 1190,
    image: '👕',
    category: 'เสื้อ/ปัน',
    stock: 5
  },
  {
    id: 4,
    name: 'ไม้ตกปลาแมวรุ้งพาสเทล',
    description: 'เอื้อยมิชแสตกหมดปจัดทำกระด่หระยัยกาน',
    price: 260,
    image: '🍦',
    category: 'อุปกรณ์อื่น',
    stock: 32
  },
  {
    id: 5,
    name: 'ชามอาหารสองชั้นเอียงน้อย',
    description: 'ช่วยลดการสำลัก ',
    price: 390,
    image: '🍜',
    category: 'ทั้งหมด',
    stock: 14
  },
  {
    id: 6,
    name: 'ทรายแมวกลิ้นมิวล์เชค',
    description: 'ดูดซับกลิ่นดี',
    price: 459,
    image: '📦',
    category: 'อุปกรณ์อื่น',
    stock: 19
  },
])

const categories = ['ทั้งหมด', 'ขนม', 'เตียง/บ้าน', 'ของเล่น', 'อุปกรณ์รูมมิ่ง']

const filteredProducts = computed(() => {
  if (activeCategory.value === 'ทั้งหมด') {
    return products.value
  }
  return products.value.filter(p => p.category === activeCategory.value)
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
          <a href="#" class="nav-link active">หน้าแรก</a>
          <a href="#" class="nav-link">พร้อมส่ง</a>
          <a href="#" class="nav-link">พรีออเดอร์</a>
          <a href="#" class="nav-link">ติดตามคำสั่งซื้อ</a>
        </nav>

        <div class="header-right">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="ค้นหา" class="search-input" />
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
        <h2>สินค้า</h2>
        <p>เลือกของน่ารักให้ทาสแมวและเจ้านายตัวฟู</p>
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

      <!-- PRODUCTS GRID -->
      <section class="products-grid">
        <div v-for="product in filteredProducts" :key="product.id" class="product-card">
          <div class="product-image">{{ product.image }}</div>
          
          <div class="product-info">
            <h3 class="product-name">{{ product.name }}</h3>
            <p class="product-description">{{ product.description }}</p>
            
            <div class="product-footer">
              <div class="price-section">
                <span class="currency">฿</span>
                <span class="price">{{ product.price }}</span>
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




