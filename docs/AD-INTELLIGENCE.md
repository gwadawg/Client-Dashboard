# Ad Intelligence — Mr. Waiz Dashboard

Operational mirror of Wm-os [ad-intelligence-bridge.md](https://github.com/waizmedia/Wm-os/blob/main/docs/operations/ad-intelligence-bridge.md).

## Tables

- `ad_formats` — shared format catalog (`slug`, `label`). Client Media Buyer and Acquisition Marketing both write `ad_library.ad_format` / `acquisition_ad_library.ad_format` as a slug from this table. Adding a format in either UI makes it available everywhere (performance badges, library, intelligence).
- `ad_tags` — shared topic catalog (`slug`, `label`) for what an ad is talking about. Add from the library tag picker; new tags stay available for later filters.
- `ad_library_tags` — many-to-many join (`library_id`, `tag_slug`)
- `ad_library` — curated creatives (`summary`, `visual_notes`, `drive_url`, `status`, `product`, `ad_format`)
- `ad_library_aliases` — Facebook name variants
- `meta_ad_insights` — daily spend (never synced to Wm-os git)
- `knowledge_capture_status`, `captured_at`, `os_refs` on `ad_library` (v2)

## API

`GET /api/ad-formats` — live catalog (permission: `media_buyer` or `acquisition_marketing`)
`POST /api/ad-formats` `{ label }` — add a format; returns `{ id, slug, label, ... }`

`GET /api/ad-tags` — live topic catalog (same permissions)
`POST /api/ad-tags` `{ label }` — add a tag; returns `{ id, slug, label, ... }`

`GET /api/ad-library/intelligence`

| Param | Purpose |
|-------|---------|
| `id` | Single library row |
| `status` | `knowledge_capture_status` filter |
| `product` | `reverse` \| `dscr` \| `broad_forward` |
| `ad_format` | Catalog slug (see `GET /api/ad-formats`) |
| `tag` | Topic slug (see `GET /api/ad-tags`) |
| `library_status` | `active` \| `winner` \| `paused` \| `archived` |

Response includes `formats` and `tags` catalogs so knowledge-capture tools don't hardcode the lists. Each row includes `tags: [{ slug, label }]`.

`PATCH /api/ad-library/intelligence` — update `knowledge_capture_status` + `os_refs`

## Workflow

1. Media Buyer fills `summary` + `visual_notes`, marks `status=winner`
2. Optional: **Queue for OS KB** → `knowledge_capture_status=pending`
3. Founder runs knowledge-capture in Cursor against Wm-os
4. Agent writes swipes under `creative-research/swipes/` and PATCHes `processed` + `os_refs`

## Migration

Run `supabase/migrations/add_ad_library_knowledge_capture.sql` if `knowledge_capture_status` column is missing.
Run `supabase/migrations/add_ad_formats_catalog.sql` if `ad_formats` is missing (required before new format values will save).
Run `supabase/migrations/add_ad_tags_catalog.sql` if `ad_tags` is missing (required before topic tags will save).
