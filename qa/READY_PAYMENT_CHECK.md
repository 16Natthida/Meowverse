# Ready-to-ship payment focused check

Date: 2026-10-29

## Result

- The real payment path was not submitted. No account, order, slip, or payment mutation was used.
- Unauthenticated Playwright API checks returned `401 TOKEN_MISSING` for the payment endpoint and related protected endpoints.
- Backend static review confirms `Ready` payment is recorded as `Ready pay`, requires a slip, and permits only `Pending` / `Invalid slip` order states.
- A frontend defect was reproduced by the focused static test: `ReadyPayment.vue` normalizes status to lower case and spaces, but `isShippingLocked` and `isCancellable` compare against `Slip_submitted` instead of `slip submitted`.

## Likely impact

An order whose status is `Slip_submitted` may not be treated as locked/cancellable consistently in the UI. This is a confirmed UI-state bug, but it does not by itself prove that the first payment upload fails.

## Main payment path reviewed

1. User opens `/ready-payment/:orderId`.
2. Frontend sends `POST /api/orders/:order_id/payment` as multipart form data with field `slip`.
3. Backend rejects requests without a slip, checks the order, calculates `Ready pay`, inserts a pending payment, and changes the order to `Slip_submitted`.

## Test evidence

- `qa-tests/ready-payment-review.spec.js`
- `qa-tests/ready-payment-mocked.spec.js` (mocked browser flow passed)
- `qa-tests/security.spec.js`
- Focused run: 17 tests, 16 passed, 1 failed. The single failure is intentional evidence for `READY-PAY-002`.
