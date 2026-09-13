<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { computed, onMounted, ref, watch } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const termsText = ref('')
const termsLoading = ref(true)
const termsLoaded = ref(false)
const termsSaving = ref(false)
const termsError = ref('')
const termsSuccess = ref('')
const activeSection = ref('terms')
const bannerPreviewFailed = ref(false)
const termsPreview = computed(() => termsText.value.split('\n').map((line) => line.trim()).filter(Boolean))

async function loadTerms() {
  termsLoading.value = true
  termsError.value = ''
  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/preorder-terms`)
    if (!response.ok) throw new Error('ไม่สามารถโหลดกฎพรีออเดอร์ได้ กรุณาลองใหม่')
    const data = await response.json()
    termsText.value = data.terms.join('\n')
    termsLoaded.value = true
  } catch (error) {
    termsError.value = error.message
  } finally {
    termsLoading.value = false
  }
}

async function saveTerms() {
  termsSaving.value = true
  termsError.value = ''
  termsSuccess.value = ''
  try {
    const response = await fetch(`${API_BASE_URL}/site-settings/preorder-terms`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
      body: JSON.stringify({ terms: termsPreview.value }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถบันทึกกฎได้')
    termsText.value = data.terms.join('\n')
    termsSuccess.value = 'บันทึกกฎแล้ว ลูกค้าจะเห็นกฎใหม่เมื่อเปิดหรือโหลดหน้าชำระเงินพรีออเดอร์อีกครั้ง'
  } catch (error) {
    termsError.value = error.message
  } finally {
    termsSaving.value = false
  }
}

onMounted(loadTerms)

// Banner state
const bannerImageUrl = ref('')
watch(bannerImageUrl, () => { bannerPreviewFailed.value = false })
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
  } catch {
    // ignore in non-browser environments
  }
}

// Theme saving is reserved for the theme controls that will be enabled later.
// eslint-disable-next-line no-unused-vars
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
    <AdminPageHeader title="ตั้งค่าระบบ" description="จัดการแบนเนอร์ โลโก้ และกฎพรีออเดอร์ของร้าน"></AdminPageHeader>

    <nav class="settings-tabs" aria-label="หมวดการตั้งค่า">
      <button type="button" :class="{ active: activeSection === 'terms' }" :aria-pressed="activeSection === 'terms'" @click="activeSection = 'terms'">กฎพรีออเดอร์</button>
      <button type="button" :class="{ active: activeSection === 'brand' }" :aria-pressed="activeSection === 'brand'" @click="activeSection = 'brand'">แบนเนอร์และโลโก้</button>
    </nav>

    <section v-show="activeSection === 'terms'" class="panel settings-panel">
      <header class="panel-head panel-head--stack">
        <h3>กฎกติกาและเงื่อนไขพรีออเดอร์</h3>
        <p>แสดงให้ลูกค้าอ่านและยอมรับก่อนยืนยันการชำระเงินพรีออเดอร์</p>
      </header>
      <p v-if="termsLoading" role="status">กำลังโหลดกฎ...</p>
      <form v-else-if="termsLoaded" class="terms-form" @submit.prevent="saveTerms">
        <div class="terms-editor settings-controls">
        <div class="editor-heading"><h4>แก้ไขข้อความกฎ</h4><span class="count-badge">{{ termsPreview.length }} / 50 ข้อ</span></div>
        <label class="field">
          เขียนหนึ่งข้อต่อบรรทัด ไม่ต้องใส่เลขข้อ
          <textarea v-model="termsText" rows="11" :disabled="termsSaving" required @input="termsSuccess = ''" />
        </label>
        <p class="editor-hint">เพิ่ม ลบ หรือสลับบรรทัดเพื่อจัดลำดับกฎ • ข้อละไม่เกิน 1,000 ตัวอักษร</p>
        </div>
        <div class="terms-preview">
          <span class="preview-label">มุมมองลูกค้า</span>
          <h4>ตัวอย่างกฎที่ลูกค้าจะเห็น</h4>
          <p class="preview-description">กฎกติกาและเงื่อนไขของร้าน</p>
          <ol><li v-for="(term, index) in termsPreview" :key="index">{{ term }}</li></ol>
          <p v-if="!termsPreview.length" class="editor-hint">เริ่มเขียนกฎทางซ้าย เพื่อดูตัวอย่างที่นี่</p>
          <div class="preview-consent"><span aria-hidden="true">✓</span> ฉันได้อ่านและยอมรับเงื่อนไขของร้านแล้ว</div>
        </div>
        <div class="settings-actions terms-footer">
          <p>กดบันทึกเพื่ออัปเดตกฎที่แสดงในหน้าชำระเงิน</p>
          <button class="hero-btn hero-btn--primary" type="submit" :disabled="termsSaving || !termsPreview.length">
            {{ termsSaving ? 'กำลังบันทึก...' : 'บันทึกกฎพรีออเดอร์' }}
          </button>
        </div>
      </form>
      <p v-if="termsError" class="settings-note settings-note--error" role="alert">{{ termsError }}</p>
      <button v-if="!termsLoading && !termsLoaded" class="hero-btn hero-btn--ghost" @click="loadTerms">ลองโหลดอีกครั้ง</button>
      <p v-if="termsSuccess" class="settings-note settings-note--success" role="status">{{ termsSuccess }}</p>
    </section>

    <!-- Banner Section -->
    <section v-show="activeSection === 'brand'" class="panel settings-panel">
      <header class="panel-head panel-head--stack">
        <h3>ตั้งค่าแบนเนอร์หน้าแรก</h3>
        <p>อัปโหลดรูปใหม่หรือวางลิงก์รูป เพื่อเปลี่ยนภาพที่ผู้ใช้เห็นบนหน้า dashboard</p>
      </header>

      <div class="settings-layout">
        <div class="settings-preview">
          <img v-if="!bannerPreviewFailed" :key="bannerImageUrl" :src="resolveBannerImageUrl(bannerImageUrl)" alt="ตัวอย่างแบนเนอร์หน้าแรก" @error="bannerPreviewFailed = true" />
          <div v-else class="image-empty"><span aria-hidden="true">▧</span><strong>ไม่สามารถแสดงตัวอย่างรูปได้</strong><p>เลือกรูปใหม่ หรือเปลี่ยนลิงก์รูปแบนเนอร์</p></div>
        </div>

        <div class="settings-controls">
          <label class="field">
            ลิงก์รูปแบนเนอร์
            <input v-model="bannerImageUrl" placeholder="/uploads/banner.jpg" type="url" @input="bannerPreviewFailed = false" />
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

    <!-- Logo Section -->
    <section v-show="activeSection === 'brand'" class="panel settings-panel">
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
  gap: 1.5rem;
  padding: 1rem 1rem 3rem;
  width: 100%;
  max-width: 1760px;
  box-sizing: border-box;
  margin: 0 auto;
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
  padding: 32px;
  background: #fff;
  border: 1px solid #e9e2f0;
  border-radius: 20px;
  box-shadow: 0 5px 24px #49316406;
}

.settings-tabs { display: flex; gap: 6px; padding: 5px; background: #eee7f5; border-radius: 12px; align-self: flex-start; }
.settings-tabs button { border: 0; background: transparent; color: #756487; padding: 11px 20px; border-radius: 9px; font: inherit; font-size: 0.9rem; cursor: pointer; }
.settings-tabs button.active { background: #fff; color: #7044a8; box-shadow: 0 2px 6px #49316410; font-weight: 600; }
.settings-tabs button:focus-visible, .hero-btn:focus-visible { outline: 3px solid #b794de; outline-offset: 3px; }
.terms-form { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 28px; }
.terms-editor { min-width: 0; }
.editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.editor-heading h4, .terms-preview h4 { margin: 0; color: #432f61; font-size: 1rem; }
.count-badge { background: #f1eafa; color: #7955a3; font-size: 0.75rem; padding: 5px 10px; border-radius: 20px; white-space: nowrap; }
.editor-hint { margin: 0; color: #85778f; font-size: 0.78rem; line-height: 1.7; }
.terms-preview { min-width: 0; background: #faf8fd; border: 1px solid #e8def2; padding: 24px; border-radius: 14px; }
.preview-label { display: inline-block; margin-bottom: 16px; font-size: 0.72rem; color: #8157ab; background: #eee4f8; padding: 4px 10px; border-radius: 6px; }
.preview-description { color: #91839c; font-size: 0.78rem; margin: 6px 0 20px; }
.terms-preview ol { padding-left: 24px; color: #655574; font-size: 1rem; line-height: 1.9; }
.terms-preview li::marker { color: #9671b7; font-weight: 600; }
.preview-consent { border-top: 1px solid #e8def2; padding-top: 16px; margin-top: 20px; color: #857190; font-size: 0.75rem; line-height: 1.7; }
.preview-consent span { display: inline-block; margin-right: 6px; color: #8250b1; }
.terms-footer { grid-column: 1 / -1; border-top: 1px solid #eee8f3; padding-top: 20px; justify-content: space-between; align-items: center; }
.terms-footer p { margin: 0; color: #8a7b96; font-size: 0.8rem; }
.image-empty { text-align: center; color: #93819f; padding: 24px; font-size: 0.85rem; }
.image-empty span { display: block; font-size: 2.5rem; margin-bottom: 12px; }
.image-empty p { font-size: 0.75rem; }

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 20px;
  border-bottom: 1px solid #f0eaf5;
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
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 2rem;
  align-items: start;
}

.settings-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  background: linear-gradient(135deg, #f4eefb 0%, #f9f3fc 100%);
  border-radius: 12px;
  overflow: hidden;
}

.settings-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  max-height: 240px;
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

.field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 1px solid #d0bfe0;
  border-radius: 8px;
  font: inherit;
  line-height: 1.7;
  resize: vertical;
  color: #51435e;
  background: #fdfcfe;
  font-size: 1rem;
  min-height: 360px;
  line-height: 1.95;
}

.terms-preview li {
  overflow-wrap: anywhere;
  margin-bottom: 0.5rem;
}

.field textarea:focus,
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
  background: #8154b3;
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
  .field textarea { min-height: 280px; }
  .settings-view { padding: 8px 0 24px; }
  .settings-panel { padding: 18px; border-radius: 16px; }
  .terms-form { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .terms-preview { padding: 18px; }
  .settings-tabs { align-self: stretch; }
  .settings-tabs button { flex: 1; padding: 10px; }
  .settings-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .settings-preview {
    min-height: 180px;
  }

  .settings-actions {
    flex-direction: column;
  }

  .hero-btn {
    width: 100%;
  }

}
</style>
