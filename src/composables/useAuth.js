import { ref, computed } from 'vue'

const AUTH_KEY = 'meowverse-auth'
const USER_KEY = 'meowverse-user'
const TOKEN_KEY = 'meowverse-token'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api'

function readStorage(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key)
  } catch {
    return null
  }
}

// JWT ที่ได้จาก /api/login (ใช้แนบ header Authorization ทุก request ไปที่ API)
export function getAuthToken() {
  return readStorage(TOKEN_KEY)
}

// เก็บ token ที่เซิร์ฟเวอร์ต่ออายุให้ ลงใน storage เดิม (local = จดจำฉัน, session = ไม่จดจำ)
export function setAuthToken(token) {
  if (!token) return
  try {
    if (localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, token)
    } else if (sessionStorage.getItem(TOKEN_KEY)) {
      sessionStorage.setItem(TOKEN_KEY, token)
    }
  } catch {
    // storage ใช้ไม่ได้ (เช่น private mode) — ใช้ token เดิมต่อไปจนหมดอายุ
  }
}

// แจ้งเซิร์ฟเวอร์ให้ยกเลิก token (ไม่รอผล เพื่อไม่ให้ปุ่มออกจากระบบค้าง)
function notifyServerLogout(path, token) {
  if (!token) return Promise.resolve()
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {})
}

// ถือว่าล็อกอินอยู่ก็ต่อเมื่อมีทั้ง flag และ token (session เก่าก่อนมี JWT จะต้อง login ใหม่)
export function hasAuthSession() {
  return Boolean(readStorage(AUTH_KEY) && getAuthToken())
}

const authState = ref(hasAuthSession())

function updateAuthState(value) {
  authState.value = value
}

export function clearAuthSession() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(AUTH_KEY)
    storage.removeItem(USER_KEY)
    storage.removeItem(TOKEN_KEY)
  }
  updateAuthState(false)
}

function getUserRole() {
  const user = readStorage(USER_KEY)
  if (!user) return null

  try {
    const userData = JSON.parse(user)
    return userData.role || null
  } catch {
    return null
  }
}

export function useAuth() {
  const isLoggedIn = computed(() => authState.value)
  const userRole = computed(() => getUserRole())

  function login(payload, remember = true, token = '') {
    // ล้างของเก่าทั้งสอง storage ก่อน กันข้อมูลค้างจาก session ก่อนหน้า
    clearAuthSession()

    const storage = remember ? localStorage : sessionStorage
    storage.setItem(AUTH_KEY, 'true')
    storage.setItem(USER_KEY, JSON.stringify(payload))
    if (token) {
      storage.setItem(TOKEN_KEY, token)
    }
    updateAuthState(true)
  }

  // ออกจากระบบเครื่องนี้ — token ใบนี้ถูกยกเลิกที่เซิร์ฟเวอร์ด้วย ต่อให้ถูกคัดลอกไปก็ใช้ไม่ได้
  function logout() {
    notifyServerLogout('/logout', getAuthToken())
    clearAuthSession()
  }

  // ออกจากระบบทุกอุปกรณ์ (เช่น ลืม logout ที่เครื่องอื่น)
  async function logoutAllDevices() {
    const response = await notifyServerLogout('/logout-all', getAuthToken())
    if (response && !response.ok) {
      throw new Error('ไม่สามารถออกจากระบบทุกอุปกรณ์ได้ กรุณาลองใหม่')
    }
    clearAuthSession()
  }

  function getUser() {
    const user = readStorage(USER_KEY)
    if (!user) return null

    try {
      return JSON.parse(user)
    } catch {
      return null
    }
  }

  return {
    isLoggedIn,
    userRole,
    login,
    logout,
    logoutAllDevices,
    getUser,
    getToken: getAuthToken,
  }
}
