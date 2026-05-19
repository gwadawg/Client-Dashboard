# Meta Ads Import

Use this to pull Meta Ads data into the dashboard. There are two separate imports:

- Daily account-level spend goes to `ad_spend` and powers Ad Spend, Meta Spend, CPL,
  cost per appointment, and cost per show.
- Daily ad-level insights go to `meta_ad_insights` and preserve campaign, ad set,
  ad, impression, click, and cost metrics for future best-performer reporting.

## Data Contract

Make sends one row per client per day:

```json
{
  "client_name": "Exact Dashboard Client Name",
  "date": "2026-05-16",
  "platform": "meta",
  "amount": 123.45
}
```

Endpoint:

```text
POST https://YOUR_RAILWAY_APP_URL/api/ad-spend
Authorization: Bearer YOUR_ADMIN_WEBHOOK_SECRET
Content-Type: application/json
```

The API upserts by `client_id + spend_date + platform`, so rerunning a day replaces
the prior amount instead of duplicating spend.

## Client Map

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

This checks that every active `client_name` exists in Supabase and every active row
has a Meta ad account ID.

## Make Scenario

Create one scheduled scenario named `Meta Ads Spend -> Dashboard`.

1. **Scheduler**
   - Run daily after Meta has finalized yesterday's spend.
   - Recommended: early morning in your agency timezone.

2. **Client config source**
   - Use a Make Data Store, Google Sheet, or imported CSV.
   - Filter to `is_active = true`.

3. **Iterator**
   - Iterate one client config row at a time.

4. **Meta Ads Insights request**
   - Module: Meta Ads Insights, or HTTP `GET`.
   - HTTP URL:

```text
https://graph.facebook.com/v20.0/act_{{meta_ad_account_id}}/insights
```

   - Query string:

```text
fields=spend
level=account
time_increment=1
time_range={"since":"{{formatDate(addDays(now; -1); "YYYY-MM-DD")}}","until":"{{formatDate(addDays(now; -1); "YYYY-MM-DD")}}"}
access_token=YOUR_META_ACCESS_TOKEN
```

5. **Spend normalization**
   - If Meta returns one row, use `data[1].spend`.
   - If Meta returns multiple rows, aggregate all returned `spend` values for the
     client/date.
   - Convert blank spend to `0`.

6. **Send to dashboard**
   - Module: HTTP `Make a request` / `Send data`.
   - Method: `POST`.
   - URL: `https://YOUR_RAILWAY_APP_URL/api/ad-spend`.
   - Headers:

```text
Authorization: Bearer YOUR_ADMIN_WEBHOOK_SECRET
Content-Type: application/json
```

   - Raw JSON body:

```json
{
  "client_name": "{{client_name}}",
  "date": "{{formatDate(addDays(now; -1); \"YYYY-MM-DD\")}}",
  "platform": "meta",
  "amount": {{spend_total}}
}
```

## Test

Run the scenario for one active client and yesterday's date. A successful dashboard
response is:

```json
{ "success": true }
```

Then open the dashboard, select the same client and date range, and confirm Meta
spend appears.

You can also test the dashboard endpoint before Make is finished:

```bash
node scripts/test-ad-spend-webhook.mjs --client "Exact Dashboard Client Name" --amount 12.34
node scripts/test-ad-spend-webhook.mjs --client "Exact Dashboard Client Name" --amount 12.34 --url https://YOUR_RAILWAY_APP_URL --send
```

The first command is a dry run. The second command posts to `/api/ad-spend`.

## Backfill

After daily sync is confirmed, backfill history by looping over dates and sending
the same payload shape for each client/day. Because the dashboard endpoint upserts,
it is safe to rerun a date when Meta adjusts reported spend.

Generate a Make-friendly date list:

```bash
node scripts/generate-meta-backfill-days.mjs 2026-05-01 2026-05-16 > data/import/meta-backfill-dates.csv
```

Use that date list as the backfill iterator in Make, replacing the scenario's
`addDays(now; -1)` date expression with the iterated `date` value.

## Ad-Level Insights

Use this when you want campaign/adset/ad performance history, including best ads by
click and cost metrics.

Endpoint:

```text
POST https://YOUR_RAILWAY_APP_URL/api/meta-ad-insights
Authorization: Bearer YOUR_ADMIN_WEBHOOK_SECRET
Content-Type: application/json
```

Meta Insights request:

```text
GET https://graph.facebook.com/v20.0/act_{{meta_ad_account_id}}/insights
fields=date_start,date_stop,account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type
level=ad
time_increment=1
time_range={"since":"{{date}}","until":"{{date}}"}
access_token=YOUR_META_ACCESS_TOKEN
```

For daily live sync, set `date` to yesterday. For a backfill, iterate over one date
at a time so failed days can be retried safely.

Make can post Meta's returned `data[]` array directly with the client context:

```json
{
  "client_name": "{{client_name}}",
  "rows": {{meta_insights_data_array}}
}
```

The API also accepts one row at a time:

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

Rows upsert by `client + date + account + campaign + adset + ad`, so daily syncs
and historical backfills can be rerun without duplicating rows.

Blueprint: `make-blueprints/ccm-meta-ad-insights.blueprint.json`.
