-- 2026-06-02-add-pending-import-fee-enum.sql
-- เพิ่มค่า 'Pending_import_fee' ใน ENUM status ของตาราง orders

ALTER TABLE orders
MODIFY COLUMN status ENUM(
  'Pending',
  'Paid',
  'Wait_for_Import_Fee',
  'Pending_import',
  'Pending_import_fee',
  'Ready_to_Ship',
  'Cancelled',
  'Invalid slip',
  'Invalid_Slip'
) DEFAULT 'Pending';
