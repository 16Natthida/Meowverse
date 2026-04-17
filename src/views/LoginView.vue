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

const BACKEND_URL = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

async function onSubmit() {
  error.value = ''
  if (!memberId.value.trim() || !password.value.trim()) {
    error.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    return
  }

  try {
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

    const data = await response.json()

    if (!response.ok || !data.success) {
      error.value = data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
      return
    }

    login({ id: data.user.id, username: data.user.username }, remember.value)
    router.push('/')
  } catch (err) {
    console.error(err)
    error.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand-area">
        <div class="brand-mark"></div>
        <h1>Meowverse</h1>
      </div>

      <div class="login-card">
        <div class="card-header">
          <h2>เข้าสู่ระบบพรีออเดอร์สินค้าแมว</h2>
          <p>เข้าสู่ระบบเพื่อจัดการคำสั่งซื้อและติดตามสถานะสินค้า</p>
        </div>

        <form class="login-form" @submit.prevent="onSubmit">
          <div class="field">
            <label>รหัสสมาชิก</label>
            <div class="input-wrapper">
              <input v-model="memberId" type="text" placeholder="ชื่อผู้ใช้" />
              <span class="icon">✉️</span>
            </div>
          </div>

          <div class="field">
            <label>Password</label>
            <div class="input-wrapper">
              <input v-model="password" type="password" placeholder="รหัสผ่าน" />
              <span class="icon">🔒</span>
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
/* 🎨 Global & Layout */
.login-page {
  display: grid;
  grid-template-columns: 0.3fr 0.3fr;
  min-height: 100vh;
  width: 100vw;
  overflow-x: hidden;
  background-color: #fffaf7;
  font-family: 'Kanit', sans-serif;
}

/* LEFT SIDE */
.login-panel {
  padding: 4rem 6%;
  display: flex;
  flex-direction: column;
}

.brand-area {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 4rem;
}

.brand-mark {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: url('/images/IMG_3644.JPG') center/cover no-repeat;
  background-color: #eee;
}

.brand-area h1 {
  font-size: 1.5rem;
  color: #333;
  margin: 0;
}

/* CARD STYLE (Minimal) */
.login-card {
  width: 100%;
  max-width: 520px;
}

.card-header h2 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #1a1a1a;
}

.card-header p {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

/* INPUT FIELD (Border bottom only) */
.field {
  margin-bottom: 1.5rem;
}

.field label {
  display: block;
  font-size: 0.8rem;
  color: #aaa;
  margin-bottom: 5px;
}

.input-wrapper {
  position: relative;
  border-bottom: 1px solid #eee;
  transition: 0.3s;
}

.input-wrapper:focus-within {
  border-bottom: 1px solid #c9a6ff;
}

.input-wrapper input {
  width: 100%;
  padding: 10px 30px 10px 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1rem;
}

.input-wrapper .icon {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: #ccc;
  font-size: 0.9rem;
}

/* CUSTOM CHECKBOX (Pink circle) */
.form-footer {
  margin: 1.5rem 0;
}

.custom-remember {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.9rem;
  color: #444;
  gap: 10px;
}

.custom-remember input {
  display: none;
}

.checkmark {
  width: 18px;
  height: 18px;
  border: 2px solid #ffccd5;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.custom-remember input:checked + .checkmark {
  background-color: #ff8fa3;
  border-color: #ff8fa3;
}

/* BUTTON */
.btn-login {
  width: 100%;
  padding: 1rem;
  background: #e2c0ff;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 4px 15px rgba(226, 192, 255, 0.4);
}

.btn-login:hover {
  background: #d1a1ff;
  transform: translateY(-2px);
}

/* RIGHT IMAGE */
.login-image-side {
  background: url('/images/IMG_3644.JPG') center/cover no-repeat;
  min-height: 100vh;
  height: auto;
  width: 100%;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .login-image-side {
    display: none;
  }
  .login-panel {
    padding: 2rem;
  }
}
</style>
