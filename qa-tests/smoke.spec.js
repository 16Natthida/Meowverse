import { test, expect } from '@playwright/test'

const apiUrl = process.env.API_URL || 'http://localhost:3001'

test.describe('Meowverse: การทดสอบพื้นฐานแบบอ่านอย่างเดียว', () => {
  test('QA-001 เปิดหน้า Login และแสดงช่องกรอกข้อมูล', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Meowverse', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('ชื่อผู้ใช้')).toBeVisible()
    await expect(page.getByPlaceholder('รหัสผ่าน')).toBeVisible()
  })

  test('QA-002 Login ไม่มีข้อมูลต้องแจ้งเตือน', async ({ page }) => {
    await page.goto('/login')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')).toBeVisible()
  })

  for (const route of ['/admin/home', '/admin/import-fee', '/dashboard', '/order-list']) {
    test(`QA-003 ผู้ไม่ได้ Login เข้า ${route} ไม่ได้`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login(?:\?|$)/)
    })
  }

  test('QA-004 หน้า Login บนจอมือถือไม่มี horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login')
    await expect(page.getByPlaceholder('ชื่อผู้ใช้')).toBeVisible()
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1)
  })

  test('API-001 API และ Database ตอบ health check', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/health`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  test('API-002 ผู้ไม่ได้ Login ดึงรายการออเดอร์แอดมินไม่ได้', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/admin/orders`)
    expect([401, 403]).toContain(response.status())
  })

  test('API-003 ผู้ไม่ได้ Login ดึงค่านำเข้าของแอดมินไม่ได้', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/admin/preorder-import-fee/rounds`)
    expect([401, 403]).toContain(response.status())
  })
})
