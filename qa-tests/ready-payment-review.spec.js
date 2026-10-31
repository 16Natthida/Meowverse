import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('Ready-to-ship payment focused review', () => {
  test('READY-PAY-001 backend accepts only unpaid ready states', async () => {
    const source = await readFile('server/index.js', 'utf8')
    const paymentBlock = source.slice(
      source.indexOf("app.post(\n  '/api/orders/:order_id/payment'"),
      source.indexOf("// POST /api/orders/:order_id/shipping"),
    )

    expect(paymentBlock).toContain("paymentType = 'Ready pay'")
    expect(paymentBlock).toContain("['pending', 'invalid slip'].includes(normalizedOrderStatus)")
    expect(paymentBlock).toContain("if (!slip_url)")
  })

  test('READY-PAY-002 normalized slip-submitted status is handled consistently in the UI', async () => {
    const source = await readFile('src/views/User/ReadyPayment.vue', 'utf8')
    const lockBlock = source.slice(
      source.indexOf('const isShippingLocked'),
      source.indexOf('const isPaymentComplete'),
    )
    const cancelBlock = source.slice(
      source.indexOf('const isCancellable'),
      source.indexOf('async function cancelOrder'),
    )

    // Expected normalized value is "slip submitted". This intentionally exposes
    // the current source defect without changing application code.
    expect(lockBlock).toContain("'slip submitted'")
    expect(cancelBlock).toContain("'slip submitted'")
  })
})
