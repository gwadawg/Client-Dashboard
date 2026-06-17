-- Migrate sidebar permissions from legacy child keys to hub keys.
-- Safe to run multiple times (idempotent mapping).

UPDATE profiles
SET allowed_permissions = (
  SELECT COALESCE(jsonb_agg(DISTINCT mapped_key ORDER BY mapped_key), '[]'::jsonb)
  FROM (
    SELECT CASE
      WHEN elem IN ('heatmap_show', 'heatmap_pickup', 'heatmap_leads') THEN 'heatmaps'
      WHEN elem IN ('leads', 'dials', 'appointments', 'speed_to_lead', 'meta_ad_insights', 'ad_spend') THEN 'data_explorer'
      WHEN elem IN (
        'acquisition', 'acquisition_funnel', 'acquisition_team',
        'acquisition_leads', 'acquisition_appointments', 'acquisition_offers', 'acquisition_ads'
      ) THEN 'acquisition'
      WHEN elem IN ('agent_stats', 'agent_scorecards', 'agent_credit_queue', 'recordings', 'goals') THEN 'agents'
      ELSE elem
    END AS mapped_key
    FROM jsonb_array_elements_text(allowed_permissions) AS elem
  ) sub
)
WHERE allowed_permissions IS NOT NULL
  AND jsonb_typeof(allowed_permissions) = 'array';
