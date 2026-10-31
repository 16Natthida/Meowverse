import { test, expect } from '@playwright/test'

const protectedRoutes = [
  '/admin/home',
  '/admin/dashboard',
  '/admin/products',
  '/admin/users',
  '/admin/users/add',
  '/admin/slips',
  '/admin/sales',
  '/admin/sales/ready-to-ship',
  '/admin/sales/preorder',
  '/admin/preorder-rounds',
  '/admin/preorder-progress',
  '/admin/preorder-statistics',
  '/admin/unpaid-preorder-history',
  '/admin/postpones',
  '/admin/inventory-intake',
  '/admin/missing-items',
  '/admin/import-fee',
  '/admin/shipping',
  '/admin/shipping-providers',
  '/admin/settings',
  '/admin/qrcodes',
  '/dashboard',
  '/products/ready-to-ship',
  '/products/preorder',
  '/cart',
  '/order-list',
  '/order-list/ready-to-ship',
  '/order-list/preorder',
  '/profile',
]

function screenshotName(route) {
  return route.replaceAll('/', '_').replace(/^_/, '') || 'root'
}

test.describe('Surface exploration without credentials', () => {
  test('SURFACE-001 login page renders and evidence screenshot is captured', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Meowverse', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('ชื่อผู้ใช้')).toBeVisible()
    await expect(page.getByPlaceholder('รหัสผ่าน')).toBeVisible()
    await page.screenshot({ path: 'qa/screenshots/login.png', fullPage: true })
  })

  for (const route of protectedRoutes) {
    test(`SURFACE-002 unauthenticated access to ${route} redirects to login`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      const currentUrl = page.url()
      if (!/\/login(?:\?|$)/.test(currentUrl)) {
        await page.screenshot({
          path: `qa/screenshots/unauth-${screenshotName(route)}.png`,
          fullPage: true,
        })
      }
      expect(currentUrl, `route ${route} must require authentication`).toMatch(
        /\/login(?:\?|$)/,
      )
    })
  }
})
