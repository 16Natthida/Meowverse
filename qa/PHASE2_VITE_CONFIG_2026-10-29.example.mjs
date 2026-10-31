// Meowverse Phase 2.1 — QA Frontend Vite config example
// EXAMPLE ONLY — NOT RUN. Keeps the current 5173 -> 3001 stack untouched.

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
})

