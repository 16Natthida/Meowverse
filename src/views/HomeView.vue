<template>
  <div class="home-container">
    <nav class="navbar">
      <div class="shop-info">
        <h1 class="shop-name">My Online Store</h1>
        <p class="shop-description">แหล่งรวมสินค้าคุณภาพ ส่งตรงถึงมือคุณ</p>
      </div>
      
      <div class="nav-actions">
        <button @click="handleLogin" class="login-btn">Login</button>
      </div>
    </nav>

    <main class="product-section">
      <h2>รายการสินค้า</h2>
      <div class="product-grid">
        <div v-for="product in products" :key="product.id" class="product-card">
          <img :src="product.image" :alt="product.name" class="product-image" />
          <div class="product-details">
            <h3>{{ product.name }}</h3>
            <p class="price">{{ product.price }} บาท</p>
            <button class="add-to-cart">ดูรายละเอียด</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { currentUser } = useAuth()

// ข้อมูลจำลองสำหรับรายการสินค้า
const products = ref([
  { id: 1, name: 'สินค้า A', price: 590, image: 'https://via.placeholder.com/150' },
  { id: 2, name: 'สินค้า B', price: 1200, image: 'https://via.placeholder.com/150' },
  { id: 3, name: 'สินค้า C', price: 350, image: 'https://via.placeholder.com/150' },
  { id: 4, name: 'สินค้า D', price: 890, image: 'https://via.placeholder.com/150' },
])

onMounted(() => {
  if (currentUser.value) {
    if (currentUser.value.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/userhome')
    }
  }
})

const handleLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
.home-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  font-family: 'Inter', sans-serif;
  color: #333;
}

/* Navbar Style */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 5%;
  background-color: #ffffff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.shop-name {
  margin: 0;
  font-size: 1.5rem;
  color: #42b883; /* Vue Green */
}

.shop-description {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.login-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.3s;
}

.login-btn:hover {
  background-color: #35495e;
}

/* Product Grid Style */
.product-section {
  padding: 2rem 5%;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.product-card {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s;
  background: white;
}

.product-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.product-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.product-details {
  padding: 15px;
  text-align: center;
}

.price {
  color: #e44d26;
  font-weight: bold;
  font-size: 1.1rem;
}

.add-to-cart {
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  border: 1px solid #42b883;
  background: transparent;
  color: #42b883;
  border-radius: 4px;
  cursor: pointer;
}

.add-to-cart:hover {
  background: #42b883;
  color: white;
}
</style>