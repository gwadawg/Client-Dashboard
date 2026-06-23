-- Normalize legacy client acquisition sources to Cold | Meta | Referral.
UPDATE clients SET source = CASE
  WHEN source IS NULL OR btrim(source) = '' THEN NULL
  WHEN lower(source) IN ('meta', 'facebook', 'fb') OR lower(source) LIKE '%meta%' OR lower(source) LIKE '%facebook%' THEN 'Meta'
  WHEN lower(source) LIKE '%refer%' THEN 'Referral'
  WHEN lower(source) LIKE '%cold%' THEN 'Cold'
  WHEN source IN ('Cold', 'Meta', 'Referral') THEN source
  ELSE source
END
WHERE source IS NOT NULL AND source NOT IN ('Cold', 'Meta', 'Referral');

UPDATE client_billings SET lead_source = CASE
  WHEN lead_source IS NULL OR btrim(lead_source) = '' THEN NULL
  WHEN lower(lead_source) IN ('meta', 'facebook', 'fb') OR lower(lead_source) LIKE '%meta%' OR lower(lead_source) LIKE '%facebook%' THEN 'Meta'
  WHEN lower(lead_source) LIKE '%refer%' THEN 'Referral'
  WHEN lower(lead_source) LIKE '%cold%' THEN 'Cold'
  WHEN lead_source IN ('Cold', 'Meta', 'Referral') THEN lead_source
  ELSE lead_source
END
WHERE lead_source IS NOT NULL AND lead_source NOT IN ('Cold', 'Meta', 'Referral');
