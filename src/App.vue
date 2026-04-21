<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const { logout } = useAuth()
const PROFILE_STORAGE_KEY = 'meowverse-admin-profile'

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

  return 'แดชบอร์ด'
})

const isStandaloneRoute = computed(() => route.path === '/login')
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

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

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <RouterView v-if="isStandaloneRoute || !isAdminRoute" />

  <div v-else class="app-layout">
    <aside class="sidebar">
      <div class="brand-box">
        <div class="brand-avatar" aria-hidden="true">🐱</div>
        <div>
          <p class="brand-name">Meowverse</p>
          <p class="brand-subtitle">ร้านสัตว์เลี้ยง</p>
        </div>
      </div>

      <div class="menu-block">
        <p class="menu-title">เมนูหลัก</p>
        <nav class="menu-list" aria-label="เมนูหลัก">
          <RouterLink to="/admin/home">แดชบอร์ด</RouterLink>
          <RouterLink to="/admin/products">สินค้า</RouterLink>
          <RouterLink to="/admin/adduser">เพิ่ม User</RouterLink>
        </nav>
      </div>

      <div class="menu-block">
        <p class="menu-title">เครื่องมือ</p>
        <div class="menu-list menu-list--static">
          <span>ตั้งค่าระบบ</span>
          <span>รายงาน</span>
          <span>วิธีใช้งาน</span>
        </div>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <label class="top-search" aria-label="ค้นหาสินค้า">
          <input placeholder="ค้นหาสินค้า" type="text" />
        </label>

        <div class="topbar-right">
          <button class="notify" type="button">ดูกันบ้างไหมดี?</button>
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

            <label class="field">
              ตำแหน่ง
              <input v-model="profileForm.role" type="text" />
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
  grid-template-columns: 230px minmax(0, 1fr);
  background:
    radial-gradient(circle at 15% -10%, #f7edf8 0%, #f7edf8 28%, transparent 52%),
    linear-gradient(165deg, #fff8fb 0%, #f8f6ff 48%, #f9f2fc 100%);
}

.sidebar {
  border-right: 1px solid #ece7f4;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(8px);
}

.brand-box {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1.2rem;
}

.brand-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fff;
  border: 1px solid #e7dff1;
  box-shadow: 0 3px 8px rgba(92, 72, 117, 0.12);
}

.brand-name {
  font-size: 0.98rem;
  font-weight: 800;
  color: #3a2c4d;
  line-height: 1.25;
}

.brand-subtitle {
  color: #7c6e93;
  font-size: 0.82rem;
  line-height: 1.2;
}

.menu-block {
  margin-top: 1rem;
}

.menu-title {
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: #9b8caf;
  margin-bottom: 0.5rem;
  font-weight: 800;
}

.menu-list {
  display: grid;
  gap: 0.22rem;
}

.menu-list a,
.menu-list--static span {
  border-radius: 10px;
  padding: 0.52rem 0.62rem;
  color: #5c4f70;
  font-size: 0.9rem;
  line-height: 1.35;
}

.menu-list a.router-link-exact-active {
  background: #d8bbf7;
  color: #583a78;
  font-weight: 700;
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
  background: #f6eafd;
  color: #7b589f;
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

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid #ece7f4;
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
</style>
