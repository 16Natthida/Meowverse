import { ref, computed } from 'vue'

const authState = ref(
  Boolean(
    localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth')
  )
)

function updateAuthState(value) {
  authState.value = value
}

export function useAuth() {
  const isLoggedIn = computed(() => authState.value)

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

  return {
    isLoggedIn,
    login,
    logout,
  }
}
