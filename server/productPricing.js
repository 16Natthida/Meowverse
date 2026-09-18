function toNullablePrice(value) {
  if (value === '' || value == null) return null

  const price = Number(value)
  return Number.isFinite(price) && price >= 0 ? price : null
}

export function parseFlavorPricesMap(value) {
  if (!value) return {}

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([flavor, entry]) => {
          const flavorName = String(flavor || '').trim()
          if (!flavorName) return null

          if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            return [
              flavorName,
              {
                readyPrice: toNullablePrice(entry.readyPrice ?? entry.ready_price ?? entry.basePrice),
                preorderPrice: toNullablePrice(
                  entry.preorderPrice ?? entry.preorder_price,
                ),
              },
            ]
          }

          const price = toNullablePrice(entry)
          return [flavorName, { readyPrice: price, preorderPrice: price }]
        })
        .filter(Boolean),
    )
  } catch {
    return {}
  }
}

export function serializeFlavorPrices(value) {
  const prices = parseFlavorPricesMap(value)
  return Object.keys(prices).length > 0 ? JSON.stringify(prices) : null
}

export function getFlavorPrice(value, flavor, type, fallback) {
  const flavorKey = String(flavor || '').trim().toLowerCase()
  if (!flavorKey) return Number(fallback) || 0

  const prices = parseFlavorPricesMap(value)
  const entry = Object.entries(prices).find(
    ([name]) => name.trim().toLowerCase() === flavorKey,
  )?.[1]
  const price = type === 'preorder' ? entry?.preorderPrice : entry?.readyPrice

  return price == null ? Number(fallback) || 0 : Number(price)
}
