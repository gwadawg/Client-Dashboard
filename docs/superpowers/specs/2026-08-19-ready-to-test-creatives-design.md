---
title: Ready to test creatives
status: implemented
last_updated: 2026-08-20
artifact_type: design
related_docs:
  - supabase/schema.sql
  - supabase/migrations/add_ad_library_ready_to_test.sql
  - src/app/api/ad-library/route.ts
  - src/app/api/ad-library/[id]/route.ts
  - src/components/MediaBuyer.tsx
  - src/lib/ad-creative-lenses.ts
---

# Ready to test creatives

Date: 2026-08-19
Status: Implemented

## Problem

New client ads are added to the Ad Library (name, Drive link, product,
format, tags, notes). The media buyer has no dedicated list of
creatives that should go into Ads Manager next.

Creative Command **Test queue** does not cover this. That lens is ads
that already have spend, sit under the floor, and beat their cluster
on CTR / opt-in. Brand-new uploads with no spend never appear there.

## Goal

When someone adds or edits a library creative, they can mark **Ready
to test**. The media buyer sees that set until someone turns the flag
off.

## Non-goals (v1)

- File upload into Mr. Waiz (keep Drive URL + thumbnail)
- Auto-clear when Meta spend matches `ad_name`
- Changing `ad_library.status` or adding a `ready_to_test` status
- Mixing this list with Creative Command **Test queue**
- Slack or email to the buyer
- The same flag on `acquisition_ad_library`

## Decision

Boolean `ready_to_test` on `ad_library`, default false. Opt-in on
create/edit. Independent of `status` (`active` / `winner` / `paused`
/ `archived`). Leave the list by unchecking the flag (form or card
**Clear**).

Rejected: a new status value (cannot be winner and still flagged;
toggling off forces another status). Rejected: a catalog topic tag
(easy to mix with creative topics).

## Data

Migration + `supabase/schema.sql`:

```sql
alter table ad_library
  add column if not exists ready_to_test boolean not null default false;

create index if not exists ad_library_ready_to_test_idx
  on ad_library (created_at desc)
  where ready_to_test = true;
```

Existing rows stay `false`. Flag does not change `status`.

## API

Same permission as today: `media_buyer`.

| Route | Behavior |
|-------|----------|
| `GET /api/ad-library` | Include `ready_to_test` on each row (already `select('*')`) |
| `POST /api/ad-library` | Accept `ready_to_test` (boolean). Omit or invalid → `false` |
| `PATCH /api/ad-library/[id]` | Accept `ready_to_test`. Partial update. Duplicate `ad_name` still 409 |

No new list endpoint. Count is `entries.filter(e => e.ready_to_test).length` in the client.

## UI — Ad Library tab

**Form (Add / Edit)**

- Checkbox **Ready to test**, default off on new ads
- Helper: “Shows in the Media Buyer Ready to test list until turned off”
- Persist with the rest of the save body

**List**

- Chip **Ready to test** next to product / topic, with count
- Filter on: only flagged ads, sort `created_at` desc (newest first)
- Filter off: full library as today; flagged cards keep a **Ready to test** badge
- Card **Clear**: `PATCH` `{ ready_to_test: false }` without opening the form
- Empty filter: “No creatives marked ready to test.”

## UI — Creative Command / Ad Performance

If count > 0, one-line strip: **“N creatives ready to test”**.

Click: switch to Ad Library and turn the Ready to test filter on
(extend `LibraryNav`, e.g. `{ readyToTest: true }`).

If count is 0: no strip.

Do not add a Creative Command lens. Do not reuse lens id `test_queue`.

## Edge cases

- `paused` or `archived` can stay flagged until someone clears them
- Product / topic / search still apply inside the Ready to test filter
- Prefill “add to library” from performance does not auto-check the box

## Tests

- POST without the field → `ready_to_test` false
- POST/PATCH true then false persist
- Library filter + count + Clear
- Strip hidden at 0; visible at N ≥ 1; click opens Library with filter on

## Files (implementation)

- `supabase/migrations/add_ad_library_ready_to_test.sql`
- `supabase/schema.sql`
- `src/app/api/ad-library/route.ts`
- `src/app/api/ad-library/[id]/route.ts`
- `src/components/MediaBuyer.tsx` (form, filter, badge, Clear, strip, `LibraryNav`)
- API and/or component tests as above
