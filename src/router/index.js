import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import UserDashboard from '../views/UserDashboard.vue'
import AdminDashboard from '../views/AdminDashboard.vue'
import { useAuth } from '../composables/useAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => {
        // Check if user is logged in
        const isAuthenticated = Boolean(
          localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth')
        )
        
        if (!isAuthenticated) {
          return '/login'
        }
        
        // Get user role and redirect accordingly
        const user = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
        if (user) {
          try {
            const userData = JSON.parse(user)
            return userData.role === 'admin' ? '/admin' : '/dashboard'
          } catch {
            return '/dashboard'
          }
        }
        return '/dashboard'
      }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/dashboard',
      name: 'userDashboard',
      component: UserDashboard,
      meta: { requiresAuth: true, roles: ['user'] }
    },
    {
      path: '/admin',
      name: 'adminDashboard',
      component: AdminDashboard,
      meta: { requiresAuth: true, roles: ['admin'] }
    },
  ],
})

const publicPages = ['/login']

router.beforeEach((to, from, next) => {
  const isAuthenticated = Boolean(
    localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth')
  )

  // ดึงข้อมูล role ของผู้ใช้
  const userRole = (() => {
    const user = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
    if (!user) return null
    try {
      const userData = JSON.parse(user)
      return (userData.role || '').toLowerCase() // Convert to lowercase
    } catch {
      return null
    }
  })()

  // ถ้าไม่ได้ล็อคอินและพยายามเข้าหน้าที่ต้องการ auth
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
    return
  }

  // ถ้าล็อคอินแล้วและพยายามเข้าหน้า login
  if (to.path === '/login' && isAuthenticated) {
    // redirect ตามแต่ละ role
    if (userRole === 'admin') {
      next('/admin')
    } else {
      next('/dashboard')
    }
    return
  }

  // ตรวจสอบสิทธิ์ role
  if (to.meta.requiresAuth && to.meta.roles) {
    if (!to.meta.roles.includes(userRole)) {
      // ถ้า role ไม่ตรงกัน ให้ไปหน้า dashboard ตามแต่ละ role
      if (userRole === 'admin') {
        next('/admin')
      } else {
        next('/dashboard')
      }
      return
    }
  }

  next()
})

export default router
