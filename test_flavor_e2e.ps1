# test_flavor_e2e.ps1 - End-to-End Flavor Stock Deduction Test

$API_BASE = "http://localhost:3001/api"
$TEST_USER_ID = 9

Write-Host "`n=== Flavor Stock Deduction E2E Test ===" -ForegroundColor Cyan

try {
    # Get product 19 before test
    Write-Host "`n[1] Get product 19 (before test)" -ForegroundColor Yellow
    $products = Invoke-RestMethod -Uri "$API_BASE/products/public"
    $prod19Before = $products | Where-Object { $_.id -eq 19 } | Select-Object -First 1
    Write-Host "Product 19 stock before: $($prod19Before.stock)" -ForegroundColor Green
    Write-Host "Flavors: $($prod19Before.flavors -join ', ')"

    # Check cart
    Write-Host "`n[2] Check cart" -ForegroundColor Yellow
    $cartBefore = Invoke-RestMethod -Uri "$API_BASE/cart?user_id=$TEST_USER_ID"
    Write-Host "Cart items: $($cartBefore.Count)" -ForegroundColor Green

    # Clear old items
    if ($cartBefore.Count -gt 0) {
        Write-Host "`n[3] Clear old cart items" -ForegroundColor Yellow
        foreach ($item in $cartBefore) {
            Invoke-RestMethod -Uri "$API_BASE/cart/$($item.cart_id)" -Method Delete | Out-Null
        }
        Write-Host "Cleared"
    }

    # Add product 19 to cart
    Write-Host "`n[4] Add prod_id 19 x2 (flavor=t)" -ForegroundColor Yellow
    $addBody = @{
        user_id = $TEST_USER_ID
        prod_id = 19
        qty = 2
        flavor = "t"
        item_type = "ready-to-ship"
    } | ConvertTo-Json
    $cartResp = Invoke-RestMethod -Uri "$API_BASE/cart" -Method Post -Body $addBody -ContentType "application/json"
    Write-Host "cart_id: $($cartResp.cart_id)"

    # Checkout
    Write-Host "`n[5] Checkout" -ForegroundColor Yellow
    $checkoutBody = @{
        user_id = $TEST_USER_ID
        items = @(@{ cart_id = $cartResp.cart_id })
    } | ConvertTo-Json -Depth 5
    $checkoutResp = Invoke-RestMethod -Uri "$API_BASE/orders/checkout" -Method Post -Body $checkoutBody -ContentType "application/json"
    $orderId = $checkoutResp.order_id
    Write-Host "order_id: $orderId" -ForegroundColor Green

    # Payment
    Write-Host "`n[6] Payment" -ForegroundColor Yellow
    $paymentBody = @{
        payment_method = "bank_transfer"
        shipping_name = "Test"
        shipping_phone = "081"
        shipping_address = "Test"
        notes = "Test"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$API_BASE/orders/$orderId/payment" -Method Post -Body $paymentBody -ContentType "application/json" | Out-Null
    Write-Host "Payment done" -ForegroundColor Green

    # Check product 19 after
    Write-Host "`n[7] Get product 19 (after test)" -ForegroundColor Yellow
    $products = Invoke-RestMethod -Uri "$API_BASE/products/public"
    $prod19After = $products | Where-Object { $_.id -eq 19 } | Select-Object -First 1
    Write-Host "Product 19 stock after: $($prod19After.stock)" -ForegroundColor Green

    # Result
    Write-Host "`n[8] Result" -ForegroundColor Yellow
    $expected = $prod19Before.stock - 2
    if ($prod19After.stock -eq $expected) {
        Write-Host "PASSED: $($prod19Before.stock) -> $($prod19After.stock) (diff -2)" -ForegroundColor Green
    } else {
        Write-Host "FAILED: expected $expected but got $($prod19After.stock)" -ForegroundColor Red
    }

} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nComplete" -ForegroundColor Cyan
