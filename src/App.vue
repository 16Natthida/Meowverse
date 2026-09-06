<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const { logout } = useAuth()
const PROFILE_STORAGE_KEY = 'meowverse-admin-profile'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const defaultLogoImageUrl = ''
const logoImage = ref('')

const profileEditorOpen = ref(false)
const avatarInputRef = ref(null)

const profile = reactive({
  name: 'จีภัท',
  role: 'ผู้ดูแลระบบ',
  avatar: '',
})

const profileForm = reactive({
  name: '',
  role: '',
  avatar: '',
})

const pageTitle = computed(() => {
  if (route.path === '/admin/home') {
    return 'แดชบอร์ด'
  }

  if (route.path === '/admin/products') {
    return 'จัดการสต็อกสินค้า'
  }

  if (route.path === '/admin/sales/ready-to-ship') {
    return 'รายการยอดขายพร้อมส่ง'
  }

  if (route.path === '/admin/sales/preorder') {
    return 'รายการยอดขายพรีออเดอร์'
  }

  if (route.path === '/admin/sales' || route.path === '/admin/orders') {
    return 'รายการยอดขาย'
  }

  if (route.path === '/admin/preorder-rounds') {
    return 'จัดการรอบพรีออเดอร์'
  }

  if (route.path === '/admin/preorder-statistics') {
    return 'สถิติพรีออเดอร์ย้อนหลัง'
  }

  if (route.path === '/admin/postpones') {
    return 'คำขอเลื่อนการชำระเงิน'
  }

  if (route.path === '/admin/slips') {
    return 'จัดการสลิปการชำระเงิน'
  }

  if (route.path === '/admin/inventory-intake') {
    return 'รับสินค้าเข้า'
  }

  if (route.path === '/admin/shipping') {
    return 'รายการจัดส่ง'
  }

  return 'แดชบอร์ด'
})

const isStandaloneRoute = computed(() => route.path === '/login')
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

// ── เมนู "รายการยอดขาย" แบบขยาย/ย่อ แยกย่อยเป็นทั้งหมด / พร้อมส่ง / พรีออเดอร์ ──
const isSalesRoute = computed(
  () => route.path.startsWith('/admin/sales') || route.path === '/admin/orders',
)
const salesMenuOpen = ref(isSalesRoute.value)
watch(isSalesRoute, (active) => {
  if (active) salesMenuOpen.value = true
})

// ── MOBILE SIDEBAR DRAWER ──
const sidebarOpen = ref(false)
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
function closeSidebar() {
  sidebarOpen.value = false
}
watch(
  () => route.path,
  () => closeSidebar(),
)

const profileInitials = computed(() => {
  const trimmedName = profile.name.trim()
  if (!trimmedName) {
    return 'A'
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return trimmedName.slice(0, 2).toUpperCase()
})

function syncFormFromProfile() {
  profileForm.name = profile.name
  profileForm.role = profile.role
  profileForm.avatar = profile.avatar
}

function persistProfile() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

function loadProfile() {
  if (typeof window === 'undefined') {
    return
  }

  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) {
    syncFormFromProfile()
    return
  }

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.name === 'string') {
      profile.name = parsed.name || profile.name
    }
    if (typeof parsed?.role === 'string') {
      profile.role = parsed.role || profile.role
    }
    if (typeof parsed?.avatar === 'string') {
      profile.avatar = parsed.avatar
    }
  } catch {
    // Ignore invalid localStorage data and fallback to defaults.
  }

  syncFormFromProfile()
}

function resolveImageUrl(value, fallback = '') {
  const url = String(value || '').trim()
  if (!url) {
    return fallback
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

async function fetchLogoSettings() {
  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/logo`)
    if (!response.ok) {
      return
    }

    const data = await response.json()
    const imageUrl = resolveImageUrl(data.imageUrl, defaultLogoImageUrl)
    logoImage.value = appendCacheBuster(imageUrl)
  } catch (error) {
    console.error('fetchLogoSettings:', error)
  }
}

function handleLogoUpdated() {
  fetchLogoSettings()
}

function toggleProfileEditor() {
  profileEditorOpen.value = !profileEditorOpen.value
  if (profileEditorOpen.value) {
    syncFormFromProfile()
  }
}

function closeProfileEditor() {
  profileEditorOpen.value = false
}

function openAvatarPicker() {
  avatarInputRef.value?.click()
}

function handleAvatarChange(event) {
  const file = event.target.files?.[0]
  if (!file) {
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    window.alert('รูปโปรไฟล์ต้องไม่เกิน 2MB')
    event.target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    profileForm.avatar = String(reader.result || '')
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

function clearAvatar() {
  profileForm.avatar = ''
}

function saveProfile() {
  const safeName = profileForm.name.trim()
  const safeRole = profileForm.role.trim()

  if (!safeName || !safeRole) {
    window.alert('กรอกชื่อและตำแหน่งแอดมินให้ครบก่อนบันทึก')
    return
  }

  profile.name = safeName
  profile.role = safeRole
  profile.avatar = profileForm.avatar
  persistProfile()
  closeProfileEditor()
}

function handleAdminLogout() {
  logout()
  closeProfileEditor()
  router.push('/login')
}

function goToWebsite() {
  router.push('/dashboard')
}

onMounted(() => {
  loadProfile()
  fetchLogoSettings()
  window.addEventListener('meowverse:logo-updated', handleLogoUpdated)
})

onUnmounted(() => {
  window.removeEventListener('meowverse:logo-updated', handleLogoUpdated)
})
</script>

<template>
  <RouterView v-if="isStandaloneRoute || !isAdminRoute" />

  <div v-else class="app-layout">
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
    <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }">
      <div class="sidebar-inner">
        <div class="brand-box">
          <div class="brand-avatar" aria-hidden="true">
            <img
              v-if="logoImage"
              :src="resolveImageUrl(logoImage, defaultLogoImageUrl)"
              :alt="'โลโก้ ' + 'Meowverse'"
            />
            <span v-else>🐱</span>
          </div>
          <div>
            <p class="brand-name">Meowverse</p>
            <p class="brand-subtitle">ร้านสัตว์เลี้ยง</p>
          </div>
        </div>

        <div class="menu-block">
          <p class="menu-title"><span class="menu-title__paw"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h6l2 2h8v12H4z"/></svg></span>เมนูหลัก</p>
          <nav class="menu-list" aria-label="เมนูหลัก">
            <RouterLink to="/admin/home">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10"/></svg></span>
              <span class="menu-label">แดชบอร์ด</span>
            </RouterLink>

            <div class="menu-group" :class="{ 'menu-group--active': isSalesRoute }">
              <button
                type="button"
                class="menu-group__trigger"
                :class="{ 'menu-group__trigger--active': isSalesRoute }"
                @click="salesMenuOpen = !salesMenuOpen"
                :aria-expanded="salesMenuOpen"
              >
                <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></span>
                <span class="menu-group__label">รายการยอดขาย</span>
                <span class="menu-group__chevron" :class="{ 'menu-group__chevron--open': salesMenuOpen }">
                  ⌄
                </span>
              </button>
              <div class="menu-sub" v-show="salesMenuOpen">
                <RouterLink to="/admin/sales" exact-active-class="menu-sub__link--active" class="menu-sub__link">
                  <span class="menu-sub__dot menu-sub__dot--all"></span>
                  ภาพรวมทั้งหมด
                </RouterLink>
                <RouterLink
                  to="/admin/sales/ready-to-ship"
                  exact-active-class="menu-sub__link--active"
                  class="menu-sub__link"
                >
                  <span class="menu-sub__dot menu-sub__dot--ready"></span>
                  รายการสินค้าพร้อมส่ง
                </RouterLink>
                <RouterLink
                  to="/admin/sales/preorder"
                  exact-active-class="menu-sub__link--active"
                  class="menu-sub__link"
                >
                  <span class="menu-sub__dot menu-sub__dot--pre"></span>
                  รายการสินค้าพรีออเดอร์
                </RouterLink>
              </div>
            </div>

            <RouterLink to="/admin/products">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73V8z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg></span>
              <span class="menu-label">สินค้า</span>
            </RouterLink>
            <RouterLink
              to="/admin/preorder-rounds"
              title="จัดการรอบพรีออเดอร์"
              aria-label="จัดการรอบพรีออเดอร์"
            >
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></span>
              <span class="menu-label">จัดการรอบพรีออเดอร์</span>
            </RouterLink>
            <RouterLink to="/admin/slips">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.41 17.41a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49"/></svg></span>
              <span class="menu-label">จัดการสลิป</span>
            </RouterLink>
            <RouterLink to="/admin/preorder-statistics">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></span>
              <span class="menu-label">สถิติพรีออเดอร์ย้อนหลัง</span>
            </RouterLink>
            <RouterLink to="/admin/postpones">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12"/><path d="M6 21h12"/><path d="M7 3c0 4 3 6 5 8-2 2-5 4-5 8"/><path d="M17 3c0 4-3 6-5 8 2 2 5 4 5 8"/></svg></span>
              <span class="menu-label">คำขอเลื่อนการชำระเงิน</span>
            </RouterLink>
            <RouterLink to="/admin/inventory-intake">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></span>
              <span class="menu-label">รับสินค้าเข้า</span>
            </RouterLink>
            <RouterLink to="/admin/missing-items">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>
              <span class="menu-label">สินค้าตกหล่น / ขาด</span>
            </RouterLink>
            <RouterLink to="/admin/import-fee">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.8c0-1.5-1.4-2.3-3-2.3s-3 .8-3 2.3 1.4 1.9 3 2.3 3 .8 3 2.3-1.4 2.4-3 2.4-3-1-3-2.4"/></svg></span>
              <span class="menu-label">กรอกค่านำเข้า</span>
            </RouterLink>
            <RouterLink to="/admin/shipping">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></span>
              <span class="menu-label">รายการจัดส่ง</span>
            </RouterLink>
            <RouterLink to="/admin/settings">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
              <span class="menu-label">ตั้งค่าระบบ</span>
            </RouterLink>
            <RouterLink to="/admin/qrcodes">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span>
              <span class="menu-label">ตั้งค่า QR Payment</span>
            </RouterLink>
            <RouterLink to="/admin/users">
              <span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
              <span class="menu-label">เพิ่ม User</span>
            </RouterLink>
          </nav>
        </div>

        <div class="menu-block menu-block--soft">
          <p class="menu-title"><span class="menu-title__paw"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h6l2 2h8v12H4z"/></svg></span>เครื่องมือ</p>
          <nav class="menu-list" aria-label="เครื่องมือ">
            <span><span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 6 13.5 15.5 8.5 10.5 1 18"/><path d="M17 6h6v6"/></svg></span><span class="menu-label">รายงาน</span></span>
            <span><span class="menu-icon"><svg class="menu-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg></span><span class="menu-label">วิธีใช้งาน</span></span>
          </nav>
        </div>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar-main">
          <button
            type="button"
            class="sidebar-toggle"
            aria-label="เปิดเมนู"
            @click="toggleSidebar"
          >
            <span></span><span></span><span></span>
          </button>
          <label class="top-search" aria-label="ค้นหาสินค้า">
            <input placeholder="ค้นหาสินค้า" type="text" />
          </label>
        </div>

        <div class="topbar-right">
          <button class="notify" type="button" @click="goToWebsite">หน้าเว็บไซต์หลัก</button>
          <button class="notify logout-btn" type="button" @click="handleAdminLogout">
            ออกจากระบบ
          </button>
          <button class="profile-chip" type="button" @click="toggleProfileEditor">
            <div class="profile-pic" aria-hidden="true">
              <img v-if="profile.avatar" :src="profile.avatar" alt="รูปโปรไฟล์ผู้ดูแลระบบ" />
              <span v-else>{{ profileInitials }}</span>
            </div>
            <div>
              <p class="profile-name">{{ profile.name }}</p>
              <p class="profile-role">{{ profile.role }}</p>
            </div>
          </button>

          <section v-if="profileEditorOpen" class="profile-panel">
            <h2>แก้ไขโปรไฟล์แอดมิน</h2>

            <label class="field">
              ชื่อแอดมิน
              <input v-model="profileForm.name" type="text" />
            </label>

            <div class="field">
              รูปโปรไฟล์
              <div class="avatar-row">
                <div class="profile-pic preview" aria-hidden="true">
                  <img
                    v-if="profileForm.avatar"
                    :src="profileForm.avatar"
                    alt="ตัวอย่างรูปโปรไฟล์"
                  />
                  <span v-else>{{ profileInitials }}</span>
                </div>
                <div class="profile-actions">
                  <input
                    ref="avatarInputRef"
                    accept="image/*"
                    class="hidden-input"
                    type="file"
                    @change="handleAvatarChange"
                  />
                  <button class="small-btn" type="button" @click="openAvatarPicker">
                    เลือกรูป
                  </button>
                  <button class="small-btn ghost" type="button" @click="clearAvatar">ลบรูป</button>
                </div>
              </div>
            </div>

            <div class="panel-actions">
              <button class="small-btn" type="button" @click="saveProfile">บันทึก</button>
              <button class="small-btn ghost" type="button" @click="closeProfileEditor">
                ยกเลิก
              </button>
            </div>
          </section>
        </div>
      </header>

      <main class="page">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <RouterView />
      </main>
    </section>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background:
    radial-gradient(circle at 15% -10%, #f7edf8 0%, #f7edf8 28%, transparent 52%),
    linear-gradient(
      165deg,
      #fff8fb 0%,
      color-mix(in srgb, var(--theme-primary) 8%, #fff) 48%,
      color-mix(in srgb, var(--theme-accent) 8%, #fff) 100%
    );
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 278px;
  max-width: 84vw;
  z-index: 1200;
  overflow-y: auto;
  overflow-x: hidden;
  border: 0;
  border-radius: 0 22px 22px 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 250, 255, 0.78) 100%);
  backdrop-filter: blur(14px);
  transform: translateX(-100%);
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
  box-shadow: 16px 0 40px rgba(60, 30, 80, 0.16);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--theme-primary) 45%, #e6d9f5) transparent;
}

.sidebar::before {
  content: '';
  position: absolute;
  inset: 0 0 0 auto;
  width: 3px;
  background: linear-gradient(180deg, var(--theme-primary), var(--theme-accent));
  opacity: 0.55;
}

.sidebar::-webkit-scrollbar {
  width: 6px;
}

.sidebar::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-primary) 40%, #e6d9f5);
  border-radius: 999px;
}

.sidebar--open {
  transform: translateX(0);
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 1.15rem 1rem 1.5rem;
}

.brand-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.4rem;
  padding-bottom: 1.1rem;
  border-bottom: 1px dashed color-mix(in srgb, var(--theme-primary) 22%, #ece2f7);
}

.brand-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fff;
  padding: 2px;
  background-image: linear-gradient(#fff, #fff),
    linear-gradient(135deg, var(--theme-primary), var(--theme-accent));
  background-origin: border-box;
  background-clip: content-box, border-box;
  border: 2px solid transparent;
  box-shadow: 0 4px 12px rgba(92, 72, 117, 0.16);
  overflow: hidden;
  font-size: 1.3rem;
}

.brand-avatar img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
  border-radius: 50%;
}

.sidebar-panel {
  margin-top: 0.5rem;
  padding: 0.85rem;
  border: 1px solid #ede3f6;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 18px rgba(90, 70, 115, 0.06);
}

.sidebar-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.sidebar-panel-link {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--theme-primary);
}

.sidebar-subsection + .sidebar-subsection {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px dashed #e8ddf4;
}

.sidebar-subsection--card {
  padding: 0.75rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #ece0f5;
}

.sidebar-subtitle {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: #5f4a7f;
}

.sidebar-banner-preview {
  width: 100%;
  height: 108px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #f7effc 0%, #fff 100%);
  border: 1px solid #eadff5;
  margin-bottom: 0.75rem;
}

.sidebar-banner-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sidebar-field {
  display: grid;
  gap: 0.35rem;
  color: #7b66a0;
  font-size: 0.78rem;
  font-weight: 700;
}

.sidebar-field input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #e2d2f3;
  background: #fff;
  color: #4a355e;
  padding: 0.64rem 0.72rem;
  font-size: 0.82rem;
}

.sidebar-field--compact input {
  padding: 0.2rem;
  height: 36px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.sidebar-logo-preview {
  width: 100%;
  height: 78px;
  border-radius: 12px;
  border: 1px solid #eadff5;
  background: linear-gradient(135deg, #f7effc 0%, #fff 100%);
  display: grid;
  place-items: center;
  overflow: hidden;
  margin-bottom: 0.55rem;
  color: #80649e;
  font-size: 1.45rem;
}

.sidebar-logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 0.35rem;
}

.sidebar-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.7rem;
}

.sidebar-panel-actions--stack {
  flex-direction: column;
  align-items: stretch;
}

.sidebar-action-btn {
  border: 1px solid #e2d2f3;
  border-radius: 10px;
  background: #fff;
  color: var(--theme-primary);
  font-size: 0.76rem;
  font-weight: 700;
  padding: 0.5rem 0.45rem;
}

.sidebar-action-btn--primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, var(--theme-primary), var(--theme-accent));
}

.sidebar-action-btn--ghost {
  background: #faf7ff;
}

.sidebar-text-action {
  border: 0;
  background: transparent;
  color: var(--theme-primary);
  font-size: 0.78rem;
  font-weight: 800;
  padding: 0;
  text-align: left;
}

.sidebar-action-btn:disabled {
  opacity: 0.6;
}

.sidebar-panel-note {
  margin: 0.55rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #8d7cad;
}

.sidebar-panel-note--error {
  color: #b4452f;
}

.sidebar-panel-note--success {
  color: #277a62;
}

.brand-name {
  font-size: 1rem;
  font-weight: 800;
  color: #3a2c4d;
  line-height: 1.25;
}

.brand-subtitle {
  color: #7c6e93;
  font-size: 0.8rem;
  line-height: 1.2;
}

.menu-block {
  margin-top: 1.1rem;
}

.menu-block--soft {
  margin-top: auto;
  padding-top: 0.9rem;
  border-top: 1px dashed color-mix(in srgb, var(--theme-primary) 20%, #ece2f7);
}

.menu-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  letter-spacing: 0.03em;
  color: #a893c2;
  margin: 0 0.2rem 0.55rem;
  font-weight: 800;
}

.menu-title__paw {
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  color: #b7a6d4;
}

.menu-title__paw svg {
  width: 100%;
  height: 100%;
}

.menu-list {
  display: grid;
  gap: 0.2rem;
}

.menu-list a,
.menu-list span {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 12px;
  padding: 0.56rem 0.7rem;
  color: #5c4f70;
  font-size: 0.87rem;
  line-height: 1.35;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.menu-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.menu-list .menu-icon,
.menu-group__trigger .menu-icon {
  color: #8a7aa4;
  transition: color 0.15s ease;
}

.menu-icon-svg {
  display: block !important;
  width: 18px !important;
  height: 18px !important;
  flex-shrink: 0;
  overflow: visible;
}

a.router-link-exact-active .menu-icon,
.menu-group__trigger--active .menu-icon,
.menu-list > a:hover .menu-icon,
.menu-group__trigger:hover .menu-icon {
  color: var(--theme-primary);
}

.menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-list a::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  translate: 0 -50%;
  width: 3px;
  height: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--theme-primary), var(--theme-accent));
  transition: height 0.18s ease;
}

.menu-list a.router-link-exact-active {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-primary) 16%, #fff),
    color-mix(in srgb, var(--theme-primary) 6%, #fff)
  );
  color: #583a78;
  font-weight: 700;
}

.menu-list a.router-link-exact-active::before {
  height: 62%;
}

.menu-list > a:hover {
  background: #f3eafb;
  color: #4b3265;
  transform: translateX(2px);
}

/* ── EXPANDABLE "รายการยอดขาย" MENU GROUP ── */
.menu-group {
  display: grid;
  gap: 0.15rem;
}

.menu-group__trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  border: none;
  background: none;
  border-radius: 12px;
  padding: 0.56rem 0.7rem;
  color: #5c4f70;
  font-size: 0.87rem;
  line-height: 1.35;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}

.menu-group__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-group__trigger:hover {
  background: #f3eafb;
  color: #4b3265;
}

.menu-group__trigger--active {
  color: #583a78;
  font-weight: 700;
  background: color-mix(in srgb, var(--theme-primary) 9%, transparent);
}

.menu-group__chevron {
  font-size: 0.75rem;
  color: #9b8caf;
  transition: transform 0.18s ease;
  line-height: 1;
}

.menu-group__chevron--open {
  transform: rotate(180deg);
  color: var(--theme-primary);
}

.menu-sub {
  display: grid;
  gap: 0.12rem;
  padding: 0.2rem 0 0.35rem 0.6rem;
  margin: 0.1rem 0 0.1rem 1.55rem;
  border-left: 2px solid #eee2f7;
}

.menu-sub__link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9px;
  padding: 0.42rem 0.55rem;
  color: #6b5a84;
  font-size: 0.82rem;
  line-height: 1.3;
  transition: background 0.15s ease, color 0.15s ease;
}

.menu-sub__link:hover {
  background: #f3eafb;
  color: #4b3265;
}

.menu-sub__link--active {
  background: color-mix(in srgb, var(--theme-primary) 22%, #fff);
  color: #432f61;
  font-weight: 700;
}

.menu-sub__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.menu-sub__dot--all {
  background: #9b8caf;
}

.menu-sub__dot--ready {
  background: #15803d;
}

.menu-sub__dot--pre {
  background: #b45309;
}

.workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  min-height: 58px;
  border-bottom: 1px solid #ece7f4;
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.65rem 1.15rem;
}

.topbar-main {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
}

/* ── MOBILE SIDEBAR TOGGLE (hidden on desktop) ── */
.sidebar-toggle {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: 40px;
  height: 40px;
  border: 1px solid #e7dff1;
  background: #fff;
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.sidebar-toggle span {
  display: block;
  width: 18px;
  height: 2px;
  border-radius: 2px;
  background: var(--theme-primary, #b673ee);
}

/* ── MOBILE SIDEBAR BACKDROP ── */
.sidebar-backdrop {
  display: block;
  position: fixed;
  inset: 0;
  background: rgba(20, 10, 30, 0.4);
  z-index: 1100;
}

.top-search {
  max-width: 340px;
  width: 100%;
}

.top-search input {
  width: 100%;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  position: relative;
}

.notify {
  border-radius: 999px;
  border: 1px solid #e7dff1;
  background: color-mix(in srgb, var(--theme-primary) 15%, #fff);
  color: color-mix(in srgb, var(--theme-primary) 70%, #3f2e56);
  font-size: 0.77rem;
  font-weight: 700;
  padding: 0.38rem 0.7rem;
  line-height: 1.2;
}

.logout-btn {
  background: #fff;
  color: #9b4f5d;
  border-color: #f0d1d9;
}

.profile-chip {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.profile-pic {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(150deg, #ffc7d7, #ffdca9);
  overflow: hidden;
  font-weight: 800;
  color: #5b3f7b;
}

.profile-pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-name {
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.3;
  color: #3b2e4b;
}

.profile-role {
  font-size: 0.72rem;
  color: #846f9f;
  line-height: 1.2;
}

.profile-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 280px;
  border: 1px solid #e6daf2;
  border-radius: 12px;
  background: #fff;
  padding: 0.75rem;
  box-shadow: 0 14px 30px rgba(51, 36, 76, 0.15);
  z-index: 20;
}

.profile-panel h2 {
  color: #503b69;
  font-size: 0.93rem;
  font-weight: 800;
  margin-bottom: 0.55rem;
}

.field {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  color: #6d5a86;
  font-size: 0.8rem;
}

.field input {
  border: 1px solid #dfcff1;
  border-radius: 9px;
  padding: 0.45rem 0.55rem;
  outline: none;
}

.field input:focus {
  border-color: #bf93eb;
  box-shadow: 0 0 0 3px rgba(191, 147, 235, 0.2);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.profile-pic.preview {
  width: 42px;
  height: 42px;
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.hidden-input {
  display: none;
}

.panel-actions {
  display: flex;
  gap: 0.45rem;
  justify-content: flex-end;
}

.small-btn {
  border-radius: 999px;
  border: 1px solid #d8c4f0;
  background: linear-gradient(180deg, #cda2fb, #bc8aed);
  color: #fff;
  font-weight: 700;
  font-size: 0.74rem;
  padding: 0.3rem 0.65rem;
  line-height: 1.2;
  cursor: pointer;
}

.small-btn.ghost {
  border-color: #e4d5f6;
  background: #fff;
  color: #6f5c89;
}

.page {
  padding: 1rem;
}

.page-title {
  font-size: 1.65rem;
  font-weight: 900;
  color: #44325d;
  margin-bottom: 0.9rem;
  line-height: 1.15;
}

@media (max-width: 980px) {
  .app-layout {
    grid-template-columns: 1fr;
  }

  .sidebar-toggle {
    display: flex;
  }

  .sidebar {
    border-radius: 0 18px 18px 0;
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(20, 10, 30, 0.4);
    z-index: 1100;
  }

  .topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .topbar-right {
    justify-content: space-between;
  }

  .profile-panel {
    width: 100%;
    position: static;
    margin-top: 0.35rem;
  }
}

@media (max-width: 480px) {
  .topbar-right {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .page {
    padding: 0.85rem;
  }

  .page-title {
    font-size: 1.3rem;
  }
}
</style>