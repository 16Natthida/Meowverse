-- 2026-06-02-add-pending-import-fee-enum.sql
-- เพิ่มค่า 'Pending_import_fee' ใน ENUM status ของตาราง orders

ALTER TABLE orders
MODIFY COLUMN status ENUM(
  'Pending',
  'Slip_submitted',
  'Paid',
  'Wait_for_Import_Fee',
  'Pending_import',
  'Pending_import_fee',
  'Import_slip_submitted',
  'Ready_to_Ship',
  'Partially_Received',
  'Missing',
  'Cancelled',
  'Invalid slip',
  'Invalid_Slip',
  'Invalid import slip'
) DEFAULT 'Pending';
