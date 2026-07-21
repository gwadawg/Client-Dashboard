# Call Center Reporting Dashboard

## What This Is

A reporting dashboard for a call center or setter team. Tracks client KPIs (leads,
qualified/hot leads, appointments, show rate, live transfers, conversations,
pipeline) plus operational metrics (dials, pickups, speed-to-lead, ad spend, CPL).

**Data pipeline:** GHL → Make.com → Railway (this app) → Supabase → Dashboard

**KPI definitions (formulas, sheet mapping, GHL fields):** see [`docs/KPIS.md`](docs/KPIS.md)
**Expense ledger (charges → CAC / COGS / overhead):** see [`docs/EXPENSES.md`](docs/EXPENSES.md)

### Client KPIs we track

| KPI | Formula (summary) |
|-----|-------------------|
| Total Leads | Count of `lead` events |
| Qualified / Hot / Out of State Leads | Count with flag (manual tags from GHL) |
| Appointments Booked | Count of `appointment_booked` |
| Booking Rate | Booked ÷ Qualified Leads |
| Shows / No Shows | Count of `show` / `no_show` |
| Show Rate | **Shows ÷ Appointments Booked** |
| Live Transfers | Count of `live_transfer` events |
| Total Conversations | Completed calls **> 120 seconds** |
| Proposals Sent / Closed | Pipeline flags |

Operational KPIs (dials, pickups, CPL, speed-to-lead, callbacks, etc.) are listed in `docs/KPIS.md`.

---

## First Time Setup

If you haven't set this up yet, fill in `.env.local` with your API keys
and run `/start` — Claude will build everything automatically.

---

## Folder Structure

```
/
├── CLAUDE.md                        ← You are here
├── .env.local                       ← Your API keys (never share this)
├── .claude/commands/start.md        ← The /start setup skill
│
├── docs/
│   └── KPIS.md                      ← KPI formulas & GHL field mapping (source of truth)
├── make-blueprints/                 ← Make.com scenario blueprints
├── supabase/
│   └── schema.sql                   ← Full database schema (run once)
│
└── src/
    ├── app/
    │   ├── api/                     ← All API routes (webhooks, metrics, etc.)
    │   ├── dashboard/               ← Dashboard page
    │   ├── setup/                   ← First-run admin account creation
    │   └── login/                   ← Login page
    └── components/                  ← UI components
        ├── DashboardView.tsx        ← Main dashboard (nav + all views)
        ├── UserManager.tsx          ← Admin → Users tab
        ├── SetterSchedule.tsx       ← Weekly Focus (Watch / Focus / Availability)
        └── ClientRoster.tsx         ← Lead source management
```

---

## Key Files

| Task | File |
|------|------|
| First-run admin setup | `src/app/setup/page.tsx` (visit `/setup`) |
| User management (add/remove) | `src/components/UserManager.tsx` |
| Webhook ingestion | `src/app/api/webhooks/route.ts` |
| Metrics calculation | `src/lib/metrics.ts` |
| **KPI definitions & formulas** | `docs/KPIS.md` |
| **Data Chat (scoped AI Q&A)** | `docs/DATA_CHAT.md` → `src/lib/ai/data-chat/` |
| Dashboard UI | `src/components/DashboardView.tsx` |
| Database schema | `supabase/schema.sql` |
| Environment variables | `.env.local` |
