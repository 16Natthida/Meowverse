import { test, expect } from '@playwright/test'

test('READY-PAY-003 Pending ready order enables the payment request path', async ({ page }) => {
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  let paymentRequest = null

  await page.addInitScript(() => {
    localStorage.setItem('meowverse-auth', 'true')
    localStorage.setItem('meowverse-token', 'qa-mocked-token')
    localStorage.setItem('meowverse-user', JSON.stringify({ id: 7, role: 'user' }))
  })

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/api/orders/42') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_id: 42,
          user_id: 7,
          total_amount: 149,
          shipping_fee: 49,
          Order_type: 'Ready',
          status: 'Pending',
          deadline,
          items: [{ prod_id: 1, name: 'QA item', unit_price: 100, qty: 1 }],
          saved_shipping: {},
        }),
      })
      return
    }

    if (url.includes('/api/orders/42/payment') && method === 'POST') {
      paymentRequest = route.request()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }

    await route.fulfill({ status: 200, json: [] })
  })

  await page.goto('http://localhost:5173/ready-payment/42')
  await expect(page.locator('#recipient-name')).toBeVisible()
  await expect(page.locator('#recipient-name')).toBeEnabled()
  await expect(page.locator('.btn-checkout')).toBeEnabled()

  await page.locator('#recipient-name').fill('QA Recipient')
  await page.locator('#recipient-phone').fill('0812345678')
  await page.locator('#recipient-address').fill('QA address')
  await page.locator('#slip-file').setInputFiles({
    name: 'qa-slip.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  })

  await page.locator('.btn-checkout').click()
  await expect.poll(() => paymentRequest !== null).toBe(true)
  expect(paymentRequest.method()).toBe('POST')
  expect(paymentRequest.headers()['content-type']).toMatch(/multipart\/form-data/)
})
