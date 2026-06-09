-- Map Jesse Beard and Shane Thompson GHL sub-accounts for imports and deep links.
UPDATE clients SET ghl_location_id = 'wKNRhfYaLqrVUCeyCSMJ' WHERE name = 'Jesse Beard' AND (ghl_location_id IS NULL OR ghl_location_id = '');
UPDATE clients SET ghl_location_id = 'Q0fqw1niqLqy3x5GbUwM' WHERE name = 'Shane Thompson' AND (ghl_location_id IS NULL OR ghl_location_id = '');
