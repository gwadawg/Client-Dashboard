# Ad Intelligence — Mr. Waiz Dashboard

Operational mirror of Wm-os [ad-intelligence-bridge.md](https://github.com/waizmedia/Wm-os/blob/main/docs/operations/ad-intelligence-bridge.md).

## Tables

- `ad_library` — curated creatives (`summary`, `visual_notes`, `drive_url`, `status`, `product`, `ad_format`)
- `ad_library_aliases` — Facebook name variants
- `meta_ad_insights` — daily spend (never synced to Wm-os git)
- `knowledge_capture_status`, `captured_at`, `os_refs` on `ad_library` (v2)

## API

`GET /api/ad-library/intelligence`

| Param | Purpose |
|-------|---------|
| `id` | Single library row |
| `status` | `knowledge_capture_status` filter |
| `product` | `reverse` \| `dscr` \| `broad_forward` |
| `library_status` | `active` \| `winner` \| `paused` \| `archived` |

`PATCH /api/ad-library/intelligence` — update `knowledge_capture_status` + `os_refs`

## Workflow

1. Media Buyer fills `summary` + `visual_notes`, marks `status=winner`
2. Optional: **Queue for OS KB** → `knowledge_capture_status=pending`
3. Founder runs knowledge-capture in Cursor against Wm-os
4. Agent writes swipes under `creative-research/swipes/` and PATCHes `processed` + `os_refs`

## Migration

Run `supabase/migrations/add_ad_library_knowledge_capture.sql` if `knowledge_capture_status` column is missing.
