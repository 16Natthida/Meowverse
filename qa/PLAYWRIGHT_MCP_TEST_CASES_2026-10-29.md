# Meowverse Playwright MCP Test Cases

วันที่ทดสอบ: 2026-10-29 (Asia/Bangkok)  
Environment: `http://localhost:5173`, Playwright MCP, ไม่ใช้ Playwright Test  
ข้อจำกัด: ไม่ใช้บัญชีจริง, ไม่สร้างออเดอร์, ไม่แก้ไข Source Code, ไม่เปลี่ยนข้อมูลในฐานข้อมูล

## Scope และผลรวม

| สถานะ | จำนวน |
|---|---:|
| Passed | 8 |
| Failed | 1 |
| Blocked | 2 |
| Not Tested | 2 |

## Test Cases

| ID | รายการ | ขั้นตอนย่อ | Expected | Actual / Evidence | สถานะ |
|---|---|---|---|---|---|
| PMCP-001 | App entry redirect | เปิด `/` โดยไม่มี session | ไป `/login` | ไป `http://localhost:5173/login` สำเร็จ | Passed |
| PMCP-002 | Login page desktop | เปิด `/login`, ใช้ snapshot ตรวจ heading, fields และปุ่ม | แสดง Login UI ครบ | พบ `ชื่อผู้ใช้`, `รหัสผ่าน`, ปุ่มแสดง/ซ่อนรหัสผ่าน และ `Login` | Passed |
| PMCP-003 | Empty login validation | กด `Login` โดยไม่กรอกข้อมูล | แสดง validation และไม่เปลี่ยน route | แสดง `กรุณากรอกชื่อผู้ใช้และรหัสผ่าน` | Passed |
| PMCP-004 | Password visibility toggle | กดปุ่มแสดง/ซ่อนรหัสผ่าน | input เปลี่ยนระหว่าง `password`/`text` และ accessible label เปลี่ยน | เปลี่ยนเป็น `text`; snapshot แสดง `ซ่อนรหัสผ่าน` | Passed |
| PMCP-005 | Invalid login negative flow | ใช้ dummy `qa.invalid.user` / `NotARealPassword-2026` | ไม่เข้าสู่ระบบและแจ้ง error | อยู่ `/login`, แสดง `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง`; API ตอบ 401 ตามคาด | Passed |
| PMCP-006 | Unauthenticated Route Guard | เปิด route ผู้ใช้/แอดมินทั้งหมดที่ประกาศไว้ | ทุก route ที่ต้อง auth redirect `/login` | ผ่านทั้งหมดที่สำรวจ; รายการ route อยู่ด้านล่าง | Passed |
| PMCP-007 | Public product pages | เปิด `/products/ready-to-ship` และ `/products/preorder` โดยไม่ login | ถ้าเป็น public ต้องเห็นสินค้า | ทั้งสอง route redirect `/login`; ไม่สามารถตรวจ UI สินค้าได้ | Blocked |
| PMCP-008 | Menus, search, protected forms | เข้าหน้า dashboard/user/admin เพื่อกดเมนู ค้นหา และฟอร์ม | ตรวจ interaction ได้ | ถูก Route Guard บล็อกก่อนถึง UI | Blocked |
| PMCP-009 | Mobile responsive | resize `390x844`, เปิด `/login`, snapshot พร้อม boxes | ไม่มี horizontal overflow และ controls ใช้งานได้ | `horizontalOverflow=false`; ปุ่ม Login 270x53; มี vertical scroll ตามความสูงเนื้อหา | Passed |
| PMCP-010 | Tablet / wide responsive | resize `768x1024` และ `1440x900`, เปิด `/login` | ไม่มี horizontal overflow | ทั้งสองขนาด `horizontalOverflow=false` | Passed |
| PMCP-011 | Console / network baseline | ตรวจ console และ network ระหว่าง load/route sweep | ไม่มี unexpected console/network error | ไม่พบ console error ใน page load; พบ Vue Router deprecation warning ซ้ำ และ 401 จาก dummy login | Failed |
| PMCP-012 | Authenticated user/admin flows | ใช้ test account เพื่อเปิด dashboard, menu, product, cart, order | ตรวจ flow หลัง login | ไม่ทดสอบตามข้อจำกัดไม่ใช้บัญชีจริง | Not Tested |
| PMCP-013 | Order/payment/database mutation flows | สร้างออเดอร์, cart mutation, payment/slip, admin writes | ตรวจธุรกรรม end-to-end | ไม่ทดสอบเพื่อป้องกันการเปลี่ยนข้อมูลจริง | Not Tested |

## Route Guard Sweep

เส้นทางต่อไปนี้ถูกเปิดด้วย `browser_navigate`; ทุกเส้นทางลงท้ายที่ `/login` เมื่อไม่มี session:

`/`, `/dashboard`, `/products/ready-to-ship`, `/products/preorder`, `/cart`, `/order-list`, `/order-list/ready-to-ship`, `/order-list/preorder`, `/profile`, `/help/user`, `/preorder-payment-temp`, `/ready-payment-temp`, `/admin`, `/admin/home`, `/admin/dashboard`, `/admin/products`, `/admin/users`, `/admin/users/add`, `/admin/qrcodes`, `/admin/slips`, `/admin/orders`, `/admin/sales`, `/admin/sales/ready-to-ship`, `/admin/sales/preorder`, `/admin/inventory-intake`, `/admin/missing-items`, `/admin/import-fee`, `/admin/preorder-rounds`, `/admin/preorder-progress`, `/admin/preorder-statistics`, `/admin/unpaid-preorder-history`, `/admin/postpones`, `/admin/shipping`, `/admin/shipping-providers`, `/admin/settings`, `/admin/guide`, `/unknown-route`.

## Evidence

- [Login desktop](evidence/login-initial.png)
- [Login mobile 390x844](evidence/login-mobile-390x844.png)
- [Login wide 1440x900](evidence/login-wide-1440x900.png)
- [Route Guard: `/dashboard` redirects to Login](evidence/route-guard-dashboard-redirects-login.png)
- [Console warnings](evidence/console-warnings-2026-10-29.txt)
- [Network requests](evidence/network-requests-2026-10-29.txt)

