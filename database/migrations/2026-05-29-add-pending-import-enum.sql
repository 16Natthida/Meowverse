-- 2026-05-29-add-pending-import-enum.sql
-- เพิ่มค่า 'Pending_import' ใน ENUM status ของตาราง orders

ALTER TABLE orders 
MODIFY COLUMN status ENUM(
  'Pending',
  'Paid',
  'Wait_for_Import_Fee',
  'Pending_import',
  'Ready_to_Ship',
  'Cancelled',
  'Invalid slip',
  'Invalid_Slip'
) DEFAULT 'Pending';
