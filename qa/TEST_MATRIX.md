# Test Matrix

| ID | Area | Type | Status | Automated coverage |
|---|---|---|---|---|
| AUTH-01 | Admin login | E2E read-only | BLOCKED | `blocked-e2e.spec.js` |
| AUTH-02 | User login | E2E read-only | BLOCKED | `blocked-e2e.spec.js` |
| AUTH-03 | Unauthenticated route guard | Browser/static | PARTIAL: `/cart` router guard failed, component guard observed | `surface.spec.js`, `static-review.spec.js` |
| PRODUCT-01 | Product list/price/flavor | Browser/API | BLOCKED | test account + safe dataset required |
| PRODUCT-02 | Product CRUD/status/stock | Mutation | NOT TESTED | intentionally not executed |
| CART-01 | Cart read/quantity/remove | Mutation | NOT TESTED | intentionally not executed |
| PREORDER-01 | Round/product/minimum qty | Read-only + DB | BLOCKED | test DB required |
| READY-01 | Ready-to-ship | Read-only + DB | BLOCKED | test DB required |
| ORDER-01 | Checkout preview | Read-only | BLOCKED | user login + test cart required |
| ORDER-02 | Create order | Mutation | NOT TESTED | prohibited by user instruction |
| PAYMENT-01 | Payment amount reconciliation | Code/API | BLOCKED | test order + test DB required |
| PAYMENT-02 | Slip upload/approval/rejection | Mutation | NOT TESTED | no upload/approval executed |
| FEE-01 | Import fee allocation | Code/API | BLOCKED | test order + test DB required |
| STOCK-01 | Inventory intake/shortage | Mutation | NOT TESTED | no stock mutation executed |
| REPORT-01 | Admin dashboard/reports | Read-only | BLOCKED | admin login + test DB required |
| SEC-API-001 | Unauthenticated API access | API | PASSED | `security.spec.js` |
| CALC-001 | Flavor price selection | Unit | PASSED | `calculation.spec.js` |
| CALC-002 | China shipping rounding | Unit | FAILED | `calculation.spec.js` |
