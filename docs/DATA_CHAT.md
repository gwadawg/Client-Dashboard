# Data Chat — Mr. Waiz

Scoped, tool-calling analytics assistant inside the dashboard. The user picks a
**data set** before chatting so the model never sees the whole warehouse.

**Owner:** product / call-center ops  
**Status:** live (v1)  
**KPI truth:** [`docs/KPIS.md`](KPIS.md) — Data Chat does not redefine formulas.

---

## Context model (why it is shaped this way)

| Layer | What loads | Where |
|-------|------------|--------|
| Session lock | One scope + date range + optional client | UI → `POST /api/ai/data-chat` body |
| Hot policy | Short system prompt (no formula dump) | `src/lib/ai/data-chat/prompt.ts` |
| Warm tools | 2 tools per scope, trimmed JSON | `tool-defs.ts` + `tools.ts` |
| Cold evidence | Events / spend / roster via existing libs | `metrics.ts`, `dial-analytics.ts`, … |

**Rule:** expand by adding a new scope (or a named tool), not by widening an
existing tool to “all tables.”

---

## v1 scopes

| Scope id | UI label | Permissions (any) | Tools |
|----------|----------|-------------------|--------|
| `fulfillment_kpis` | Client fulfillment KPIs | `dashboard`, `agents` | `get_fulfillment_metrics`, `list_clients` |
| `setter_performance` | Setter / dialer performance | `dial_analytics`, `agents`, `agent_scorecards` | `get_dial_performance`, `get_agent_scorecards` |

Filters locked for the conversation:

- `start_date` / `end_date` (from dashboard date preset)
- optional `client_id` or `live_only`

---

## Code map

```
src/lib/ai/data-chat/
  scopes.ts      # registry + permission gates + tool allowlists
  tool-defs.ts   # Anthropic schemas only
  tools.ts       # executors (trimmed payloads)
  prompt.ts      # runtime system prompt
  run.ts         # Anthropic tool loop
  index.ts       # public exports

src/app/api/ai/data-chat/route.ts   # GET scopes · POST chat
src/components/DataChatPanel.tsx    # scope picker → chat UI
```

Related one-shot AI (not chat): `src/lib/ai-diagnose.ts` + client-health diagnose route.

---

## API

```
GET  /api/ai/data-chat
POST /api/ai/data-chat
```

**POST body**

```json
{
  "scope": "fulfillment_kpis",
  "filters": {
    "start_date": "2026-07-01",
    "end_date": "2026-07-16",
    "client_id": null,
    "live_only": true
  },
  "messages": [{ "role": "user", "content": "What's the show rate?" }]
}
```

Auth: logged-in user; scope forbidden → 403. Needs `ANTHROPIC_API_KEY`.

---

## Extending (checklist)

1. Add scope row in `scopes.ts` (permissions + tool name list).
2. Add Anthropic schemas in `tool-defs.ts`.
3. Implement trimmed executor in `tools.ts` (reuse `src/lib/*` metrics helpers — do not query ad hoc).
4. Gate with the same permission keys as the underlying dashboard API.
5. Update this doc’s scope table.
6. Keep payloads small (summaries / top-N rows, no raw event dumps).

---

## Non-goals (v1)

- Whole-database RAG or embeddings
- Expenses / payroll / acquisition funnel (separate future scopes)
- Streaming UI (can add later without changing the scope model)
