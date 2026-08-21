# Ad Performance load audit — 2026-08-21

Status: partially implemented (2026-08-21). Shared window cache + slim drilldown + tab keep-alive shipped; date-default / virtualization / module split still open.

## Symptom

Ad Performance feels slower, especially on wide ranges (e.g. Year to Date) with All Clients. The Ad Library navigation push did **not** change `/api/media-buyer`'s query shape; the cost is structural and easy to blame on nearby UI work.

## Load path today

```text
Dashboard → MediaBuyer (lazy, one ~2.8k-line client module)
  ├─ default tab: Creative Command → GET /api/media-buyer/overview
  │     events (≤100k) + meta (≤100k) + library + aliases
  │     then tagsByLibraryId (extra round-trip)
  │     then buildCreativeIntel in-process
  │
  └─ Ad Performance tab mount → GET /api/media-buyer
        same events + meta + library + aliases pull
        then tagsByLibraryId (extra round-trip)
        then aggregateAdPerformance + rollupAdPerformanceByLibrary
        then render full HTML table (14–20 cols × every row)

Row expand → GET /api/media-buyer?library_id=…  (or ?ad=…)
  re-pulls the same events + meta window, then drills one creative
```

Caches: process-local TTL 45s on each route separately (`createTtlCache`). Not shared across overview vs leaderboard, not shared across Railway isolates.

## Bottlenecks (ranked)

### 1. Duplicate full-funnel scan — highest impact

Creative Command and Ad Performance both hydrate from the same raw surfaces (`events` funnel types + `meta_ad_insights`) for the same `(client_id, start, end)`. Opening Media Buyer then flipping to Ad Performance pays that cost twice (minus a lucky same-isolate TTL hit).

**Fix:** one shared server loader (or one client fetch into lifted state) that both tabs consume. Overview can derive from the leaderboard rollup, or vice versa.

### 2. Drilldown re-fetches the whole window

`openAd` calls `/api/media-buyer?library_id=` / `?ad=`, which still selects up to 100k events + 100k meta rows before filtering to one creative.

**Fix:** filter in SQL (`ad_name in (…)`) using the resolver's variant list, or return daily series from the already-loaded leaderboard payload / a slim drilldown endpoint.

### 3. Tab switch tears down Ad Performance

`MediaBuyer` conditionally mounts one tab. Leaving Ad Performance drops `ads` state; returning re-hits the API and blanks the UI (`loading` → empty).

**Fix:** keep all three panels mounted (`hidden` / `display`) or lift `ads` / overview result to the shell with a shared `requestKey`.

### 4. Year-to-date × All Clients

With no `client_id`, the route scopes to every live client and walks the full date window. YTD is the worst case for both PostgREST payload size and in-process contact→ad attribution (`buildContactAdMap`).

**Fix (product):** default Media Buyer to a shorter range (30d / this month) and make YTD opt-in. **Fix (data):** SQL rollups / materialized daily ad aggregates keyed by `ad_name` + `client_id`.

### 5. Client DOM: dense unvirtualized table

`sorted.map` renders every ad as a wide row (up to 20 columns). Hundreds of rows + expand panels is jank after the network returns.

**Fix:** virtualize the tbody (or paginate), default `showPlatform` off, defer unsourced section until after first paint.

### 6. Bundle shape

`MediaBuyer.tsx` owns Creative Command wiring, Ad Performance, Ad Library, filters, and link modal (~2800 lines). One dynamic import pulls all of it for any Media Buyer visit.

**Fix:** split into `AdPerformance.tsx` / `AdLibrary.tsx` and `dynamic()` each tab so Ad Performance JS is not parsed until that tab opens (Creative Command already has its own folder).

### 7. Shell refetch on every tab change

```ts
useEffect(() => { fetch("/api/ad-library") … }, [tab]);
```

Full library download just to count `ready_to_test` whenever the user moves between Command / Performance / Library.

**Fix:** `GET /api/ad-library?count=ready` or count once per Media Buyer mount; do not depend on `tab`.

### 8. Small server cleanup

`tagsByLibraryId` runs after the main `Promise.all` (waterfall). Fold it into the parallel batch. Drop unused event columns from `EVENT_SELECT` if attribution does not need them. Surface `truncated: true` when the 100k cap is hit (overview already does; leaderboard does not).

## What not to chase first

- Ad Library card chrome / design tokens — orthogonal to Ad Performance TTFB.
- Micro-optimizing `useMemo` filter counts — they are cheap next to the network + aggregation.
- Raising the in-process TTL alone — helps repeat clicks on one instance, not cold loads or multi-instance Railway.

## Suggested implementation order

1. ~~Shared fetch / keep-alive across Media Buyer tabs~~ — done (`loadMediaBuyerWindow` + mounted-tab keep-alive).
2. ~~Slim drilldown query~~ — done (`loadMediaBuyerDrilldownRows`).
3. Split the client module + stop ready-count refetch on tab change — ready-count fixed; module split still open.
4. Shorter default date range for Media Buyer (product call).
5. Virtualize / paginate the leaderboard.
6. Longer-term: daily ad rollup table so YTD does not stream raw events.

## Verification

- Network tab: one shared payload when switching Command ↔ Performance within the TTL window.
- Expanding a row: response size ≪ full leaderboard payload.
- YTD All Clients: measure p50/p95 of `GET /api/media-buyer` before/after.
- Confirm `truncated` flag when caps bind.

## Related

- `src/app/api/media-buyer/route.ts`
- `src/app/api/media-buyer/overview/route.ts`
- `src/lib/ad-performance.ts`
- `src/components/MediaBuyer.tsx` (`AdPerformance`)
- `docs/AD-INTELLIGENCE.md`
