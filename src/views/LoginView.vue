<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

// หากรูปอยู่ใน src/assets ให้ import แบบนี้:
// import catImage from '@/assets/images/IMG_3644.JPG'

const router = useRouter()
const { login } = useAuth()
const memberId = ref('')
const password = ref('')
const showPassword = ref(false)
const remember = ref(true)
const error = ref('')
const logoImage = ref('')

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

function resolveImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return url
  }
  return `/${url}`
}

async function fetchLogoSettings() {
  try {
    const response = await fetch(`${BACKEND_URL}/site-settings/logo`)
    if (!response.ok) return

    const data = await response.json()
    logoImage.value = resolveImageUrl(data.imageUrl)
  } catch (fetchError) {
    console.error('fetchLogoSettings:', fetchError)
  }
}

onMounted(fetchLogoSettings)

// ---- นับถอยหลังเมื่อ login ผิดครบ 10 ครั้ง (ถูกล็อกชั่วคราว) ----
// backend ล็อกเป็นรายชื่อผู้ใช้ จึงจำไว้ว่าชื่อไหนถูกล็อก เพื่อไม่ให้บล็อกการลองชื่อผู้ใช้อื่น
const lockRemainingSeconds = ref(0)
const lockTotalSeconds = ref(0)
const lockEndsAtMs = ref(0)
const lockedUsername = ref('')
let lockTimerId = null

// วงแหวนนับถอยหลัง (SVG): เส้นรอบวงใช้คำนวณ stroke-dashoffset
const RING_RADIUS = 56
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

const isLocked = computed(
  () =>
    lockRemainingSeconds.value > 0 && normalizeUsername(memberId.value) === lockedUsername.value,
)

// วงแหวนจะค่อยๆ หดลงตามเวลาที่เหลือ
const ringOffset = computed(() => {
  const total = lockTotalSeconds.value || 1
  const ratio = Math.min(1, Math.max(0, lockRemainingSeconds.value / total))
  return RING_CIRCUMFERENCE * (1 - ratio)
})

// เวลาที่จะลองใหม่ได้ (เวลานาฬิกา) เช่น 13:45
const unlockClockText = computed(() => {
  if (!lockEndsAtMs.value) return ''
  return new Date(lockEndsAtMs.value).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
})

const countdownText = computed(() => {
  const total = Math.max(0, lockRemainingSeconds.value)
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})

function stopLockCountdown() {
  if (lockTimerId !== null) {
    clearInterval(lockTimerId)
    lockTimerId = null
  }
}

function startLockCountdown(seconds, username, totalSeconds = seconds) {
  stopLockCountdown()
  lockedUsername.value = normalizeUsername(username)
  lockEndsAtMs.value = Date.now() + seconds * 1000
  lockTotalSeconds.value = Math.max(totalSeconds, seconds)
  lockRemainingSeconds.value = seconds

  // คำนวณจากเวลาสิ้นสุดทุกครั้ง (ไม่ลบทีละ 1) เพื่อให้ตัวนับแม่นยำแม้แท็บถูกพักไว้เบื้องหลัง
  lockTimerId = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((lockEndsAtMs.value - Date.now()) / 1000))
    lockRemainingSeconds.value = remaining

    if (remaining <= 0) {
      stopLockCountdown()
      lockedUsername.value = ''
      error.value = ''
    }
  }, 250)
}

onBeforeUnmount(stopLockCountdown)

async function onSubmit() {
  // ระหว่างถูกล็อกไม่ต้องยิง request ซ้ำ (ป้องกันการกด Enter)
  if (isLocked.value) return

  error.value = ''

  console.log('🔐 Attempting to login...')
  console.log('Username:', memberId.value)
  console.log('Backend URL:', BACKEND_URL)

  if (!memberId.value.trim() || !password.value.trim()) {
    error.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    console.warn('⚠️ Missing username or password')
    return
  }

  try {
    console.log('📡 Sending login request...')
    const response = await fetch(`${BACKEND_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: memberId.value.trim(),
        password: password.value,
      }),
    })

    console.log('✅ Response received:', response.status)
    const data = await response.json()
    console.log('📦 Response data:', data)

    // ผิดครบ 10 ครั้ง (หรือยังอยู่ในช่วงล็อก): เริ่มนับถอยหลังตามเวลาที่ backend ส่งมา
    if (response.status === 429) {
      const seconds =
        Number(data.remainingSeconds) ||
        (data.lockedUntil ? Math.ceil((Number(data.lockedUntil) - Date.now()) / 1000) : 0)

      if (seconds > 0) {
        startLockCountdown(seconds, memberId.value, Number(data.lockoutSeconds) || seconds)
        password.value = ''
        return
      }
    }

    if (!response.ok || !data.success) {
      error.value = data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
      console.error('❌ Login failed:', error.value)
      return
    }

    // ส่ง role ไปยัง login function
    const userData = {
      id: data.user.user_id, // ✅ Backend ส่ง user_id
      username: data.user.username,
      role: data.user.role || 'user', // ค่าเริ่มต้นคือ 'user'
    }

    console.log('👤 User data:', userData)
    login(userData, remember.value)

    // redirect ตามแต่ละ role
    if (userData.role === 'admin' || userData.role === 'Admin') {
      console.log('👨‍💼 Redirecting to admin dashboard...')
      router.push('/admin/home')
    } else {
      console.log('👥 Redirecting to user dashboard...')
      router.push('/dashboard')
    }
  } catch (err) {
    console.error('💥 Error occurred:', err)
    error.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand-area">
        <div class="brand-mark">
          <img v-if="logoImage" :src="logoImage" alt="Meowverse logo" />
        </div>
        <div class="brand-copy">
          <h1>Meowverse</h1>
          <p>Pet Shop Portal</p>
        </div>
      </div>

      <div class="login-card">
        <div class="card-header">
          <span class="header-chip">ยินดีต้อนรับกลับ</span>
          <h2>เข้าสู่ระบบพรีออเดอร์สินค้าแมว</h2>
          <p>เข้าสู่ระบบเพื่อจัดการคำสั่งซื้อและติดตามสถานะสินค้า</p>
        </div>

        <form class="login-form" @submit.prevent="onSubmit">
          <div class="field">
            <label>รหัสสมาชิก</label>
            <div class="input-wrapper">
              <input v-model="memberId" type="text" placeholder="ชื่อผู้ใช้" />
            </div>
          </div>

          <div class="field">
            <label>Password</label>
            <div class="input-wrapper has-toggle">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="รหัสผ่าน"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="toggle-password"
                :aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <!-- ตาเปิด: แสดงตอนรหัสผ่านถูกซ่อนอยู่ (กดเพื่อดู) -->
                <svg
                  v-if="!showPassword"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <!-- ตาขีดฆ่า: แสดงตอนรหัสผ่านถูกเปิดอยู่ (กดเพื่อซ่อน) -->
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>

          <div class="form-footer">
            <label class="custom-remember">
              <input type="checkbox" v-model="remember" />
              <span class="checkmark"></span>
              Remember me
            </label>
          </div>

          <div v-if="isLocked" class="lock-card" role="alert">
            <!-- ตัวนับเป็น aria-hidden เพราะเปลี่ยนทุกวินาที ข้อความด้านล่างเป็นตัวที่อ่านให้ screen reader -->
            <div class="lock-ring" aria-hidden="true">
              <svg viewBox="0 0 160 160" class="lock-ring-svg">
                <defs>
                  <linearGradient id="lockRingGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#c79bf6" />
                    <stop offset="100%" stop-color="#ff93b8" />
                  </linearGradient>
                </defs>
                <!-- หูแมว -->
                <path d="M34 56 L34 14 L72 34 Z" class="ear" stroke-linejoin="round" />
                <path d="M126 56 L126 14 L88 34 Z" class="ear" stroke-linejoin="round" />
                <path d="M40 44 L40 26 L57 35 Z" class="ear-inner" />
                <path d="M120 44 L120 26 L103 35 Z" class="ear-inner" />
                <!-- วงแหวนเวลา -->
                <circle class="ring-face" cx="80" cy="88" :r="RING_RADIUS" />
                <circle class="ring-track" cx="80" cy="88" :r="RING_RADIUS" />
                <circle
                  class="ring-progress"
                  cx="80"
                  cy="88"
                  :r="RING_RADIUS"
                  :stroke-dasharray="RING_CIRCUMFERENCE"
                  :stroke-dashoffset="ringOffset"
                />
              </svg>
              <div class="ring-center">
                <svg class="lock-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="3" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span class="ring-time">{{ countdownText }}</span>
              </div>
            </div>

            <h3 class="lock-title">บัญชีถูกล็อกชั่วคราว</h3>
            <p class="lock-text">
              ใส่รหัสผ่านผิดครบ 10 ครั้ง เพื่อความปลอดภัยของบัญชี
              กรุณารอให้ครบเวลาก่อนลองอีกครั้ง
            </p>
            <p v-if="unlockClockText" class="lock-until">ลองใหม่ได้ตอน {{ unlockClockText }} น.</p>
          </div>
          <div v-else-if="error" class="error-msg">{{ error }}</div>

          <button type="submit" class="btn-login" :disabled="isLocked">
            {{ isLocked ? `รอ ${countdownText}` : 'Login' }}
          </button>
        </form>
      </div>
    </section>

    <section class="login-image-side"></section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(340px, 500px) minmax(320px, 500px);
  justify-content: center;
  align-items: stretch;
  gap: 0;
  width: min(1020px, calc(100vw - 2rem));
  margin: 1rem auto;
  min-height: calc(100vh - 2rem);
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 10%, rgba(255, 216, 233, 0.3), transparent 34%),
    radial-gradient(circle at 100% 100%, rgba(196, 170, 250, 0.2), transparent 38%), #fff9fd;
  font-family: 'Kanit', sans-serif;
  border-radius: 28px;
  box-shadow: 0 14px 30px rgba(126, 96, 168, 0.12);
}

.login-panel {
  position: relative;
  padding: clamp(2rem, 4vw, 3.3rem);
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(8px);
}

.brand-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2.2rem;
}

.brand-mark {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: url('/images/IMG_3644.JPG') center/cover no-repeat;
  background-color: #eee;
  box-shadow: 0 8px 20px rgba(156, 120, 210, 0.24);
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.brand-copy h1 {
  font-size: 1.9rem;
  letter-spacing: -0.02em;
  color: #2f2444;
  margin: 0;
}

.brand-copy p {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 700;
  color: #9876c0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-card {
  width: 100%;
  max-width: 460px;
  border-radius: 26px;
  padding: 1.8rem;
  background: linear-gradient(170deg, rgba(255, 255, 255, 0.96), rgba(250, 242, 255, 0.94));
  box-shadow: 0 10px 24px rgba(133, 96, 182, 0.08);
}

.header-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #8554bf;
  background: #f4e7ff;
  border: 1px solid #e4cef8;
  margin-bottom: 0.7rem;
}

.card-header h2 {
  font-size: clamp(1.55rem, 2.5vw, 2.05rem);
  font-weight: 800;
  line-height: 1.15;
  margin-bottom: 0.6rem;
  color: #2e2443;
}

.card-header p {
  color: #8f7aa9;
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 2rem;
}

.field {
  margin-bottom: 1.5rem;
}

.field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #9983b2;
  margin-bottom: 0.35rem;
}

.input-wrapper {
  position: relative;
  border: none;
  border-radius: 14px;
  background: #f4eefb;
  box-shadow: inset 0 0 0 1px rgba(190, 164, 224, 0.45);
  transition: box-shadow 0.25s ease;
}

.input-wrapper:focus-within {
  box-shadow: inset 0 0 0 1px #bf97ee;
}

.input-wrapper input {
  width: 100%;
  padding: 0.78rem 0.85rem;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.95rem;
  color: #35284f;
}

.input-wrapper input::placeholder {
  color: #c0b2d6;
}

.input-wrapper.has-toggle input {
  padding-right: 2.9rem;
}

.toggle-password {
  position: absolute;
  top: 50%;
  right: 0.55rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #9983b2;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.toggle-password:hover {
  color: #8554bf;
  background: rgba(190, 164, 224, 0.2);
}

.toggle-password:focus-visible {
  outline: 2px solid #bf97ee;
  outline-offset: 1px;
}

.form-footer {
  margin: 1.15rem 0 1.35rem;
}

.custom-remember {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.85rem;
  color: #6d597f;
  font-weight: 700;
  gap: 10px;
}

.custom-remember input {
  display: none;
}

.checkmark {
  width: 18px;
  height: 18px;
  border: 2px solid #dcbef7;
  border-radius: 50%;
  display: inline-block;
  position: relative;
  transition: all 0.2s ease;
}

.custom-remember input:checked + .checkmark {
  background-color: #bb84ee;
  border-color: #bb84ee;
}

.btn-login {
  width: 100%;
  padding: 0.9rem 1rem;
  background: linear-gradient(180deg, #cda2fb, #b978eb);
  color: white;
  border: none;
  border-radius: 14px;
  font-weight: 700;
  font-size: 0.98rem;
  cursor: pointer;
  transition: transform 0.2s ease;
  box-shadow: 0 10px 22px rgba(169, 106, 225, 0.28);
}

.btn-login:hover {
  transform: translateY(-2px);
}

.error-msg {
  margin-bottom: 0.8rem;
  border-radius: 10px;
  border: 1px solid #f4d5d9;
  background: #fff2f4;
  color: #b14857;
  padding: 0.58rem 0.72rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.lock-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 1rem;
  padding: 1.1rem 1rem 1.15rem;
  border-radius: 20px;
  text-align: center;
  background: linear-gradient(170deg, #fcf7ff, #fff3f8);
  border: 1px solid #ead9fb;
  animation: lock-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) 1;
}

.lock-ring {
  position: relative;
  width: 148px;
  height: 148px;
  margin-bottom: 0.35rem;
}

.lock-ring-svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.lock-ring-svg .ear {
  fill: #ecdcfb;
  stroke: #ecdcfb;
  stroke-width: 6;
}

.lock-ring-svg .ear-inner {
  fill: #ffc4d8;
}

.lock-ring-svg .ring-face {
  fill: #fff;
}

.lock-ring-svg .ring-track,
.lock-ring-svg .ring-progress {
  fill: none;
  stroke-width: 9;
}

.lock-ring-svg .ring-track {
  stroke: #f1e6fc;
}

.lock-ring-svg .ring-progress {
  stroke: url(#lockRingGradient);
  stroke-linecap: round;
  /* เริ่มนับจากตำแหน่ง 12 นาฬิกา */
  transform: rotate(-90deg);
  transform-origin: 80px 88px;
  transition: stroke-dashoffset 0.3s linear;
}

.ring-center {
  position: absolute;
  left: 0;
  right: 0;
  /* จุดศูนย์กลางวงแหวนอยู่ต่ำกว่ากึ่งกลางกล่องเล็กน้อย (เพราะมีหูแมวด้านบน) */
  top: 55%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}

.lock-icon {
  color: #b678ee;
}

.ring-time {
  font-size: 1.7rem;
  font-weight: 800;
  line-height: 1.1;
  color: #2e2443;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.lock-title {
  margin: 0.2rem 0 0.3rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2e2443;
}

.lock-text {
  max-width: 30ch;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: #8f7aa9;
}

.lock-until {
  margin: 0.7rem 0 0;
  padding: 0.28rem 0.75rem;
  border-radius: 999px;
  background: #f4e7ff;
  border: 1px solid #e4cef8;
  font-size: 0.78rem;
  font-weight: 700;
  color: #8554bf;
  font-variant-numeric: tabular-nums;
}

.btn-login:disabled {
  cursor: not-allowed;
  color: #9c86b8;
  background: #f1e8fb;
  box-shadow: inset 0 0 0 1px #e2d2f5;
  transform: none;
  font-variant-numeric: tabular-nums;
}

@keyframes lock-shake {
  10%,
  90% {
    transform: translateX(-1px);
  }
  20%,
  80% {
    transform: translateX(2px);
  }
  30%,
  50%,
  70% {
    transform: translateX(-4px);
  }
  40%,
  60% {
    transform: translateX(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lock-card {
    animation: none;
  }
  .lock-ring-svg .ring-progress {
    transition: none;
  }
}

.login-image-side {
  background: url('/images/IMG_3644.JPG') center/cover no-repeat;
  min-height: 680px;
  max-height: 860px;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.login-image-side::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02)),
    radial-gradient(circle at 8% 12%, rgba(255, 255, 255, 0.48), transparent 28%);
}

@media (max-width: 980px) {
  .login-page {
    grid-template-columns: 1fr;
    width: min(640px, calc(100vw - 1.2rem));
    margin: 0.6rem auto;
    padding: 0.9rem;
    min-height: auto;
    border-radius: 22px;
  }
  .login-image-side {
    min-height: 200px;
    height: 240px;
    max-height: 240px;
    order: -1;
  }
  .login-panel {
    border-right: none;
    padding: 1.5rem 1rem 2rem;
    background: transparent;
    backdrop-filter: none;
  }
  .brand-area {
    margin-bottom: 1rem;
  }
  .brand-copy h1 {
    font-size: 1.55rem;
  }
  .login-card {
    max-width: 100%;
    padding: 1.25rem;
    border-radius: 20px;
  }
}
</style>