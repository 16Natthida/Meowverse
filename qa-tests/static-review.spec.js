import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('Static review gates', () => {
  test('STATIC-001 every user-facing cart route is protected', async () => {
    const router = await readFile('src/router/index.js', 'utf8')
    const cartStart = router.indexOf("path: '/cart'")
    const nextRoute = router.indexOf("path: '/order/", cartStart)
    expect(cartStart).toBeGreaterThanOrEqual(0)
    expect(nextRoute).toBeGreaterThan(cartStart)
    const cartBlock = router.slice(cartStart, nextRoute)
    expect(cartBlock).toMatch(/requiresAuth:\s*true/)
  })

  test('STATIC-002 admin postpone route is declared only once', async () => {
    const router = await readFile('src/router/index.js', 'utf8')
    const declarations = router.match(/path:\s*'\/admin\/postpones'/g) || []
    expect(declarations.length).toBe(1)
  })

  test('STATIC-003 login does not log the token-bearing response object', async () => {
    const loginView = await readFile('src/views/LoginView.vue', 'utf8')
    expect(loginView).not.toMatch(/console\.log\(['"].*Response data:.*data\)/)
  })
})
