# Meowverse QA Phase 2 — Test Coverage Matrix

วันที่จัดทำ: 2026-10-29  
สถานะปัจจุบัน: **Test execution blocked until `meowverse_test` and verified QA accounts exist**  
หลักการ: ห้ามตั้งเป็น Passed หากยังไม่ได้ทดสอบจริง

## Environment gate

| ID | Area | Preconditions | Test objective | Current status |
|---|---|---|---|---|
| ENV-001 | Test DB isolation | Backend points to `meowverse_test` | Verify live DB binding is test DB | Blocked |
| ENV-002 | Schema baseline | Approved schema + migrations | Verify required tables/columns/indexes/FKs | Blocked; `accounts.address` missing in current DB |
| ENV-003 | Synthetic seed | QA-only seed loaded | Verify categories/products/flavors/round/stock fixtures | Blocked |
| ENV-004 | QA accounts | Admin, User A, User B credentials | Verify accounts are test-only and usable | Blocked |

## Authentication / Session

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| AUTH-001 | Login as QA Admin | Redirect to admin home; role is admin | Blocked |
| AUTH-002 | Login as QA User A | Redirect to user dashboard; role is user | Blocked |
| AUTH-003 | Login as QA User B | Redirect to user dashboard; distinct identity from User A | Blocked |
| AUTH-004 | Invalid login / empty fields | Validation/error; no session created | Phase 1 Passed with dummy credentials |
| AUTH-005 | Remember me | Correct local/session storage and TTL behavior | Blocked |
| AUTH-006 | Logout | Session/token invalidated; protected route returns to login | Blocked |
| AUTH-007 | Logout all / token revocation | Existing token rejected after revocation | Blocked |

## Permissions / Route Guard / API ownership

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| PERM-001 | User opens admin UI routes | Redirect/403; no admin data rendered | Blocked |
| PERM-002 | Admin opens user pages | Allowed only where specified; no privilege regression | Blocked |
| PERM-003 | User calls admin API | 401/403; no data mutation | Blocked |
| PERM-004 | User A reads User B cart/order/profile | Denied by ownership guard | Blocked |
| PERM-005 | Missing/expired/revoked JWT | 401 and safe redirect | Blocked |

## Product / Category / Flavor Pricing

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| PROD-001 | Browse categories and active toggle | Only active categories appear to users | Blocked |
| PROD-002 | Read ready-to-ship products | Product, stock, image, flavor and price are consistent | Blocked |
| PROD-003 | Read preorder products | Active round and minimum quantity are shown correctly | Blocked; no active round currently |
| PROD-004 | Flavor-specific pricing | Ready/preorder flavor prices map to selected flavor | Blocked |
| PROD-005 | Product/category permissions | User cannot access admin write actions | Blocked |
| PROD-006 | Public product API | Public API and UI show the same eligible set | API 200 observed; UI execution blocked |

## Cart / Checkout

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| CART-001 | Read User A cart | Only own cart items shown | Blocked |
| CART-002 | Quantity boundary/read-only preview | Invalid quantity rejected; totals recalculate | Blocked |
| CART-003 | Flavor/round cart identity | Different flavor/round items remain distinct | Blocked |
| CHECKOUT-001 | Checkout preview | Correct product, China shipping, import fee and total; no order commit | Blocked |
| CHECKOUT-002 | Empty/out-of-stock checkout | Safe validation; no partial write | Blocked |

## Preorder / Ready-to-Ship / Orders

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| FLOW-001 | Ready-to-ship product flow | Stock reservation/total follows fixture rules | Blocked |
| FLOW-002 | Preorder minimum quantity | Below minimum is rejected or clearly explained | Blocked; active round missing |
| FLOW-003 | Order list filters | Ready/preorder tabs and status filters match API | Blocked |
| FLOW-004 | Admin order management read-only | Admin can view/filter without mutation | Blocked |
| FLOW-005 | Order ownership | User sees only own orders; admin scope is intentional | Blocked |

## Payment / Slip / Shipping / Import Fee

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| PAY-001 | Read payment channels | Active QR/bank channels render safely | Blocked; current public QR response is protected and table has 0 rows |
| PAY-002 | Slip upload validation | Type/size/content validation; no write in read-only phase | Not Tested |
| PAY-003 | Payment status permissions | User cannot approve/reject; admin action is audited | Not Tested |
| SHIP-001 | China shipping calculation | Fee breakdown matches product/flavor/quantity | Blocked |
| SHIP-002 | Import fee read-only display | Admin/user totals agree with DB fixtures | Blocked |
| SHIP-003 | Shipping provider/tracking display | Active provider and tracking link render correctly | Blocked |

## Stock / Inventory / Dashboard / Reports

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| STOCK-001 | Product stock read-only | Stock and flavor stock are consistent | Blocked |
| STOCK-002 | Inventory intake read-only | Expected/received/missing quantities are consistent | Blocked |
| STOCK-003 | Missing items report | Report matches order detail data | Blocked |
| DASH-001 | User dashboard | KPIs, categories and recommendations load | Blocked |
| DASH-002 | Admin dashboard | KPI totals match read-only DB aggregates | Blocked |
| DASH-003 | Reports/export | Exported values match displayed filters | Not Tested |

## API / Database Integrity / Observability

| ID | Test case | Expected result | Current status |
|---|---|---|---|
| API-001 | Health and public GETs | HTTP 200 and valid response shapes | Read-only probe Passed for health/categories/ready-to-ship/settings |
| API-002 | Protected GETs without token | 401/403 and no data leakage | Read-only probe Passed for cart/orders/qrcodes |
| API-003 | Console errors | No unexpected app errors | Blocked for authenticated pages; Phase 1 found router warning |
| API-004 | Network errors | No unexpected 4xx/5xx on valid read-only flows | Blocked |
| DB-001 | Schema drift | Required migration columns/tables exist | Failed for current DB: `accounts.address` missing |
| DB-002 | Referential integrity | No orphan cart/order/image references | Failed: 1 cart-product, 3 order-detail-product, 45 product-image orphans |
| DB-003 | No mutation guard | Read-only run does not change row counts | Ready to verify after test DB exists |

## Execution rule

Authenticated UI testing may begin only after the environment report is marked READY and the live connection check shows `meowverse_test`. Mutation cases (cart writes, checkout, slip upload, status changes, inventory, import fee) remain disabled until separately approved.

