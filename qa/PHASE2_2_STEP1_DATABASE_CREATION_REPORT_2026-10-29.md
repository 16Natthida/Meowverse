# Meowverse QA Phase 2.2 — Step 1 Test Database Creation Report

วันที่ตรวจสอบ: 2026-10-29 (Asia/Bangkok)  
สถานะ: **COMPLETED — EMPTY TEST DATABASE EXISTS; BOOTSTRAP NOT RUN**

## ขอบเขตที่ดำเนินการ

- อ่านรายงาน Phase 2.1 และ SQL Safety Review ที่จัดทำไว้ก่อนหน้า
- ตรวจสถานะ Local MariaDB และฐานข้อมูลแบบ Read-only
- ตรวจป้องกันการสร้าง `meowverse_test` ซ้ำ
- ตรวจว่า `meowverse` เดิมยังอยู่
- ตรวจไฟล์ Full Schema Bootstrap แบบ Static เท่านั้น
- ไม่รัน Bootstrap, Seed, Migration หรือ Backend

## ประวัติและสถานะก่อนตรวจซ้ำ

จากการดำเนินงานช่วงก่อน Usage Limit ได้รันคำสั่งเปลี่ยนแปลงฐานข้อมูลเพียงคำสั่งเดียว:

```sql
CREATE DATABASE `meowverse_test`;
```

คำสั่งดังกล่าวรันกับ Local MariaDB ที่ `127.0.0.1:3306` และสำเร็จโดย exit code 0 จากนั้นการตรวจรอบปัจจุบันพบ directory `C:\xampp\mysql\data\meowverse_test` มีเวลาแก้ไขล่าสุด `2026-10-29 16:30:53` ซึ่งสอดคล้องกับการสร้างก่อนหน้า

## ผลตรวจสถานะล่าสุด

MariaDB ที่ใช้ตรวจ:

- Host/Port: `DESKTOP-U6JJF57:3306` ผ่าน `127.0.0.1:3306`
- Version: `10.4.32-MariaDB`
- Base directory: `C:\xampp\mysql`
- Data directory: `C:\xampp\mysql\data`

ผลจาก `information_schema`:

| รายการ | ผล |
|---|---:|
| `meowverse` มีอยู่ | Yes (`1`) |
| `meowverse_test` มีอยู่ | Yes (`1`) |
| จำนวน Base Tables ใน `meowverse` | `23` |
| จำนวน Base Tables ใน `meowverse_test` | `0` |
| Estimated rows ใน `meowverse_test` | `0` |

เนื่องจากพบ `meowverse_test` อยู่แล้ว จึง **ไม่ได้รัน `CREATE DATABASE` ซ้ำ** ในการดำเนินงานรอบนี้

การตรวจนี้ไม่เขียน แก้ไข หรือลบข้อมูลใน `meowverse` และจำนวนตารางของฐานเดิมยังคงเป็น 23 ตารางตาม baseline ในรายงาน Phase 2.1

## Full Schema Bootstrap Static Review

ไฟล์ที่ตรวจ: `qa/PHASE2_BOOTSTRAP_SCHEMA_2026-10-29.sql`

| รายการตรวจ | ผล |
|---|---:|
| `CREATE TABLE` | `22` |
| Foreign Keys | `13` |
| `CREATE DATABASE` | `0` |
| `USE` | `0` |
| Qualified `meowverse.*` | `0` |
| Qualified `meowverse_test.*` | `0` |
| `DROP` / `TRUNCATE` / `DELETE` / `UPDATE` / `ALTER` / `INSERT` | `0` |

`cart.user_id` ใช้ Foreign Key ที่แก้แล้วไปยัง `accounts(user_id)` และ `cart.prod_id` ไปยัง `products(prod_id)`

### ข้อควรระวังเรื่อง Target Database

ไฟล์ Bootstrap ใช้ชื่อตารางและ Foreign Key แบบไม่ระบุ schema และไม่มี `USE meowverse_test` ดังนั้นไฟล์ **ไม่ได้บังคับ target ด้วยตัวเอง** ว่าจะทำงานเฉพาะใน `meowverse_test`

การรันจะปลอดภัยต่อ `meowverse` ก็ต่อเมื่อ client ถูกผูกกับฐานทดสอบอย่างชัดเจนด้วย `--database=meowverse_test` และมี preflight ยืนยัน `SELECT DATABASE()` ก่อน execute เท่านั้น ห้ามรันไฟล์ใน session ที่เลือก `meowverse` หรือไม่ทราบ current database

## สิ่งที่ไม่ได้ดำเนินการ

- ไม่รัน Full Schema Bootstrap
- ไม่สร้างตารางทั้ง 22 ตาราง
- ไม่ Seed ข้อมูลหรือสร้างบัญชี QA
- ไม่รัน Migration
- ไม่แก้ Source Code หรือไฟล์ `.env`
- ไม่เปิดหรือ Restart Backend
- ไม่รัน `DROP`, `TRUNCATE`, `DELETE`, `UPDATE` หรือ `ALTER`
- ไม่เปลี่ยนข้อมูลใน `meowverse`

## ขั้นตอนต่อไปที่เสนอ — ต้องได้รับอนุมัติใหม่

1. เปิด Local MariaDB และยืนยัน `127.0.0.1:3306`
2. ตรวจ `meowverse_test` มีอยู่และยังมี `0` ตาราง
3. เปิด connection โดยระบุ `--database=meowverse_test` อย่างชัดเจน
4. รัน `SELECT DATABASE()` และต้องได้ `meowverse_test`; หากไม่ตรงให้หยุดทันที
5. รันเฉพาะ `qa/PHASE2_BOOTSTRAP_SCHEMA_2026-10-29.sql` เพื่อสร้าง 22 ตาราง
6. ตรวจจำนวนตาราง, Primary Keys, Foreign Keys และ Index ด้วย `information_schema`
7. ตรวจยืนยัน `meowverse` ยังคงมี 23 ตารางและไม่ได้รับผลกระทบ
8. หยุดก่อน Seed, Migration, Backend หรือการสร้างบัญชี QA และขออนุมัติแยกอีกครั้ง

## Approval Gate

สถานะปัจจุบันพร้อมสำหรับการพิจารณา **Phase 2.2 Step 2 — Bootstrap 22 Tables** แต่ยังไม่ได้รับอนุญาตให้ execute การสร้างตาราง

