import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installAuthFetch } from './utils/authFetch'

// แนบ JWT ให้ทุก request ไปที่ /api ก่อนที่หน้าไหนจะเริ่มเรียก API
installAuthFetch(router)

const app = createApp(App)

app.use(router)

app.mount('#app')
