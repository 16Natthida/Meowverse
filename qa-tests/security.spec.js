import { test, expect } from '@playwright/test'

const apiUrl = process.env.API_URL || 'http://localhost:3001'

test.describe('API access control (read-only / rejected before mutation)', () => {
  test('SEC-API-001 health endpoint is public and healthy', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/health`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  for (const path of [
    '/api/payments',
    '/api/products',
    '/api/admin/orders',
    '/api/admin/users',
    '/api/admin/preorder-import-fee/rounds',
    '/api/orders?user_id=1',
  ]) {
    test(`SEC-API-002 unauthenticated GET ${path} is rejected`, async ({ request }) => {
      const response = await request.get(`${apiUrl}${path}`)
      expect([401, 403]).toContain(response.status())
    })
  }

  for (const [method, path, body] of [
    ['post', '/api/products', {}],
    ['patch', '/api/products/1/status', { key: 'invalid', value: true }],
    ['patch', '/api/products/1/stock', { quantity: 1, type: 'ready-to-ship' }],
    ['delete', '/api/products/1', undefined],
    ['patch', '/api/payments/1/status', { status: 'invalid' }],
    ['post', '/api/orders/1/shipping', {}],
    ['post', '/api/orders/1/payment', undefined],
  ]) {
    test(`SEC-API-003 unauthenticated ${method.toUpperCase()} ${path} is rejected before mutation`, async ({ request }) => {
      const response = await request[method](`${apiUrl}${path}`, body === undefined ? undefined : { data: body })
      expect([401, 403]).toContain(response.status())
    })
  }
})
