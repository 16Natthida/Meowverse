import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import UserDashboard from '../views/User/UserDashboard.vue'
import AdminDashboard from '../views/Admin/AdminDashboard.vue'
import AdminHomeView from '../views/Admin/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => {
        // Check if user is logged in
        const isAuthenticated = Boolean(
          localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth'),
        )

        if (!isAuthenticated) {
          return '/login'
        }

        // Get user role and redirect accordingly
        const user =
          localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
        if (user) {
          try {
            const userData = JSON.parse(user)
            return userData.role === 'admin' ? '/admin/home' : '/dashboard'
          } catch {
            return '/dashboard'
          }
        }
        return '/dashboard'
      },
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
      meta: { requiresAuth: true, roles: ['user'] },
    },
    // เปลี่ยนจาก ./ เป็น ../
{ path: '/cart', component: () => import('../views/User/CartPage.vue') },
{ path: '/order/:orderId', component: () => import('../views/User/OrderSummary.vue'), meta: { requiresAuth: true, roles: ['user'] } },
{ path: '/order-list', component: () => import('../views/User/Orderlist.vue'), meta: { requiresAuth: true, roles: ['user'] } },
    {
      path: '/admin',
      redirect: '/admin/home',
    },
    {
      path: '/admin/home',
      name: 'admin-home',
      component: AdminHomeView,
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/dashboard',
      name: 'adminDashboard',
      component: AdminDashboard,
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/products',
      redirect: '/admin/products',
    },
    {
      path: '/admin/products',
      name: 'admin-products',
      component: () => import('../views/Admin/AdminProductCategoryView.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/adduser',
      name: 'admin-add-user',
      component: () => import('../views/Admin/Adduser.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/preorder-rounds',
      name: 'admin-preorder-rounds',
      component: () => import('../views/Admin/Preorder_lots.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to, from, next) => {
  const isAuthenticated = Boolean(
    localStorage.getItem('meowverse-auth') || sessionStorage.getItem('meowverse-auth'),
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
      next('/admin/home')
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
        next('/admin/home')
      } else {
        next('/dashboard')
      }
      return
    }
  }

  next()
})

export default router
