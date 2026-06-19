-- Align is_live with lifecycle: only active (launched) clients appear in reporting views.
UPDATE clients
SET is_live = (lifecycle_status = 'active')
WHERE is_live IS DISTINCT FROM (lifecycle_status = 'active');
