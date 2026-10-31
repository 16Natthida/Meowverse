import { test, expect } from '@playwright/test'

const dbName = process.env.QA_DB_NAME || process.env.DB_NAME || ''
const e2eEnabled =
  process.env.QA_E2E_ENABLED === '1' &&
  /_test$/i.test(dbName) &&
  process.env.QA_ADMIN_USERNAME &&
  process.env.QA_ADMIN_PASSWORD &&
  process.env.QA_USER_USERNAME &&
  process.env.QA_USER_PASSWORD

const blockedReason =
  'BLOCKED: requires QA_E2E_ENABLED=1, a DB_NAME ending in _test, and dedicated QA admin/user credentials. No order, payment, slip upload, or destructive action is performed by this suite.'

test.describe('Admin/User E2E flows (safety-gated)', () => {
  test.skip(!e2eEnabled, blockedReason)

  test('E2E-AUTH-01 admin login and menu navigation', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ชื่อผู้ใช้').fill(process.env.QA_ADMIN_USERNAME)
    await page.getByPlaceholder('รหัสผ่าน').fill(process.env.QA_ADMIN_PASSWORD)
    await page.getByRole('button', { name: /เข้าสู่ระบบ|login/i }).click()
    await expect(page).toHaveURL(/\/admin\/home/)
    for (const route of [
      '/admin/products',
      '/admin/sales',
      '/admin/slips',
      '/admin/preorder-rounds',
      '/admin/preorder-progress',
      '/admin/preorder-statistics',
      '/admin/inventory-intake',
      '/admin/missing-items',
      '/admin/import-fee',
      '/admin/shipping',
      '/admin/users',
      '/admin/settings',
      '/admin/qrcodes',
    ]) {
      await page.goto(route)
      await expect(page).not.toHaveURL(/\/login/)
    }
  })

  test('E2E-AUTH-02 user login and read-only menu navigation', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ชื่อผู้ใช้').fill(process.env.QA_USER_USERNAME)
    await page.getByPlaceholder('รหัสผ่าน').fill(process.env.QA_USER_PASSWORD)
    await page.getByRole('button', { name: /เข้าสู่ระบบ|login/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    for (const route of [
      '/products/ready-to-ship',
      '/products/preorder',
      '/cart',
      '/order-list',
      '/order-list/ready-to-ship',
      '/order-list/preorder',
      '/profile',
    ]) {
      await page.goto(route)
      await expect(page).not.toHaveURL(/\/login/)
    }
  })

  test('E2E-READ-ONLY-01 checkout preview and payment screens are inspectable without submitting', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/preorder-payment-temp')
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/ready-payment-temp')
    await expect(page).not.toHaveURL(/\/login/)
  })
})
