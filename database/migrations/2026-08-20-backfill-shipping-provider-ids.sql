-- Add EMS for older ready-to-ship orders that used the legacy text field.
INSERT INTO shipping_providers (provider_code, provider_name)
VALUES ('ems', 'EMS')
ON DUPLICATE KEY UPDATE
  provider_name = VALUES(provider_name);

-- Link legacy Shipping_Carrier text values to the managed provider list.
UPDATE shipping s
JOIN shipping_providers p ON p.provider_code = 'flash'
SET s.provider_id = p.provider_id
WHERE s.provider_id IS NULL
  AND LOWER(s.Shipping_Carrier) LIKE '%flash%';

UPDATE shipping s
JOIN shipping_providers p ON p.provider_code = 'kerry'
SET s.provider_id = p.provider_id
WHERE s.provider_id IS NULL
  AND LOWER(s.Shipping_Carrier) LIKE '%kerry%';

UPDATE shipping s
JOIN shipping_providers p ON p.provider_code = 'j_and_t'
SET s.provider_id = p.provider_id
WHERE s.provider_id IS NULL
  AND (
    LOWER(s.Shipping_Carrier) LIKE '%j&t%'
    OR LOWER(s.Shipping_Carrier) LIKE '%j and t%'
  );

UPDATE shipping s
JOIN shipping_providers p ON p.provider_code = 'ems'
SET s.provider_id = p.provider_id
WHERE s.provider_id IS NULL
  AND LOWER(s.Shipping_Carrier) LIKE '%ems%';
