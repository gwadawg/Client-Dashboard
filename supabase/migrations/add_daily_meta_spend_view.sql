-- Daily Meta spend totals derived from ad-level insights (for KPI queries).
CREATE OR REPLACE VIEW daily_meta_spend AS
SELECT
  client_id,
  insight_date AS spend_date,
  SUM(spend) AS amount
FROM meta_ad_insights
GROUP BY client_id, insight_date;

GRANT SELECT ON daily_meta_spend TO service_role;
GRANT SELECT ON daily_meta_spend TO authenticated;
GRANT SELECT ON daily_meta_spend TO anon;
