-- Keep delayed child orders distinct from orders that are missing and refunded.
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
  'Delayed',
  'Cancelled',
  'Invalid slip',
  'Invalid_Slip',
  'Invalid import slip'
) DEFAULT 'Pending';
