function isPreorderItem(item) {
  const itemType = String(item?.item_type || '').trim().toLowerCase()
  if (itemType === 'preorder' || item?.preorder_round_id) return true

  return Number(item?.preorderEnabled) === 1 && Number(item?.readyToShipEnabled) !== 1
}

function chinaShippingKey(item) {
  const productId = item?.prod_id ?? item?.productId ?? ''
  const roundId = item?.preorder_round_id ?? item?.preorderRoundId ?? ''
  return `${roundId}|${productId}`
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

async function getRoundProductQuantity(runner, roundId, productId) {
  if (!runner?.query || !roundId || !productId) return 0

  const [rows] = await runner.query(
    `SELECT
       COALESCE(prp.quantity_sold, 0) AS quantity_sold,
       COALESCE((
         SELECT SUM(od.qty)
         FROM order_details od
         WHERE od.preorder_round_id = prp.round_id
           AND od.prod_id = prp.prod_id
           AND LOWER(COALESCE(od.item_type, '')) = 'preorder'
           AND COALESCE(od.qty, 0) > 0
       ), 0) AS detail_quantity,
       COALESCE((
         SELECT SUM(c.qty)
         FROM cart c
         WHERE c.preorder_round_id = prp.round_id
           AND c.prod_id = prp.prod_id
           AND LOWER(COALESCE(c.item_type, '')) = 'preorder'
           AND COALESCE(c.qty, 0) > 0
       ), 0) AS cart_quantity
     FROM preorder_round_products prp
     WHERE prp.round_id = ? AND prp.prod_id = ?
     LIMIT 1`,
    [roundId, productId],
  )

  const row = rows[0]
  if (!row) return 0

  const committedQuantity = Number(row.quantity_sold) || 0
  const detailQuantity = Number(row.detail_quantity) || 0
  const cartQuantity = Number(row.cart_quantity) || 0

  // Include open carts while a round is being closed. Using detail + cart
  // keeps the denominator stable as each cart is converted into an order.
  if (cartQuantity > 0) return detailQuantity + cartQuantity

  return committedQuantity || detailQuantity || 0
}

/**
 * China shipping is entered as a total for a product in a preorder round.
 * Split that total by the committed quantity for the same round/product,
 * then charge each order according to its own quantity.
 */
export async function calculateChinaShippingBreakdown(items = [], runner) {
  const groups = new Map()

  for (const item of items) {
    if (!isPreorderItem(item)) continue

    const fee = Number(item?.china_shipping_fee_thb)
    const quantity = Number(item?.qty) || 0
    if (!Number.isFinite(fee) || fee <= 0 || quantity <= 0) continue

    const key = chinaShippingKey(item)
    if (!groups.has(key)) {
      const [roundId, productId] = key.split('|')
      const committedQuantity = await getRoundProductQuantity(runner, roundId, productId)
      groups.set(key, {
        fee,
        quantity: committedQuantity || quantity,
      })
    }

  }

  const itemFees = items.map((item) => {
    if (!isPreorderItem(item)) return 0

    const fee = Number(item?.china_shipping_fee_thb)
    const quantity = Number(item?.qty) || 0
    if (!Number.isFinite(fee) || fee <= 0 || quantity <= 0) return 0

    const group = groups.get(chinaShippingKey(item))
    if (!group) return 0

    return roundMoney((group.fee * quantity) / group.quantity)
  })

  return {
    itemFees,
    total: roundMoney(itemFees.reduce((sum, fee) => sum + fee, 0)),
  }
}

export async function calculateChinaShippingTotal(items = [], runner) {
  const breakdown = await calculateChinaShippingBreakdown(items, runner)
  return breakdown.total
}
