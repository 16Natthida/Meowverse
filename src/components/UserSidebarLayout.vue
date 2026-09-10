<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { getUser, logout } = useAuth()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

const sidebarOpen = ref(false)
const searchQuery = ref('')
const searchOpen = ref(false)
const logoImage = ref('')
const cartCount = ref(0)
const currentUser = computed(() => getUser() || {})

const shopLinks = [
  { label: 'หน้าแรก', path: '/dashboard', icon: 'home' },
  { label: 'พร้อมส่ง', path: '/products/ready-to-ship', icon: 'box' },
  { label: 'พรีออเดอร์', path: '/products/preorder', icon: 'clock' },
  { label: 'รายการออเดอร์', path: '/order-list', icon: 'list' },
]

const accountLinks = [
  { label: 'ตะกร้าสินค้า', path: '/cart', icon: 'cart' },
  { label: 'บัญชีของฉัน', path: '/profile', icon: 'user' },
]

function resolveImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) return url
  return `/${url}`
}

async function loadLogo() {
  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/logo`)
    if (!response.ok) return
    const data = await response.json()
    logoImage.value = resolveImageUrl(data.imageUrl)
  } catch {
    // The cat fallback is used when the logo setting is unavailable.
  }
}

async function loadCartCount() {
  const user = currentUser.value
  const userId = user?.id ?? user?.user_id

  if (!userId) {
    cartCount.value = 0
    return
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cart?user_id=${userId}`)
    if (!response.ok) return

    const data = await response.json()
    const items = Array.isArray(data) ? data : (data.items ?? data.data ?? [])
    cartCount.value = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0)
  } catch {
    // Keep the previous count if the cart API is temporarily unavailable.
  }
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }

  router.replace('/dashboard')
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
}

function isActive(path) {
  if (path === '/dashboard') return route.path === '/dashboard'
  if (path === '/products/ready-to-ship') return route.path === path
  if (path === '/products/preorder') return route.path === path
  return route.path === path || route.path.startsWith(`${path}/`)
}

function emitSearch() {
  window.dispatchEvent(new CustomEvent('meowverse:user-search', { detail: searchQuery.value }))
}

function handleLogout() {
  logout()
  closeSidebar()
  router.push('/login')
}

watch(
  () => route.fullPath,
  () => {
    closeSidebar()
    loadCartCount()
  },
)

function handleCartUpdated() {
  loadCartCount()
}

onMounted(() => {
  loadLogo()
  loadCartCount()
  window.addEventListener('meowverse:cart-updated', handleCartUpdated)
})

onBeforeUnmount(() => {
  window.removeEventListener('meowverse:cart-updated', handleCartUpdated)
})
</script>

<template>
  <div class="user-shell">
    <div v-if="sidebarOpen" class="user-shell__backdrop" @click="closeSidebar"></div>

    <aside class="user-shell__sidebar" :class="{ 'user-shell__sidebar--open': sidebarOpen }">
      <div class="user-shell__sidebar-inner">
        <div class="user-shell__brand">
          <div class="user-shell__brand-avatar">
            <img v-if="logoImage" :src="logoImage" alt="Meowverse" />
            <span v-else>🐱</span>
          </div>
          <div class="user-shell__brand-copy">
            <strong>Meowverse</strong>
            <small>ร้านค้าของเรา</small>
          </div>
          <button class="user-shell__close" type="button" aria-label="ปิดเมนู" @click="closeSidebar">×</button>
        </div>

        <nav class="user-shell__nav" aria-label="เมนูร้านค้า">
          <p class="user-shell__section-title">เมนูหลัก</p>
          <RouterLink
            v-for="item in shopLinks"
            :key="item.path"
            :to="item.path"
            class="user-shell__link"
            :class="{ 'user-shell__link--active': isActive(item.path) }"
          >
            <span class="user-shell__icon" aria-hidden="true">
              <svg v-if="item.icon === 'home'" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9.5 20v-5h5v5"/></svg>
              <svg v-else-if="item.icon === 'box'" viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.5 7.5 4 7.5-4M12 12v9"/></svg>
              <svg v-else-if="item.icon === 'clock'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M6 4h12M6 8h12M6 12h8M6 16h12M6 20h8"/><path d="M3 4h.01M3 8h.01M3 12h.01M3 16h.01M3 20h.01"/></svg>
            </span>
            <span class="user-shell__label">{{ item.label }}</span>
          </RouterLink>

          <p class="user-shell__section-title user-shell__section-title--account">บัญชีของฉัน</p>
          <RouterLink
            v-for="item in accountLinks"
            :key="item.path"
            :to="item.path"
            class="user-shell__link"
            :class="{ 'user-shell__link--active': isActive(item.path) }"
          >
            <span class="user-shell__icon" aria-hidden="true">
              <svg v-if="item.icon === 'cart'" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h3l2.2 11h11.2L21 7H6"/></svg>
              <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
            </span>
            <span class="user-shell__label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="user-shell__sidebar-footer">
          <button type="button" class="user-shell__logout" @click="handleLogout">
            <span class="user-shell__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg></span>
            <span class="user-shell__label">ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </aside>

    <section class="user-shell__main">
      <header class="user-shell__topbar">
        <button type="button" class="user-shell__back" aria-label="ย้อนกลับ" @click="goBack">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>
        </button>
        <button
          type="button"
          class="user-shell__menu-toggle"
          :class="{ 'user-shell__menu-toggle--open': sidebarOpen }"
          aria-label="เปิดเมนู"
          @click="toggleSidebar"
        >
          <span></span><span></span><span></span>
        </button>
        <div class="user-shell__mobile-brand">
          <div class="user-shell__brand-avatar">
            <img v-if="logoImage" :src="logoImage" alt="" />
            <span v-else>🐱</span>
          </div>
          <strong>Meowverse</strong>
        </div>
        <label class="user-shell__search" :class="{ 'user-shell__search--open': searchOpen }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
          <input v-model="searchQuery" type="search" placeholder="ค้นหาสินค้า" @input="emitSearch" />
        </label>
        <button type="button" class="user-shell__search-toggle" aria-label="ค้นหาสินค้า" @click="toggleSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        </button>
        <RouterLink to="/cart" class="user-shell__top-action" aria-label="ตะกร้าสินค้า">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h3l2.2 11h11.2L21 7H6"/></svg>
          <span v-if="cartCount > 0" class="user-shell__cart-badge">{{ cartCount > 99 ? '99+' : cartCount }}</span>
        </RouterLink>
        <RouterLink to="/profile" class="user-shell__profile">
          <span class="user-shell__profile-avatar">{{ String(currentUser.username || 'U').slice(0, 1).toUpperCase() }}</span>
          <span class="user-shell__profile-name">{{ currentUser.username || 'ผู้ใช้' }}</span>
        </RouterLink>
      </header>

      <main class="user-shell__content">
        <slot />
      </main>
    </section>
  </div>
</template>

<style scoped>
.user-shell {
  --user-sidebar-width: 258px;
  min-height: 100vh;
  background: #f8f5ff;
  color: #3f2f5d;
}

.user-shell__backdrop {
  display: none;
}

.user-shell__sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 1200;
  width: var(--user-sidebar-width);
  background: rgba(255, 255, 255, 0.96);
  border-right: 1px solid #eadff5;
  box-shadow: 10px 0 30px rgba(76, 48, 103, 0.08);
}

.user-shell__sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.1rem 0.85rem;
}

.user-shell__brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.3rem 0.5rem 1.1rem;
  border-bottom: 1px dashed #eadff5;
}

.user-shell__brand-avatar,
.user-shell__profile-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #f5ecff;
  color: #7549a6;
  font-size: 1.15rem;
  overflow: hidden;
}

.user-shell__brand-avatar {
  width: 42px;
  height: 42px;
  border: 2px solid #c995ef;
}

.user-shell__brand-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-shell__brand-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.user-shell__brand-copy strong,
.user-shell__mobile-brand strong {
  color: #4d3475;
  font-size: 1.05rem;
}

.user-shell__brand-copy small {
  color: #9a83b4;
  font-size: 0.7rem;
}

.user-shell__close {
  display: none;
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #7d5a9e;
  font-size: 1.8rem;
  line-height: 1;
}

.user-shell__nav {
  flex: 1;
  overflow-y: auto;
  padding-top: 1.2rem;
}

.user-shell__section-title {
  margin: 0.4rem 0.7rem 0.55rem;
  color: #ac95c7;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.user-shell__section-title--account {
  margin-top: 1.5rem;
}

.user-shell__link,
.user-shell__logout {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 44px;
  padding: 0.7rem 0.75rem;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #695584;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.user-shell__link:hover,
.user-shell__logout:hover,
.user-shell__link--active {
  background: #f2e8ff;
  color: #7347a6;
}

.user-shell__icon {
  display: grid;
  place-items: center;
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
}

.user-shell__icon svg,
.user-shell__top-action svg,
.user-shell__search svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.user-shell__sidebar-footer {
  padding-top: 0.8rem;
  border-top: 1px dashed #eadff5;
}

.user-shell__logout {
  color: #dc5d6d;
}

.user-shell__main {
  min-width: 0;
  min-height: 100vh;
  margin-left: var(--user-sidebar-width);
}

.user-shell__topbar {
  position: sticky;
  top: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 68px;
  padding: 0.75rem 1.35rem;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid #eadff5;
  backdrop-filter: blur(12px);
}

.user-shell__menu-toggle,
.user-shell__back,
.user-shell__mobile-brand,
.user-shell__search-toggle {
  display: none;
}

.user-shell__back {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid #e2d2f3;
  border-radius: 12px;
  color: #7549a6;
  background: #fff;
  cursor: pointer;
}

.user-shell__back svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.user-shell__search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: min(360px, 100%);
  min-height: 40px;
  padding: 0 0.8rem;
  border: 1px solid #e2d2f3;
  border-radius: 999px;
  color: #8f78aa;
  background: #fff;
}

.user-shell__search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #4d3475;
  background: transparent;
  font: inherit;
}

.user-shell__search-toggle {
  border: 0;
  color: #7549a6;
  background: transparent;
}

.user-shell__search-toggle svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.user-shell__top-action {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-left: auto;
  border: 1px solid #dfcef2;
  border-radius: 50%;
  color: #7549a6;
  background: #faf6ff;
}

.user-shell__cart-badge {
  position: absolute;
  top: -0.28rem;
  right: -0.28rem;
  display: grid;
  place-items: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.22rem;
  border: 2px solid #fff;
  border-radius: 999px;
  color: #fff;
  background: #e76b93;
  font-size: 0.62rem;
  font-weight: 900;
  line-height: 1;
}

.user-shell__profile {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: #5e4679;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.user-shell__profile-avatar {
  width: 34px;
  height: 34px;
  font-size: 0.82rem;
}

.user-shell__content {
  min-width: 0;
}

.user-shell__content :deep(.navbar) {
  display: none !important;
}

.user-shell__content :deep(.shop),
.user-shell__content :deep(.order-list-page),
.user-shell__content :deep(.cart-page),
.user-shell__content :deep(.profile-page),
.user-shell__content :deep(.order-summary-page) {
  min-height: calc(100vh - 68px);
}

@media (max-width: 1100px) and (min-width: 769px) {
  .user-shell { --user-sidebar-width: 76px; }
  .user-shell__sidebar-inner { padding-inline: 0.55rem; }
  .user-shell__brand { justify-content: center; padding-inline: 0; }
  .user-shell__brand-copy,
  .user-shell__section-title,
  .user-shell__label { display: none; }
  .user-shell__link,
  .user-shell__logout { justify-content: center; padding-inline: 0; }
}

@media (max-width: 768px) {
  .user-shell__sidebar {
    width: min(286px, 88vw);
    transform: translateX(-105%);
    transition: transform 0.25s ease;
  }

  .user-shell__sidebar--open { transform: translateX(0); }

  .user-shell__backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: block;
    background: rgba(48, 31, 64, 0.38);
  }

  .user-shell__close { display: block; }
  .user-shell__main { margin-left: 0; }

  .user-shell__topbar {
    display: grid;
    grid-template-columns: 40px 42px minmax(0, 1fr) 38px 38px 34px;
    gap: 0.55rem;
    min-height: 64px;
    padding: 0.65rem 0.8rem;
  }

  .user-shell__menu-toggle {
    display: flex;
    grid-column: 2;
    grid-row: 1;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    width: 42px;
    height: 42px;
    border: 1px solid #e2d2f3;
    border-radius: 12px;
    background: #fff;
  }

  .user-shell__menu-toggle span {
    width: 20px;
    height: 2px;
    border-radius: 2px;
    background: #a66de6;
  }

  .user-shell__mobile-brand {
    display: flex;
    grid-column: 3;
    grid-row: 1;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .user-shell__mobile-brand .user-shell__brand-avatar {
    width: 34px;
    height: 34px;
  }

  .user-shell__search { display: none; }
  .user-shell__search-toggle { display: grid; place-items: center; }
  .user-shell__search.user-shell__search--open {
    display: flex;
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
  }
  .user-shell__top-action { margin-left: 0; }
  .user-shell__profile-name { display: none; }
}

@media (max-width: 420px) {
  .user-shell__topbar { grid-template-columns: 36px 40px minmax(0, 1fr) 34px 36px 34px; padding-inline: 0.55rem; }
  .user-shell__mobile-brand strong { font-size: 0.95rem; }
  .user-shell__top-action { width: 36px; height: 36px; }
  .user-shell__profile-avatar { width: 32px; height: 32px; }
}
</style>
