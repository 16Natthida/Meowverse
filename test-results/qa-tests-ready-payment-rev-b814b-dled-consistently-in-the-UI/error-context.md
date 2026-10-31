# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-tests\ready-payment-review.spec.js >> Ready-to-ship payment focused review >> READY-PAY-002 normalized slip-submitted status is handled consistently in the UI
- Location: qa-tests\ready-payment-review.spec.js:17:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "'slip submitted'"
Received string:    "const isShippingLocked = computed(() => {
  const raw = String(order.value?.status || '').trim()
  const normalized = raw.toLowerCase().replace(/[_\\s]+/g, ' ')
  return [
    'Slip_submitted',
    'import slip submitted',
    'paid',
    'ready to ship',
    'shipped',
    'delivered',
    'cancelled',
  ].includes(normalized)
})·
"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { readFile } from 'node:fs/promises'
  3  | 
  4  | test.describe('Ready-to-ship payment focused review', () => {
  5  |   test('READY-PAY-001 backend accepts only unpaid ready states', async () => {
  6  |     const source = await readFile('server/index.js', 'utf8')
  7  |     const paymentBlock = source.slice(
  8  |       source.indexOf("app.post(\n  '/api/orders/:order_id/payment'"),
  9  |       source.indexOf("// POST /api/orders/:order_id/shipping"),
  10 |     )
  11 | 
  12 |     expect(paymentBlock).toContain("paymentType = 'Ready pay'")
  13 |     expect(paymentBlock).toContain("['pending', 'invalid slip'].includes(normalizedOrderStatus)")
  14 |     expect(paymentBlock).toContain("if (!slip_url)")
  15 |   })
  16 | 
  17 |   test('READY-PAY-002 normalized slip-submitted status is handled consistently in the UI', async () => {
  18 |     const source = await readFile('src/views/User/ReadyPayment.vue', 'utf8')
  19 |     const lockBlock = source.slice(
  20 |       source.indexOf('const isShippingLocked'),
  21 |       source.indexOf('const isPaymentComplete'),
  22 |     )
  23 |     const cancelBlock = source.slice(
  24 |       source.indexOf('const isCancellable'),
  25 |       source.indexOf('async function cancelOrder'),
  26 |     )
  27 | 
  28 |     // Expected normalized value is "slip submitted". This intentionally exposes
  29 |     // the current source defect without changing application code.
> 30 |     expect(lockBlock).toContain("'slip submitted'")
     |                       ^ Error: expect(received).toContain(expected) // indexOf
  31 |     expect(cancelBlock).toContain("'slip submitted'")
  32 |   })
  33 | })
  34 | 
```