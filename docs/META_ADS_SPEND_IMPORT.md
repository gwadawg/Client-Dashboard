# Meta Ads Import

Meta spend and cost KPIs (Meta spend, total ad spend, CPL, CP appointment, CPS) read from
**`meta_ad_insights` only**. The dashboard sums `spend` by client and day (via the
`daily_meta_spend` view). Do not POST Meta rows to `/api/ad-spend`.

Google and Local Services spend still use `ad_spend` via `POST /api/ad-spend`.

## Data flow

```text
Make (daily) → POST /api/meta-ad-insights → meta_ad_insights → daily_meta_spend view → KPIs
```

Historical Facebook Data sheet totals were migrated once into `meta_ad_insights` as
synthetic daily rows (`_imported_daily_total` sentinel). Live Make rows use real ad IDs;
both roll up correctly for daily Meta spend.

## Client map

Create a Make data store, Google Sheet, or CSV-backed list with these fields:

| Field | Example | Notes |
| --- | --- | --- |
| `client_name` | `Acme Solar` | Must exactly match the dashboard Client Roster. |
| `meta_ad_account_id` | `123456789012345` | Digits only, without `act_`. |
| `timezone` | `America/New_York` | Use the client's reporting timezone. |
| `is_active` | `true` | Skip rows that are not active. |

Template: `data/import/meta-client-map.csv.example`.

Validate the map before building the scenario:

```bash
node scripts/validate-meta-client-map.mjs path/to/meta-client-map.csv
```

## Make scenario

Import blueprint: `make-blueprints/ccm-meta-ad-insights.blueprint.json`.

1. **Scheduler** — daily after Meta finalizes yesterday's data.
2. **Client config** — active rows from your map.
3. **Iterator** — one client at a time.
4. **Meta Ads Insights** — `level=ad`, `time_increment=1`, yesterday's date range.

```text
GET https://graph.facebook.com/v20.0/act_{{meta_ad_account_id}}/insights
fields=date_start,date_stop,account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type
level=ad
time_increment=1
time_range={"since":"{{date}}","until":"{{date}}"}
access_token=YOUR_META_ACCESS_TOKEN
```

5. **HTTP POST** to the dashboard:

```text
POST https://YOUR_RAILWAY_APP_URL/api/meta-ad-insights
Authorization: Bearer YOUR_ADMIN_WEBHOOK_SECRET
Content-Type: application/json
```

Body with client context and Meta's `data[]` array:

```json
{
  "client_name": "{{client_name}}",
  "rows": {{meta_insights_data_array}}
}
```

Or one row at a time:

```json
{
  "client_name": "Exact Dashboard Client Name",
  "date": "2026-05-16",
  "account_id": "1234567890",
  "campaign_id": "1200000000001",
  "campaign_name": "Spring Campaign",
  "adset_id": "1200000000002",
  "adset_name": "Homeowners 45+",
  "ad_id": "1200000000003",
  "ad_name": "Testimonial Video",
  "spend": "125.42",
  "impressions": "10000",
  "clicks": "250",
  "ctr": "2.5",
  "cpc": "0.50",
  "cpm": "12.54",
  "actions": [],
  "cost_per_action_type": []
}
```

Rows upsert by `client + date + account + campaign + adset + ad`. Reruns replace the
same ad/day without duplicating.

## Test

After one successful POST, open the dashboard for that client and date range and confirm
Meta spend and CPL update.

```bash
curl -X POST "https://YOUR_RAILWAY_APP_URL/api/meta-ad-insights" \
  -H "Authorization: Bearer YOUR_ADMIN_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Exact Name","date":"2026-05-16","account_id":"123","campaign_id":"c1","adset_id":"s1","ad_id":"a1","spend":10}'
```

## Backfill

Iterate dates in Make (or use `scripts/generate-meta-backfill-days.mjs`) and POST the
same payload shape per client/day. Ad-level backfill replaces or adds rows per ad;
daily KPI totals are the sum of all ads (plus any migrated daily-total rows) for that day.

```bash
node scripts/generate-meta-backfill-days.mjs 2026-05-01 2026-05-16 > data/import/meta-backfill-dates.csv
```

## One-time sheet migration

If Meta spend was previously imported into `ad_spend`:

```bash
node scripts/migrate-ad-spend-to-meta-insights.mjs --dry-run
node scripts/migrate-ad-spend-to-meta-insights.mjs
node scripts/migrate-ad-spend-to-meta-insights.mjs --delete-meta-ad-spend
```

## Deprecated

- `POST /api/ad-spend` with `platform: "meta"` returns **400** — use `/api/meta-ad-insights`.
- `import-ad-spend.mjs` / Facebook Data CSV for Meta — use migration script above, then Make only.
