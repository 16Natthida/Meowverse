<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

// หากรูปอยู่ใน src/assets ให้ import แบบนี้:
// import catImage from '@/assets/images/IMG_3644.JPG'

const router = useRouter()
const { login } = useAuth()
const memberId = ref('')
const password = ref('')
const remember = ref(true)
const error = ref('')

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

async function onSubmit() {
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
        <div class="brand-mark"></div>
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
            <div class="input-wrapper">
              <input v-model="password" type="password" placeholder="รหัสผ่าน" />
            </div>
          </div>

          <div class="form-footer">
            <label class="custom-remember">
              <input type="checkbox" v-model="remember" />
              <span class="checkmark"></span>
              Remember me
            </label>
          </div>

          <div v-if="error" class="error-msg">{{ error }}</div>

          <button type="submit" class="btn-login">Login</button>
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
