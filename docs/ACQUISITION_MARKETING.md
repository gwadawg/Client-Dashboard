# Acquisition Marketing

B2B Meta ad performance and creative library — isolated from the client **Media Buyer** tab.

## Data flow

```text
Make (daily) → POST /api/acquisition/meta-ad-insights → acquisition_meta_ad_insights
                                                      ↘ acquisition_ad_library (manual)
Leads / appointments / closes → /api/acquisition/media-buyer (funnel attribution by ad_name)
```

Legacy thin webhook (`POST /api/acquisition/ad-insights`) still works and upserts into `acquisition_meta_ad_insights` with synthetic IDs.

## Dashboard

- Sidebar: **Acquisition → Marketing**
- Sub-tabs: **Ad Performance** | **Ad Library**
- Permission: `acquisition_marketing` (granted by `acquisition`)

## Library fields

| Field | Notes |
| --- | --- |
| Ad name | Exact Meta ad name (primary join key) |
| Creative created | Date the creative was made |
| Google Drive | Link to creative asset |
| Format | UGC or Static |
| Angle | User-managed catalog (`acquisition_ad_angles`) |

Alias names map incoming Meta ad variants to a library entry (same pattern as client Media Buyer).

## Make scenario

Blueprint: `make-blueprints/acquisition-meta-ad-insights.blueprint.json`

Single Waiz ad account — no client map. POST body matches client Meta insights (`rows[]` with `account_id`, `campaign_id`, `adset_id`, `ad_id`, `spend`, etc.).
