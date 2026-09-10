function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatMoney(value) {
  return `฿${numberValue(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveImageUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) return url
  return `/${url}`
}

function normalizeItems(order) {
  const items = order?.items || order?.order_details || order?.details || []
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const quantity = numberValue(item.qty ?? item.quantity)
    const unitPrice = numberValue(item.unit_price ?? item.Price ?? item.price)
    const flavor = String(item.flavor || item.variant || '').trim()

    return {
      name: item.name || item.prod_name || item.product_name || 'สินค้า',
      flavor,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    }
  })
}

function renderPrintDocument(printWindow, order, logoUrl = '') {
  const items = normalizeItems(order)
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const total = order?.total_amount != null ? numberValue(order.total_amount) : subtotal
  const shipping = order?.saved_shipping || order?.shipping || {}
  const customerName =
    order?.full_name ||
    order?.customer_name ||
    shipping.name ||
    order?.name ||
    order?.username ||
    '-'
  const phone = order?.phone_number || order?.phone || shipping.phone || '-'
  const address = order?.address || order?.shipping_address || shipping.address || '-'
  const itemRows = items.length
    ? items
        .map(
          (item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.flavor ? `<small>${escapeHtml(item.flavor)}</small>` : ''}
              </td>
              <td class="number">${item.quantity.toLocaleString('th-TH')}</td>
              <td class="number">${formatMoney(item.unitPrice)}</td>
              <td class="number">${formatMoney(item.total)}</td>
            </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="empty">ไม่พบรายการสินค้า</td></tr>'

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
    <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ใบออเดอร์ #${escapeHtml(order?.order_id || '')} - Meowverse</title>
        <style>
          @page { size: A4; margin: 12mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #33264f;
            background: #fff;
            font-family: Arial, "Tahoma", sans-serif;
            font-size: 14px;
          }
          .sheet {
            width: 100%;
            max-width: 186mm;
            min-height: 273mm;
            margin: 0 auto;
            padding: 3mm;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            padding: 4px 0 18px;
            border-bottom: 3px solid #7654ad;
          }
          .brand { display: flex; align-items: center; color: #4f347e; font-size: 27px; font-weight: 800; letter-spacing: -0.3px; }
          .brand img { width: 40px; height: 40px; margin-right: 9px; object-fit: contain; }
          .subtitle { margin-top: 5px; color: #8b7ba3; font-size: 13px; }
          .order-meta { min-width: 42mm; padding: 10px 12px; border-radius: 10px; background: #f4edff; text-align: right; }
          .order-meta strong { display: block; color: #4f347e; font-size: 18px; }
          .order-meta span { display: block; margin-top: 4px; color: #76698b; font-size: 12px; }
          .section { margin-top: 22px; }
          .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 10px;
            color: #4f347e;
            font-size: 16px;
            font-weight: 800;
          }
          .section-title::before { content: ""; display: block; width: 5px; height: 19px; border-radius: 5px; background: #a66de6; }
          .customer-box {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px 24px;
            padding: 16px 18px;
            border: 1px solid #e6daf5;
            border-radius: 13px;
            background: linear-gradient(135deg, #fcfaff, #f8f2ff);
          }
          .field label { display: block; margin-bottom: 5px; color: #8b7ba3; font-size: 11px; font-weight: 700; }
          .field strong { display: block; color: #40315a; overflow-wrap: anywhere; line-height: 1.45; }
          .field--address { grid-column: 1 / -1; }
          table { width: 100%; overflow: hidden; border: 1px solid #e6daf5; border-radius: 13px; border-collapse: separate; border-spacing: 0; }
          th, td { padding: 11px 10px; border-bottom: 1px solid #eee7f7; text-align: left; vertical-align: top; }
          th { background: #7654ad; color: #fff; font-size: 11px; letter-spacing: 0.2px; }
          th:first-child { border-top-left-radius: 12px; }
          th:last-child { border-top-right-radius: 12px; }
          tbody tr:nth-child(even) td { background: #fcfaff; }
          tbody tr:last-child td { border-bottom: 0; }
          td strong { color: #40315a; }
          td small { display: block; margin-top: 4px; color: #887b9a; font-size: 11px; }
          .number { text-align: right; white-space: nowrap; }
          .empty { padding: 24px 8px; color: #8b7ba3; text-align: center; }
          .summary-area { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-top: 20px; }
          .summary-stats { display: flex; gap: 10px; }
          .summary-stat { min-width: 30mm; padding: 9px 11px; border: 1px solid #e6daf5; border-radius: 10px; background: #faf7ff; }
          .summary-stat span { display: block; color: #8b7ba3; font-size: 10px; }
          .summary-stat strong { display: block; margin-top: 4px; color: #4f347e; font-size: 15px; }
          .totals { width: 68mm; padding: 13px 15px; border-radius: 12px; background: #f4edff; }
          .total-row { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
          .total-row span { color: #6f5a89; font-weight: 700; }
          .total-row strong { color: #4f347e; font-size: 20px; text-align: right; white-space: nowrap; }
          .note { margin: 34px 0 0; color: #8b7ba3; font-size: 11px; text-align: center; }
          @media print { .sheet { max-width: none; } }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="header">
            <div>
              <div class="brand">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : '🐱'} Meowverse</div>
              <div class="subtitle">ใบสรุปรายการสั่งซื้อ</div>
            </div>
            <div class="order-meta">
              <strong>ออเดอร์ #${escapeHtml(order?.order_id || '-')}</strong>
              <span>${escapeHtml(formatDate(order?.Order_date || order?.order_date))}</span>
            </div>
          </header>

          <section class="section">
            <h2 class="section-title">ข้อมูลลูกค้า</h2>
            <div class="customer-box">
              <div class="field"><label>ชื่อลูกค้า</label><strong>${escapeHtml(customerName)}</strong></div>
              <div class="field"><label>เบอร์ติดต่อ</label><strong>${escapeHtml(phone)}</strong></div>
              <div class="field field--address"><label>ที่อยู่จัดส่ง</label><strong>${escapeHtml(address)}</strong></div>
            </div>
          </section>

          <section class="section">
            <h2 class="section-title">รายการสินค้า</h2>
            <table>
              <thead><tr><th>สินค้า</th><th class="number">จำนวน</th><th class="number">ราคาต่อชิ้น</th><th class="number">รวม</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
          </section>

          <section class="summary-area">
            <div class="summary-stats">
              <div class="summary-stat"><span>รายการสินค้า</span><strong>${items.length.toLocaleString('th-TH')} รายการ</strong></div>
              <div class="summary-stat"><span>จำนวนชิ้น</span><strong>${totalQuantity.toLocaleString('th-TH')} ชิ้น</strong></div>
            </div>
            <div class="totals">
              <div class="total-row"><span>ยอดรวม</span><strong>${formatMoney(total)}</strong></div>
            </div>
          </section>
          <p class="note">ขอบคุณที่อุดหนุน Meowverse</p>
        </main>
      </body>
    </html>`)
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => {
    printWindow.onafterprint = () => printWindow.close()
    printWindow.print()
  }, 120)
}

export async function printOrder(order, options = {}) {
  const printWindow = window.open('', '_blank', 'width=900,height=1100')
  if (!printWindow) {
    window.alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่')
    return false
  }

  printWindow.document.write('<p style="font-family:Arial,sans-serif;padding:32px">กำลังเตรียมใบออเดอร์...</p>')
  printWindow.document.close()

  let printableOrder = order || {}
  if (typeof options.loadDetails === 'function') {
    try {
      const details = await options.loadDetails()
      printableOrder = { ...printableOrder, ...(details || {}) }
    } catch {
      // พิมพ์ข้อมูลที่มีอยู่ต่อได้ แม้โหลดรายละเอียดเพิ่มเติมไม่สำเร็จ
    }
  }

  let logoUrl = resolveImageUrl(options.logoUrl)
  if (!logoUrl) {
    try {
      const logoResponse = await fetch(options.logoEndpoint || '/api/site-settings/logo')
      if (logoResponse.ok) {
        const logoData = await logoResponse.json()
        logoUrl = resolveImageUrl(logoData?.imageUrl)
      }
    } catch {
      // ใช้ไอคอนแมวแทน หากยังไม่มีโลโก้ร้านหรือโหลดโลโก้ไม่สำเร็จ
    }
  }

  renderPrintDocument(printWindow, printableOrder, logoUrl)
  return true
}
