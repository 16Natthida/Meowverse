// test_flavor_deduction.js - End-to-end test for flavor-specific stock deduction

const API_BASE = 'http://localhost:3001/api'
const TEST_USER_ID = 9 // ใช้ user ที่มีอยู่

async function log(msg, data = null) {
  console.log(`\n[${new Date().toISOString()}] ${msg}`)
  if (data) console.log(JSON.stringify(data, null, 2))
}

async function test() {
  try {
    // 1. ดึงข้อมูล product 19 ก่อนทดสอบ
    await log('1. ดึง product 19 (ก่อนทดสอบ)')
    let res = await fetch(`${API_BASE}/products/public`)
    let products = await res.json()
    const prod19Before = products.find((p) => p.id === 19)
    await log(`Product 19 stock ก่อน: ${prod19Before.stock}`, { flavors: prod19Before.flavors })

    // 2. ตรวจสอบตะกร้าปัจจุบัน
    await log('2. ตรวจสอบตะกร้า user')
    res = await fetch(`${API_BASE}/cart?user_id=${TEST_USER_ID}`)
    let cartBefore = await res.json()
    await log(`ตะกร้าเดิม: ${cartBefore.length} items`)

    // 3. ลบสินค้าเดิมออกจากตะกร้า (เพื่อให้ test สะอาด)
    if (cartBefore.length > 0) {
      await log('3. ลบสินค้าเดิมออกจากตะกร้า')
      for (const item of cartBefore) {
        await fetch(`${API_BASE}/cart/${item.cart_id}`, { method: 'DELETE' })
      }
      await log('ลบเสร็จ')
    }

    // 4. เพิ่มสินค้า 19 ลงตะกร้า (ready-to-ship, flavor='t', qty=2)
    await log('4. เพิ่ม prod_id 19 x2 (flavor="t", ready-to-ship) ลงตะกร้า')
    res = await fetch(`${API_BASE}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        prod_id: 19,
        qty: 2,
        flavor: 't',
        item_type: 'ready-to-ship',
      }),
    })
    const cartResponse = await res.json()
    await log('เพิ่มตะกร้า response', cartResponse)

    // 5. ทำการ checkout
    await log('5. ทำการ checkout')
    res = await fetch(`${API_BASE}/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        items: [
          {
            cart_id: cartResponse.cart_id || 1,
          },
        ],
      }),
    })
    const checkoutResponse = await res.json()
    const orderId = checkoutResponse.order_id
    await log(`Checkout สำเร็จ: order_id=${orderId}`, checkoutResponse)

    // 6. ทำการ payment
    await log('6. ทำการ payment')
    res = await fetch(`${API_BASE}/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_method: 'bank_transfer',
        shipping_name: 'Test User',
        shipping_phone: '0812345678',
        shipping_address: 'Test Address',
        notes: 'Test payment',
      }),
    })
    const paymentResponse = await res.json()
    await log('Payment สำเร็จ', paymentResponse)

    // 7. ดึงข้อมูล product 19 หลังทดสอบ
    await log('7. ดึง product 19 (หลังทดสอบ)')
    res = await fetch(`${API_BASE}/products/public`)
    products = await res.json()
    const prod19After = products.find((p) => p.id === 19)
    await log(`Product 19 stock หลัง: ${prod19After.stock}`, { flavors: prod19After.flavors })

    // 8. ตรวจสอบผล
    const expectedStock = prod19Before.stock - 2
    if (prod19After.stock === expectedStock) {
      await log(
        `✅ TEST PASSED: stock ลดจาก ${prod19Before.stock} เป็น ${prod19After.stock} (ลด 2 ชิ้น)`,
      )
    } else {
      await log(`❌ TEST FAILED: stock ควรเป็น ${expectedStock} แต่ได้ ${prod19After.stock}`)
    }
  } catch (err) {
    console.error('Error:', err.message)
    if (err.response) {
      console.error('Response:', await err.response.text())
    }
  }
}

test()
