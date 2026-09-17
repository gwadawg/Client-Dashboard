# Slack Bot Setup (Direct Messages from Mr. Waiz)

Mr. Waiz can post to Slack **directly** using a bot token — no Make.com required for Slack messages.

## 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name it something like `Mr. Waiz` and pick your workspace.

## 2. Add bot scopes

Under **OAuth & Permissions** → **Bot Token Scopes**, add:

| Scope | Why |
|-------|-----|
| `chat:write` | Post messages to channels the bot is a member of |
| `chat:write.public` | (Optional) Post to public channels without joining first |

Launch Kit posts (ops notice + "Send to client") use `chat:write` with a signed download link — no `files:write` needed. Native file attachment is a later phase.

## 3. Install to workspace

1. On the same page, click **Install to Workspace** → allow.
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

## 4. Add the token to Mr. Waiz

In `.env.local` (local) and Railway (production):

```bash
SLACK_BOT_TOKEN=xoxb-your-token-here
```

Optional — which team channel gets internal alerts (onboarding, etc.):

```bash
SLACK_OPS_CHANNEL_SLUG=ops_alerts
```

This slug must exist in **Admin → Automations → Team channels**.

## 5. Invite the bot to private channels

For **private** channels (`G…` IDs), the bot must be a member:

```
/invite @Mr. Waiz
```

Run that in each private client or ops channel you want Mr. Waiz to post to.

## What sends automatically today

| Event | Channel | Make fallback |
|-------|---------|---------------|
| Client launch (go-live) | Client's `slack_id` | `MAKE_LAUNCH_COMPLETE_WEBHOOK_URL` if Slack fails or no token |
| Onboarding form complete | Team channel `#ops-alerts` (slug `ops_alerts`) | — |
| Demo booked — booking credit | `setters` | — |
| Intro showed — setter reflection | `setters` | — |
| Demo showed — closer form | `ceo` | — |
| Active clients CPL > $35 (past 4 days) | `media_buyer` | Daily Railway cron (`npm run cron:daily`) or `GET /api/alerts/daily` |
| Internal team activity (all human writes except finance; webhooks stay out) | `mrwaiz` (`C0BRRU9C4SH`) | Immediate on each successful human write |

## Internal activity channel (`mrwaiz`)

For the team activity feed (roster, calls, ads, schedules, agents, goals, library, acquisition ops, Closebot, CS overrides, loan forms — everything human-logged except finance):

1. Admin → Automations → Team channels → add slug **`mrwaiz`**
2. Channel ID: **`C0BRRU9C4SH`**
3. In Slack: `/invite @Mr. Waiz` in that channel

## Daily scheduled alerts (Railway cron)

Production runs on **Railway**, so `vercel.json` crons do not fire automatically. Use one **cron service** in the same Railway project for all daily digests:

1. **New service** → deploy from the same GitHub repo (name it e.g. `scheduled-alerts-cron`).
2. **Settings → Config file path** → `railway.cron.toml`
3. **Variables** — copy from the web service:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SLACK_BOT_TOKEN`
4. Deploy. Railway runs `npm run cron:daily` at **14:00 UTC** (11:00 AM São Paulo).

### Adding a new daily alert

1. Create `src/lib/scheduled-alerts/your-alert.ts` (query → evaluate → format → deliver).
2. Register it in `src/lib/scheduled-alerts/registry.ts`.
3. Add tests for pure evaluate/format helpers.

Manual runs:

```bash
npm run cron:daily -- --dry-run              # all enabled alerts, no Slack
npm run cron:daily -- --only=cpl-threshold   # one alert
npm run cron:cpl-threshold -- --dry-run      # alias for CPL only
```

HTTP fallback: `GET /api/alerts/daily` with `Authorization: Bearer $CRON_SECRET`. Per-alert: `/api/alerts/cpl-threshold`.

## Test from the dashboard

1. Open **Admin → Automations**.
2. If the bot is connected, you'll see a green **Slack bot connected** banner.
3. Click **Test** on any team or client channel row to send a test message.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `not_in_channel` | `/invite @YourBot` in that private channel |
| `channel_not_found` | Double-check the channel ID (`C…` public, `G…` private) |
| `SLACK_BOT_TOKEN is not configured` | Add the env var and redeploy |
| Message sent but Make also fired | Slack failed — check server logs; Make is the fallback |

## Security

- Never commit `SLACK_BOT_TOKEN` to git.
- Use a dedicated bot app (not a user token).
- Only grant the scopes above.
