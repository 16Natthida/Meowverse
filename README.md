# 🌿 Git Workflow (ทำงาน 3 คน แบบแยก Branch)

## 📌 กฎหลัก

- ❌ ห้ามทำงานบน `main`
- ❌ ห้าม push ลง `main` ตรง ๆ
- ✅ ทุกคนต้องทำงานใน branch ของตัวเอง
- ✅ ก่อนเริ่มงานต้อง `pull` ทุกครั้ง

---

## 🧑‍💻 ครั้งแรก (Clone โปรเจกต์)

```bash
git clone https://github.com/16Natthida/Meowverse.git
cd Meowverse
npm install
```

---

## 🚀 เริ่มทำงาน (ทำทุกครั้งก่อนเริ่ม)

```bash
git checkout main
git pull origin main
```

---

## 🌱 สร้าง Branch ของตัวเอง (ครั้งแรกเท่านั้น)

```bash
git checkout -b feature/ชื่อฟีเจอร์
```

ตัวอย่าง:

```bash
git checkout -b feature/login
```

---

## 🔁 กลับมาทำงานใน branch ตัวเอง (วันถัดไป)

```bash
git checkout feature/ชื่อฟีเจอร์
```

---

## 🔄 อัปเดตโค้ดล่าสุดจาก main (สำคัญมาก ทำทุกวัน)

```bash
git checkout main
git pull origin main
git checkout feature/ชื่อฟีเจอร์
git merge main
```

---

## 💻 เขียนโค้ด

👉 ทำงานใน branch ของตัวเองเท่านั้น

---

## 💾 บันทึกงาน (ทำบ่อย ๆ)

```bash
git add .
git commit -m "อธิบายงานที่ทำ เช่น เพิ่มหน้า login"
```

---

## 📤 ส่งขึ้น GitHub

```bash
git push origin feature/ชื่อฟีเจอร์
```

ตัวอย่าง:

```bash
git push origin feature/login
```

---

## 🔁 ทำงานต่อ (วนลูปทุกวัน)

```bash
git pull origin main
git add .
git commit -m "update"
git push origin feature/ชื่อฟีเจอร์
```

---

## 🔚 ส่งงานเข้า main (ตอนทำเสร็จ)

```bash
git checkout main
git pull origin main
git merge feature/ชื่อฟีเจอร์
git push origin main
```

---

## ⚠️ ข้อห้าม (สำคัญมาก)

- ❌ ห้าม push main ตรง ๆ
- ❌ ห้ามแก้ไฟล์เดียวกันพร้อมกัน
- ❌ ห้ามลืม pull ก่อนทำงาน
- ❌ ห้าม merge พร้อมกันหลายคน

---

## 🔌 เชื่อมฐานข้อมูล (MariaDB / MySQL)

รายละเอียดการตั้งค่าฐานข้อมูลและการรัน API ย้ายไปที่ไฟล์ `docs/DB_SETUP.md`
