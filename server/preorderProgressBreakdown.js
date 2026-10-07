export function aggregatePreorderFlavorBreakdown(rows, roundId, productId, configuredVariants = []) {
  const orderedByVariant = new Map()
  const hasVariants = configuredVariants.length > 0
  for (const row of rows) {
    const flavorName = String(row.flavor ?? '').trim()
    const variantKey = flavorName ? `variant:${flavorName}` : '__no_variant__'
    const existing = orderedByVariant.get(variantKey)
    orderedByVariant.set(variantKey, {
      variantKey,
      name: flavorName || (hasVariants ? 'ไม่ระบุรสชาติ' : 'ไม่มีตัวเลือก'),
      totalQty: (existing?.totalQty || 0) + (Number(row.qty) || 0),
    })
  }

  const flavors = []
  const catalogKeys = new Set()
  for (const value of configuredVariants) {
    const name = String(value || '').trim()
    if (!name) continue
    const variantKey = `variant:${name}`
    if (catalogKeys.has(variantKey)) continue
    catalogKeys.add(variantKey)
    const ordered = orderedByVariant.get(variantKey)
    flavors.push({ variantKey, name, totalQty: ordered?.totalQty || 0 })
    orderedByVariant.delete(variantKey)
  }

  // Keep historical choices that no longer appear in the current product catalog,
  // using the exact flavor snapshot stored on the preorder order line.
  flavors.push(...orderedByVariant.values())
  return {
    roundId,
    productId,
    flavorCount: flavors.length,
    totalQty: flavors.reduce((sum, flavor) => sum + flavor.totalQty, 0),
    flavors,
  }
}
