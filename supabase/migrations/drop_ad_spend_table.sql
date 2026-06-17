-- Meta ad insights is the sole source of truth for ad spend reporting.
-- Run after verifying no active Google/Local Services ingest (see scripts/migrate-ad-spend-to-meta-insights.mjs).

DROP TABLE IF EXISTS ad_spend CASCADE;
