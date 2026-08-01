-- Allow admin intake decisions to be stored on order_details.
ALTER TABLE order_details
MODIFY COLUMN arrival_status ENUM('Pending', 'Arrived', 'Missing', 'Delayed')
DEFAULT 'Pending';
