import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import AdminView from '../views/AdminPages/AdminView.vue'
import AddUserView from '../views/AdminPages/Adduser.vue'
import UserHomeView from '../views/UserPages/userhome.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
    {
      path: '/admin/adduser',
      name: 'admin-adduser',
      component: AddUserView,
    },
    {
      path: '/userhome',
      name: 'userhome',
      component: UserHomeView,
    },
  ],
})

export default router
