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
SLACK_OPS_CHANNEL_SLUG=client_success
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
| Onboarding form complete | Team channel (`SLACK_OPS_CHANNEL_SLUG`) | `MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL` if Slack fails |

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
