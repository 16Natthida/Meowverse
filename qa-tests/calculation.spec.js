import { test, expect } from '@playwright/test'
import { calculateChinaShippingBreakdown } from '../server/chinaShipping.js'
import { getFlavorPrice } from '../server/productPricing.js'

test.describe('Money calculation unit checks', () => {
  test('CALC-001 flavor price uses the selected flavor and order type', () => {
    const prices = {
      Chicken: { readyPrice: 45, preorderPrice: 40 },
      Tuna: { readyPrice: 55, preorderPrice: 50 },
    }
    expect(getFlavorPrice(prices, 'Tuna', 'ready', 0)).toBe(55)
    expect(getFlavorPrice(prices, 'Tuna', 'preorder', 0)).toBe(50)
  })

  test('CALC-002 allocated China shipping must preserve the configured total', async () => {
    const runner = {
      query: async () => [[{ quantity_sold: 3, detail_quantity: 0, cart_quantity: 0 }]],
    }
    const breakdown = await calculateChinaShippingBreakdown(
      [1, 2, 3].map((productId) => ({
        prod_id: productId,
        preorder_round_id: 7,
        item_type: 'preorder',
        qty: 1,
        china_shipping_fee_thb: 100,
      })),
      runner,
    )

    // Three separate lines receive 33.33 each in the current implementation.
    // The configured round total is 100.00, so the sum must not lose 0.01.
    expect(breakdown.total).toBe(100)
  })
})
