-- Ad / UTM attribution columns on events.
-- Captured on lead ingest (and any other event that carries them) so the Media
-- Buyer view can tie a Facebook ad name to our own funnel (leads → appointments
-- → shows → closes). `ad_name` is the universal join key because the same ad
-- names are reused across every client.
alter table events add column if not exists ad_name      text;
alter table events add column if not exists adset_name   text;
alter table events add column if not exists campaign_name text;
alter table events add column if not exists utm_source   text;
alter table events add column if not exists utm_campaign text;
alter table events add column if not exists utm_content  text;

-- Global cross-client rollups group by ad_name; lead lookups dominate.
create index if not exists events_ad_name_idx on events(ad_name) where ad_name is not null;
create index if not exists events_lead_ad_name_idx on events(ad_name) where event_type = 'lead' and ad_name is not null;
