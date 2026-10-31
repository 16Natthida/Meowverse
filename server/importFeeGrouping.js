const PACK_SIZE_UNITS = new Map([
  ['ซอง', 'ซอง'],
  ['ชิ้น', 'ชิ้น'],
  ['แพ็ก', 'แพ็ก'],
  ['แพค', 'แพ็ก'],
  ['แพ็ค', 'แพ็ก'],
  ['กล่อง', 'กล่อง'],
  ['กระป๋อง', 'กระป๋อง'],
  ['เม็ด', 'เม็ด'],
  ['pcs', 'ชิ้น'],
  ['pc', 'ชิ้น'],
  ['pieces', 'ชิ้น'],
  ['piece', 'ชิ้น'],
  ['packs', 'แพ็ก'],
  ['pack', 'แพ็ก'],
])

function parseFlavorList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {
    // Fall back to line/comma separated input.
  }
  return text.split(/\r?\n|,/).map((item) => String(item || '').trim()).filter(Boolean)
}

// A flavor label is only treated as a pack size when it contains an explicit
// quantity and a known unit. Plain labels such as "1", "2", "3" remain
// flavors because the number alone is not enough evidence.
export function parseStructuredPackSize(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s]+)$/i)
  if (!match) return null
  const unit = PACK_SIZE_UNITS.get(match[2].toLowerCase())
  if (!unit) return null
  return `${match[1].replace(',', '.')} ${unit}`
}

export function resolvePackSize(packSize, productFlavors, flavor) {
  const explicit = String(packSize ?? '').trim()
  if (explicit) return { value: parseStructuredPackSize(explicit) || explicit, source: 'order_detail' }

  const options = parseFlavorList(productFlavors)
  if (options.length < 2) return { value: null, source: 'unspecified' }

  const parsedOptions = options.map(parseStructuredPackSize)
  if (parsedOptions.some((value) => !value) || new Set(parsedOptions).size !== parsedOptions.length) {
    return { value: null, source: 'unspecified' }
  }

  const flavorKey = String(flavor ?? '').trim().toLowerCase()
  const optionIndex = options.findIndex((option) => option.toLowerCase() === flavorKey)
  if (optionIndex < 0) return { value: null, source: 'unspecified' }
  return { value: parsedOptions[optionIndex], source: 'product_flavor_label' }
}

export function normalizeImportFeePackSize(value) {
  const normalized = String(value ?? '').trim()
  return normalized || '__unspecified__'
}

export function buildImportFeeGroupKey(prodId, packSize, status, feeSegment) {
  return [prodId, normalizeImportFeePackSize(packSize), String(status || 'Arrived'), feeSegment]
    .map((value) => String(value).trim().toLowerCase())
    .join('|')
}

// Allocate integer satang using largest remainders. This guarantees that the
// detail rows always add up to the exact admin-entered group total.
export function allocateImportFeeCents(totalAmount, rows) {
  const totalCents = Math.max(Math.round((Number(totalAmount) || 0) * 100), 0)
  const totalQty = rows.reduce((sum, row) => sum + Math.max(Number(row.qty) || 0, 0), 0)
  const allocations = new Map()
  if (totalQty <= 0 || rows.length === 0) return allocations

  let allocatedCents = 0
  const remainders = rows.map((row) => {
    const numerator = totalCents * Math.max(Number(row.qty) || 0, 0)
    const baseCents = Math.floor(numerator / totalQty)
    allocatedCents += baseCents
    allocations.set(row.detail_id, baseCents)
    return { detailId: row.detail_id, remainder: numerator % totalQty }
  })

  const remainderCents = totalCents - allocatedCents
  remainders
    .sort((a, b) => b.remainder - a.remainder || Number(a.detailId) - Number(b.detailId))
    .slice(0, remainderCents)
    .forEach(({ detailId }) => allocations.set(detailId, allocations.get(detailId) + 1))

  return allocations
}
