import { ref } from 'vue'

const currentUser = ref(null)
const currentToken = ref(
  localStorage.getItem('token') || sessionStorage.getItem('token') || ''
)

function loadStoredUser() {
  const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user')
  if (storedUser) {
    try {
      currentUser.value = JSON.parse(storedUser)
    } catch {
      currentUser.value = null
    }
  }
}

loadStoredUser()

export function useAuth() {
  const login = (payload, remember = true) => {
    const { token, ...userData } = payload
    currentUser.value = userData

    if (remember) {
      localStorage.setItem('user', JSON.stringify(userData))
      if (token) {
        localStorage.setItem('token', token)
        currentToken.value = token
      }
    } else {
      sessionStorage.setItem('user', JSON.stringify(userData))
      if (token) {
        sessionStorage.setItem('token', token)
        currentToken.value = token
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    currentUser.value = null
    currentToken.value = ''
  }

  return {
    currentUser,
    currentToken,
    login,
    logout,
  }
}
