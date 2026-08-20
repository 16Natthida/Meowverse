import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import UserDashboard from '../views/User/UserDashboard.vue'
import AdminDashboard from '../views/Admin/AdminDashboard.vue'
import AdminHomeView from '../views/Admin/HomeView.vue'
import SettingsView from '../views/Admin/SettingsView.vue'

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
      path: '/preorder-payment/:orderId',
      component: () => import('../views/User/PreorderPayment.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    {
      path: '/ready-payment/:orderId',
      component: () => import('../views/User/ReadyPayment.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    {
      path: '/preorder-payment-temp',
      component: () => import('../views/User/PreorderPayment.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    {
      path: '/ready-payment-temp',
      component: () => import('../views/User/ReadyPayment.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    {
      path: '/admin/slips',
      component: () => import('../views/Admin/SlipManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/orders',
      name: 'admin-orders',
      component: () => import('../views/Admin/OrderManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/sales',
      name: 'admin-sales',
      component: () => import('../views/Admin/OrderManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    // ── เส้นทางแยกสำหรับรายการยอดขาย "พร้อมส่ง" และ "พรีออเดอร์" ให้แอดมินเลือกดูแยกกันได้ชัดเจน ──
    {
      path: '/admin/sales/ready-to-ship',
      name: 'admin-sales-ready-to-ship',
      component: () => import('../views/Admin/OrderManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'], orderType: 'ready' },
    },
    {
      path: '/admin/sales/preorder',
      name: 'admin-sales-preorder',
      component: () => import('../views/Admin/OrderManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'], orderType: 'preorder' },
    },
    {
      path: '/admin/inventory-intake',
      component: () => import('../views/Admin/InventoryIntakeManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/missing-items',
      name: 'admin-missing-items',
      component: () => import('../views/Admin/MissingItemsReport.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/import-fee',
      name: 'admin-import-fee',
      component: () => import('../views/Admin/ImportFeeManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/dashboard',
      name: 'userDashboard',
      component: UserDashboard,
      meta: { requiresAuth: true, roles: ['user', 'admin'] },
    },
    // ── เส้นทางแยกสำหรับหมวดสินค้า "พร้อมส่ง" และ "พรีออเดอร์" ให้ user เห็นชัดเจนใน URL ──
    {
      path: '/products/ready-to-ship',
      name: 'products-ready-to-ship',
      component: UserDashboard,
      meta: { requiresAuth: true, roles: ['user', 'admin'], browseTab: 'พร้อมส่ง' },
    },
    {
      path: '/products/preorder',
      name: 'products-preorder',
      component: UserDashboard,
      meta: { requiresAuth: true, roles: ['user', 'admin'], browseTab: 'พรีออเดอร์' },
    },
    { path: '/cart', component: () => import('../views/User/CartPage.vue') },
    {
      path: '/order/:orderId',
      component: () => import('../views/User/OrderSummary.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    {
      path: '/order-list',
      name: 'order-list',
      component: () => import('../views/User/Orderlist.vue'),
      meta: { requiresAuth: true, roles: ['user'] },
    },
    // ── เส้นทางแยกสำหรับรายการออเดอร์ "พร้อมส่ง" และ "พรีออเดอร์" ให้เลือกดูแยกกันได้ชัดเจน ──
    {
      path: '/order-list/ready-to-ship',
      name: 'order-list-ready-to-ship',
      component: () => import('../views/User/Orderlist.vue'),
      meta: { requiresAuth: true, roles: ['user'], orderType: 'ready' },
    },
    {
      path: '/order-list/preorder',
      name: 'order-list-preorder',
      component: () => import('../views/User/Orderlist.vue'),
      meta: { requiresAuth: true, roles: ['user'], orderType: 'preorder' },
    },
    {
      path: '/profile',
      name: 'user-profile',
      component: () => import('../views/User/MyProfile.vue'),
      meta: { requiresAuth: true, roles: ['user', 'admin'] },
    },
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
      path: '/admin/settings',
      name: 'admin-settings',
      component: SettingsView,
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
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('../views/Admin/UsersManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/qrcodes',
      name: 'admin-qrcodes',
      component: () => import('../views/Admin/QRcodeSetting.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/users/add',
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
      path: '/admin/preorder-statistics',
      name: 'admin-preorder-statistics',
      component: () => import('../views/Admin/PreorderStatistics.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/postpones',
      name: 'admin-postpones',
      component: () => import('../views/Admin/PostponeRequests.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/shipping',
      name: 'admin-shipping',
      component: () => import('../views/Admin/ShippingManagement.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/postpones',
      name: 'admin-postpones',
      component: () => import('../views/Admin/PostponeRequests.vue'),
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
