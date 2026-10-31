# Static Review Notes

## Architecture and data flow checked

- Frontend auth state: `src/composables/useAuth.js` + `src/utils/authFetch.js`
- Router role guards: `src/router/index.js`
- API default-deny access table: `server/auth.js`
- Cart/checkout/order price source: `server/cart.js`, `server/order.js`, `server/productPricing.js`
- China shipping allocation: `server/chinaShipping.js`
- Import fee persistence: `server/index.js` (`order_details.Import_fee` → `orders.import_fee_total`)
- Payment status cascade: `server/index.js` (`payment` → `orders.status`)

## Positive controls observed

- `/api` uses `authorizeApiRequest` with default-deny behavior; unauthenticated payment/product/admin requests returned 401/403 in automated checks.
- User ownership is enforced for cart/order routes through `requireOwnership` and `enforceOwnUserId`.
- Checkout preview calculates prices from backend product/cart data rather than trusting a frontend price field.
- Vite production build completed with `npx vite build --debug`.

## Code-quality findings from targeted Oxlint

These are not reported as functional failures without a scenario, but should be cleaned up:

- `server/order.js:177`: unused `getFlavorList` function.
- `src/utils/printOrder.js:267`: unnecessary `details || {}` spread fallback.
- `src/views/Admin/AdminProductCategoryView.vue:240`: unnecessary quote escapes.
- `server/index.js:4732`: sparse array literal in `shippingLockedStatuses` (`[,, 'Paid', ...]`). It is harmless for `includes()` but obscures intent and should be a normal array.

Full-project lint was not used as a quality gate because it scans generated Playwright HTML/trace assets under `qa-report`; targeted ESLint over `src server qa-tests` completed without reported errors, while Oxlint reported the four source findings above.
