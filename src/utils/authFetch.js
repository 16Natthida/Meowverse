// แนบ JWT ให้ทุก request ที่เรียก API ของเราเองโดยอัตโนมัติ
// และเด้งกลับหน้า login เมื่อ token หมดอายุ/ไม่ถูกต้อง (HTTP 401)
//
// ติดตั้งครั้งเดียวใน main.js → ทุก fetch() เดิมในโปรเจกต์ใช้ได้เลยโดยไม่ต้องแก้ทีละไฟล์

import { clearAuthSession, getAuthToken, setAuthToken } from '@/composables/useAuth'

// เส้นที่ไม่ต้องเด้งไปหน้า login เมื่อได้ 401
const LOGIN_PATHS = ['/api/login', '/api/register', '/login', '/register', '/api/logout', '/api/logout-all']

function resolveUrl(input) {
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url
    return new URL(raw, window.location.href)
  } catch {
    return null
  }
}

// ส่ง token เฉพาะ API ของเราเอง (host เดียวกับหน้าเว็บ) ไม่ส่งให้เว็บภายนอก
function isOwnApiRequest(url) {
  if (!url) return false
  if (url.hostname !== window.location.hostname) return false
  return url.pathname.startsWith('/api/') || url.pathname === '/api'
}

function isLoginRequest(url) {
  return LOGIN_PATHS.includes(url.pathname.replace(/\/+$/, ''))
}

let redirecting = false

export function installAuthFetch(router) {
  if (window.__meowverseAuthFetchInstalled) return
  window.__meowverseAuthFetchInstalled = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    const url = resolveUrl(input)
    if (!isOwnApiRequest(url)) {
      return originalFetch(input, init)
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
    const token = getAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    // header เก่าที่ backend ไม่เชื่อถือแล้ว — ไม่ต้องส่ง
    headers.delete('x-user-role')
    headers.delete('x-user-id')

    const response = await originalFetch(input, { ...init, headers })

    // เซิร์ฟเวอร์ต่ออายุ token ให้ → เก็บแทนของเดิม (ผู้ใช้ที่ใช้งานต่อเนื่องจะไม่ถูกเด้งออก)
    const refreshedToken = response.headers.get('X-Refreshed-Token')
    if (refreshedToken && getAuthToken()) {
      setAuthToken(refreshedToken)
    }

    if (response.status === 401 && !isLoginRequest(url) && !redirecting) {
      redirecting = true
      clearAuthSession()
      const current = router.currentRoute.value
      if (current.path !== '/login') {
        router
          .replace({ path: '/login', query: { expired: '1' } })
          .finally(() => {
            redirecting = false
          })
      } else {
        redirecting = false
      }
    }

    return response
  }
}
