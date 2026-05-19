-- Daily ad-level Meta Ads insights for campaign/adset/ad performance reporting.
CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid    NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  insight_date         date    NOT NULL,
  account_id           text    NOT NULL,
  campaign_id          text    NOT NULL,
  campaign_name        text,
  adset_id             text    NOT NULL,
  adset_name           text,
  ad_id                text    NOT NULL,
  ad_name              text,
  spend                numeric NOT NULL DEFAULT 0,
  impressions          bigint  NOT NULL DEFAULT 0,
  clicks               bigint  NOT NULL DEFAULT 0,
  ctr                  numeric,
  cpc                  numeric,
  cpm                  numeric,
  actions              jsonb,
  cost_per_action_type jsonb,
  raw                  jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE(client_id, insight_date, account_id, campaign_id, adset_id, ad_id)
);

CREATE INDEX IF NOT EXISTS meta_ad_insights_client_date ON meta_ad_insights(client_id, insight_date DESC);
CREATE INDEX IF NOT EXISTS meta_ad_insights_campaign    ON meta_ad_insights(client_id, campaign_id);
CREATE INDEX IF NOT EXISTS meta_ad_insights_ad          ON meta_ad_insights(client_id, ad_id);
