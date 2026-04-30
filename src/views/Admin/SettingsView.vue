<script setup>
import { onMounted, ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// Banner state
const bannerImageUrl = ref('')
const bannerLoading = ref(false)
const bannerSaving = ref(false)
const bannerError = ref('')
const bannerSuccess = ref('')
const bannerInputRef = ref(null)
const defaultBannerImageUrl = '/images/cat.jpg'

// Logo state
const logoImageUrl = ref('')
const logoLoading = ref(false)
const logoSaving = ref(false)
const logoError = ref('')
const logoSuccess = ref('')
const logoInputRef = ref(null)
const defaultLogoImageUrl = ''

// Theme state
const themePrimary = ref('#6b4fb3')
const themeAccent = ref('#f6c1ff')
const themeLoading = ref(false)
const themeSaving = ref(false)
const themeError = ref('')
const themeSuccess = ref('')

function getAdminHeaders() {
  try {
    const userData = JSON.parse(localStorage.getItem('meowverse-user') || '{}')
    return {
      'x-user-role': 'admin',
      'x-user-id': userData.id || '',
    }
  } catch {
    return {
      'x-user-role': 'admin',
      'x-user-id': '',
    }
  }
}

function resolveBannerImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) {
    return defaultBannerImageUrl
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }

  return `/${url}`
}

function resolveLogoImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) {
    return defaultLogoImageUrl
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }

  return `/${url}`
}

function notifyLogoUpdated() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent('meowverse:logo-updated'))
}

// Banner functions
async function fetchBannerSettings() {
  bannerLoading.value = true
  bannerError.value = ''
  bannerSuccess.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/banner`)
    if (!response.ok) throw new Error('ไม่สามารถโหลดค่าแบนเนอร์')

    const data = await response.json()
    bannerImageUrl.value = data.imageUrl || defaultBannerImageUrl
  } catch (err) {
    bannerError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    bannerLoading.value = false
  }
}

async function fetchLogoSettings() {
  logoLoading.value = true
  logoError.value = ''
  logoSuccess.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/logo`)
    if (!response.ok) throw new Error('ไม่สามารถโหลดค่าโลโก้')

    const data = await response.json()
    logoImageUrl.value = data.imageUrl || defaultLogoImageUrl
  } catch (err) {
    logoError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    logoLoading.value = false
  }
}

function openBannerPicker() {
  bannerInputRef.value?.click()
}

function openLogoPicker() {
  logoInputRef.value?.click()
}

async function handleBannerFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  bannerError.value = ''
  bannerSuccess.value = ''

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch(`${API_BASE_URL}/uploads/images`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData,
    })

    if (!response.ok) throw new Error('ไม่สามารถอัปโหลดรูปแบนเนอร์')

    const data = await response.json()
    bannerImageUrl.value = data.url

    bannerSuccess.value = 'อัปโหลดสำเร็จ!'
    setTimeout(() => {
      bannerSuccess.value = ''
    }, 3000)
  } catch (err) {
    bannerError.value = err.message || 'เกิดข้อผิดพลาด'
  }

  event.target.value = ''
}

async function handleLogoFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  logoError.value = ''
  logoSuccess.value = ''

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch(`${API_BASE_URL}/uploads/images`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData,
    })

    if (!response.ok) throw new Error('ไม่สามารถอัปโหลดรูปโลโก้')

    const data = await response.json()
    logoImageUrl.value = data.url

    logoSuccess.value = 'อัปโหลดสำเร็จ!'
    setTimeout(() => {
      logoSuccess.value = ''
    }, 3000)
  } catch (err) {
    logoError.value = err.message || 'เกิดข้อผิดพลาด'
  }

  event.target.value = ''
}

async function saveBannerImage() {
  if (!bannerImageUrl.value) {
    bannerError.value = 'กรุณากรอก URL รูปแบนเนอร์'
    return
  }

  bannerSaving.value = true
  bannerError.value = ''
  bannerSuccess.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/banner`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminHeaders(),
      },
      body: JSON.stringify({ imageUrl: bannerImageUrl.value }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'ไม่สามารถบันทึกแบนเนอร์')
    }

    bannerSuccess.value = 'บันทึกแบนเนอร์สำเร็จ!'
    setTimeout(() => {
      bannerSuccess.value = ''
    }, 3000)
  } catch (err) {
    bannerError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    bannerSaving.value = false
  }
}

async function saveLogoImage() {
  if (!logoImageUrl.value) {
    logoError.value = 'กรุณากรอก URL รูปโลโก้'
    return
  }

  logoSaving.value = true
  logoError.value = ''
  logoSuccess.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/logo`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminHeaders(),
      },
      body: JSON.stringify({ imageUrl: logoImageUrl.value }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'ไม่สามารถบันทึกโลโก้')
    }

    logoSuccess.value = 'บันทึกโลโก้สำเร็จ!'
    notifyLogoUpdated()
    setTimeout(() => {
      logoSuccess.value = ''
    }, 3000)
  } catch (err) {
    logoError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    logoSaving.value = false
  }
}

function resetBannerImage() {
  bannerImageUrl.value = defaultBannerImageUrl
  bannerError.value = ''
  bannerSuccess.value = ''
}

function resetLogoImage() {
  logoImageUrl.value = defaultLogoImageUrl
  logoError.value = ''
  logoSuccess.value = ''
}

onMounted(() => {
  fetchBannerSettings()
  fetchLogoSettings()
  fetchTheme()
})

// Theme functions
async function fetchTheme() {
  themeLoading.value = true
  themeError.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/theme`)
    if (!response.ok) throw new Error('ไม่สามารถโหลดธีม')

    const data = await response.json()
    themePrimary.value = data.primary || themePrimary.value
    themeAccent.value = data.accent || themeAccent.value
    applyThemeToDocument()
  } catch (err) {
    themeError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    themeLoading.value = false
  }
}

function applyThemeToDocument() {
  try {
    document.documentElement.style.setProperty('--theme-primary', themePrimary.value)
    document.documentElement.style.setProperty('--theme-accent', themeAccent.value)
  } catch (e) {
    // ignore in non-browser environments
  }
}

async function saveTheme() {
  themeSaving.value = true
  themeError.value = ''
  themeSuccess.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/theme`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminHeaders(),
      },
      body: JSON.stringify({
        primary: themePrimary.value.replace('#', ''),
        accent: themeAccent.value.replace('#', ''),
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'ไม่สามารถบันทึกธีม')
    }

    applyThemeToDocument()
    themeSuccess.value = 'บันทึกธีมสำเร็จ!'
    setTimeout(() => (themeSuccess.value = ''), 3000)
  } catch (err) {
    themeError.value = err.message || 'เกิดข้อผิดพลาด'
  } finally {
    themeSaving.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <header class="page-header">
      <h1>ตั้งค่าระบบ</h1>
      <p>จัดการแบนเนอร์และโลโก้ของร้าน</p>
    </header>

    <!-- Banner Section -->
    <section class="panel settings-panel">
      <header class="panel-head panel-head--stack">
        <h3>ตั้งค่าแบนเนอร์หน้าแรก</h3>
        <p>อัปโหลดรูปใหม่หรือวางลิงก์รูป เพื่อเปลี่ยนภาพที่ผู้ใช้เห็นบนหน้า dashboard</p>
      </header>

      <div class="settings-layout">
        <div class="settings-preview">
          <img :src="resolveBannerImageUrl(bannerImageUrl)" alt="ตัวอย่างแบนเนอร์หน้าแรก" />
        </div>

        <div class="settings-controls">
          <label class="field">
            ลิงก์รูปแบนเนอร์
            <input v-model="bannerImageUrl" placeholder="/uploads/banner.jpg" type="url" />
          </label>

          <input
            ref="bannerInputRef"
            accept="image/*"
            class="hidden-input"
            type="file"
            @change="handleBannerFileChange"
          />

          <div class="settings-actions">
            <button class="hero-btn hero-btn--ghost" type="button" @click="openBannerPicker">
              อัปโหลดรูปใหม่
            </button>
            <button
              class="hero-btn hero-btn--primary"
              type="button"
              :disabled="bannerSaving || bannerLoading"
              @click="saveBannerImage"
            >
              {{ bannerSaving ? 'กำลังบันทึก...' : 'บันทึกแบนเนอร์' }}
            </button>
            <button class="hero-btn hero-btn--ghost" type="button" @click="resetBannerImage">
              ใช้รูปเริ่มต้น
            </button>
          </div>

          <p v-if="bannerLoading" class="settings-note">กำลังโหลดค่าแบนเนอร์...</p>
          <p v-if="bannerError" class="settings-note settings-note--error">{{ bannerError }}</p>
          <p v-if="bannerSuccess" class="settings-note settings-note--success">
            {{ bannerSuccess }}
          </p>
        </div>
      </div>
    </section>

    <!-- Theme Section -->
    <section class="panel settings-panel">
      <header class="panel-head panel-head--stack">
        <h3>ธีมเว็บไซต์</h3>
        <p>ตั้งค่าสีหลักและสีเน้นของเว็บ</p>
      </header>

      <div class="settings-layout">
        <div class="settings-preview">
          <div
            class="theme-preview"
            style="
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            "
          >
            <div
              style="width: 60%; height: 40px; border-radius: 8px; background: var(--theme-primary)"
            ></div>
            <div
              style="
                width: 40%;
                height: 24px;
                border-radius: 6px;
                margin-top: 12px;
                background: var(--theme-accent);
              "
            ></div>
          </div>
        </div>

        <div class="settings-controls">
          <label class="field">
            สีหลัก (primary)
            <input v-model="themePrimary" type="color" />
          </label>

          <label class="field">
            สีเน้น (accent)
            <input v-model="themeAccent" type="color" />
          </label>

          <div class="settings-actions">
            <button
              class="hero-btn hero-btn--primary"
              type="button"
              :disabled="themeSaving || themeLoading"
              @click="saveTheme"
            >
              {{ themeSaving ? 'กำลังบันทึก...' : 'บันทึกธีม' }}
            </button>
          </div>

          <p v-if="themeLoading" class="settings-note">กำลังโหลดค่าธีม...</p>
          <p v-if="themeError" class="settings-note settings-note--error">{{ themeError }}</p>
          <p v-if="themeSuccess" class="settings-note settings-note--success">{{ themeSuccess }}</p>
        </div>
      </div>
    </section>

    <!-- Logo Section -->
    <section class="panel settings-panel">
      <header class="panel-head panel-head--stack">
        <h3>ตั้งค่าโลโก้ร้าน</h3>
        <p>อัปโหลดโลโก้ของร้าน เพื่อแทนที่อีโมจิ 🐱 ในแถบด้านข้าง</p>
      </header>

      <div class="settings-layout">
        <div class="settings-preview">
          <div v-if="resolveLogoImageUrl(logoImageUrl)" class="logo-preview-box">
            <img :src="resolveLogoImageUrl(logoImageUrl)" alt="ตัวอย่างโลโก้" />
          </div>
          <div v-else class="logo-preview-box logo-preview-box--empty">
            <span class="logo-placeholder">🐱</span>
          </div>
        </div>

        <div class="settings-controls">
          <label class="field">
            ลิงก์รูปโลโก้
            <input v-model="logoImageUrl" placeholder="/uploads/logo.png" type="url" />
          </label>

          <input
            ref="logoInputRef"
            accept="image/*"
            class="hidden-input"
            type="file"
            @change="handleLogoFileChange"
          />

          <div class="settings-actions">
            <button class="hero-btn hero-btn--ghost" type="button" @click="openLogoPicker">
              อัปโหลดโลโก้
            </button>
            <button
              class="hero-btn hero-btn--primary"
              type="button"
              :disabled="logoSaving || logoLoading"
              @click="saveLogoImage"
            >
              {{ logoSaving ? 'กำลังบันทึก...' : 'บันทึกโลโก้' }}
            </button>
            <button class="hero-btn hero-btn--ghost" type="button" @click="resetLogoImage">
              ใช้รูปเริ่มต้น
            </button>
          </div>

          <p v-if="logoLoading" class="settings-note">กำลังโหลดค่าโลโก้...</p>
          <p v-if="logoError" class="settings-note settings-note--error">{{ logoError }}</p>
          <p v-if="logoSuccess" class="settings-note settings-note--success">{{ logoSuccess }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 0;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0;
}

.page-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: #432f61;
}

.page-header p {
  margin: 0;
  color: #6d5a82;
  font-size: 0.95rem;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.panel-head h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #432f61;
}

.panel-head p {
  margin: 0;
  color: #6d5a82;
  font-size: 0.9rem;
}

.settings-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;
}

.settings-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background: linear-gradient(135deg, #f4eefb 0%, #f9f3fc 100%);
  border-radius: 12px;
  overflow: hidden;
}

.settings-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 200px;
  background: linear-gradient(135deg, #f4eefb 0%, #f9f3fc 100%);
  border-radius: 12px;
  overflow: hidden;
}

.logo-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 1rem;
}

.logo-preview-box--empty {
  background: linear-gradient(135deg, #e8e0f0 0%, #f0e8f8 100%);
}

.logo-placeholder {
  font-size: 4rem;
}

.settings-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #432f61;
}

.field input {
  padding: 0.75rem;
  border: 1px solid #d0bfe0;
  border-radius: 8px;
  background: #fafbfc;
  font-size: 0.9rem;
  color: #432f61;
  transition: all 0.2s ease;
}

.field input:focus {
  outline: none;
  border-color: #9876c0;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(152, 118, 192, 0.1);
}

.hidden-input {
  display: none;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.hero-btn {
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hero-btn--primary {
  background: linear-gradient(135deg, #c9a6ff 0%, #9876c0 100%);
  color: #fff;
}

.hero-btn--primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(201, 166, 255, 0.4);
}

.hero-btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hero-btn--ghost {
  background: transparent;
  border: 1px solid #d0bfe0;
  color: #432f61;
}

.hero-btn--ghost:hover {
  background: #f4eefb;
  border-color: #9876c0;
}

.settings-note {
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.85rem;
  background: #f9f3fc;
  color: #6d5a82;
}

.settings-note--error {
  background: #ffe8e8;
  color: #c00;
}

.settings-note--success {
  background: #e8f5e9;
  color: #2e7d32;
}

@media (max-width: 768px) {
  .settings-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .settings-preview {
    min-height: 250px;
  }

  .settings-actions {
    flex-direction: column;
  }

  .hero-btn {
    width: 100%;
  }
}
</style>
