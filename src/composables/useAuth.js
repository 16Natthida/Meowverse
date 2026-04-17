import { ref, computed } from 'vue'

const authState = ref(
  Boolean(
    localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth')
  )
)

function updateAuthState(value) {
  authState.value = value
}

function getUserRole() {
  const user = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
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

  function login(payload, remember = true) {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem('meowverse-auth', 'true')
    storage.setItem('meowverse-user', JSON.stringify(payload))
    if (!remember) {
      localStorage.removeItem('meowverse-auth')
      localStorage.removeItem('meowverse-user')
    }
    updateAuthState(true)
  }

  function logout() {
    localStorage.removeItem('meowverse-auth')
    localStorage.removeItem('meowverse-user')
    sessionStorage.removeItem('meowverse-auth')
    sessionStorage.removeItem('meowverse-user')
    updateAuthState(false)
  }

  function getUser() {
    const user = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
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
    getUser,
  }
}
