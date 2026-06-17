---
title: Watchshift SOP
domain: acquisition
owner: setter
status: draft
last_updated: 2026-05-29T00:00:00.000Z
review_cycle: weekly
artifact_type: sop
slug: watchshift
---

# Watchshift SOP

## Purpose

Define how the setter handles **live watchshift** and **watchshift alerts** — speed-to-lead, Slack/GHL notifications, and consistent handoff back to the channel.

## Scope

Acquisition setter only. Does not cover fulfillment B2C call-center work.

## Owner

See [domain owners](../../_inventory/domain-owners.md): **setter**.

## Trigger

- Setter is in a scheduled watchshift block, **or**
- Any watchshift alert fires on Slack/GHL during the shift (see alert types below)

## Inputs

- Slack and GHL notifications (watchshift channels)
- Lead record, calendar, and notes in GHL
- [Intro Call Script](/library/intro-call-script) — opening type depends on how the lead entered ([mapping table](#which-intro-opening-to-use))
- [Intro Call Qualification Framework](/library/intro-qualification-framework)

## Outputs

- Lead contacted or dispositioned per script + FUN
- Slack thread updated (✅ or Gabriel tagged)
- CRM updated; GHL task for self or Gabriel if follow-up remains

---

## Watchshift alert types

Handle **immediately** when any of these come in:

| Alert | What to do |
|-------|------------|
| **SMS response** (pre-demo) | [SMS pre-demo rules](#sms-responses-pre-demo) — setter owns unless escalation applies |
| **New appointment booked** | Call to run intro **early** when possible — don’t wait for the slot if you can take them now ([speed-to-lead framing](/library/show-rate-levers)) |
| **New lead in** | Call outbound; qualify and book next step per script |
| **No-show notification** | Run intro no-show path from script + [no-show protocol](/library/show-rate-levers) as applicable |

### Which intro opening to use

| Alert / situation | Script opening |
|-------------------|----------------|
| **New appointment booked** (intro on calendar) | [2 — Appointment confirmation (early intro)](/library/intro-call-script#opening-2--appointment-confirmation-early-intro) when calling before the slot; [1 — Booked call](/library/intro-call-script#opening-1--booked-call) when the slot is now |
| **New lead in** (no intro yet) | [3 — Dialer / impromptu](/library/intro-call-script#opening-3--dialer--impromptu) |
| **No-show notification** (missed intro) | [4 — Intro no-show recovery](/library/intro-call-script#opening-4--intro-no-show-recovery) + [no-show protocol](/library/show-rate-levers) |
| Live intro at scheduled time | [1 — Booked call](/library/intro-call-script#opening-1--booked-call) |

Full dialogue: [Intro Call Script](/library/intro-call-script).

---

## SMS responses (pre-demo)

**Scope:** Any SMS from a lead who has **not yet completed a booked demo with the closer**. After demo is on the calendar with the closer, confirmations and show-rate work follow [Demo Appointment Confirmation Script](script-demo-appointment-confirmation.md), [No Shows and Maximizing Show Rates](/library/show-rate-levers), and [Setter Daily Checklist P3](/library/setter-daily-checklist#priority-3--confirm-demo-appointments-closer-calls).

### Default — setter owns it

The setter **writes and sends** pre-demo SMS replies. Do not wait for Gabriel unless an escalation rule below applies.

- Reply in GHL using **[Setter Lead Messaging](setter-lead-messaging.md)** — read form + history; value-first; no empty check-ins.
- Prefer a **call** when the thread is heating up or booking is one message away ([texting rules](/library/setter-daily-checklist#texting-rules-all-priorities) for dialer blocks).
- **CRM notes required** on every lead you speak with (call or substantive SMS) — what was said, next step, stage.

### Tag Gabriel (Slack + context)

On the watchshift Slack notification (or thread), **tag Gabriel** and add one line of context when:

| Situation | Setter action |
|-----------|----------------|
| **Gabriel must reply** | The message needs Gabriel’s voice or answer — setter does **not** reply; tag Gabriel and leave a GHL task assigned to Gabriel |
| **High-value question** | Strong / quality lead asks something that needs **more thought** than a quick setter reply (pricing nuance, policy, custom situation) — tag Gabriel; do not guess |

After tagging, leave the lead in a clear CRM state (task for Gabriel, note what was asked). Do not mark ✅ on Slack until the handoff is posted (Gabriel may still owe the reply).

### Disposition — quality lead pre-booking

When the lead is **good quality** but still **pre-demo** (not yet booked with the closer):

- Move to pipeline stage: **Setter quality lead**
- Add a short note: why they’re quality, what’s pending (e.g. awaiting Gabriel reply, callback time, intro slot)
- Create a GHL task for self or Gabriel if the next step is not done in the same session

Use this disposition when they’re worth prioritizing in the pipeline — not for every SMS, only when they meet your quality bar before booking.

### When handled (no Gabriel needed)

1. Reply sent (or call completed).
2. CRM updated (disposition + notes).
3. **✅** on the Slack notification.

---

## Cadence (required)

1. **Handle immediately** — treat the alert as drop-everything until that item is worked or clearly waiting on the prospect.
2. **Close the loop on Slack:**
   - Done and no founder action needed → add a **✅** (checkmark) reaction on the notification (or reply ✅).
   - Needs Gabriel → **tag Gabriel** per [SMS pre-demo rules](#sms-responses-pre-demo) or other escalation below.
3. **CRM / GHL** — disposition, notes, and tasks per [Setter Daily Checklist](/library/setter-daily-checklist) (task for self or Gabriel if not finished).

Do not leave watchshift notifications unreacted after you’ve handled them.

---

## During a watchshift block

1. Verify GHL + Slack alerts are on before starting.
2. Work the alert queue using the cadence above — inbound during block still overrides outbound queue.
3. Between alerts, call watchshift outbound leads who have shown interest but have not completed intro qualification.
4. SMS during watchshift: follow [SMS pre-demo rules](#sms-responses-pre-demo).
5. End block with a short handoff only if something is open (tag Gabriel or leave a GHL task).

---

## Setting an intro on the setter calendar

When the lead is busy on a live call, use [Opening 3 — BAMFAM](/library/intro-call-script#opening-3--dialer--impromptu) to book an intro on **the setter’s calendar** — as soon as possible.

---

## Escalation

| Situation | Action |
|-----------|--------|
| Pre-demo SMS needs Gabriel’s reply or high-value question | Tag **Gabriel** on Slack + GHL task — see [SMS pre-demo](#sms-responses-pre-demo) |
| Pricing / policy / founder-only edge case | Tag **Gabriel** on Slack + GHL task |
| Alert routing or system failure | Ops / Gabriel |
| Qualification boundary | [Disqualifying and Financial Qualification](/library/financial-qualification) |
| Quality lead, not yet on closer demo calendar | Pipeline stage **Setter quality lead** + note + task |

## Quality bar

- Median time from alert to first action is minutes, not hours.
- Every handled Slack alert has ✅ or Gabriel tagged.
- Intro opening matches how the lead entered (per [script mapping](#which-intro-opening-to-use)).

## Metrics

- Speed-to-first-action on watchshift alerts
- % of Slack notifications closed with ✅ or explicit Gabriel tag
- Qualified demos booked from watchshift-sourced leads

## Related Docs

- [Setter Daily Checklist](/library/setter-daily-checklist) — P2 and Always First
- [Intro Call Script](/library/intro-call-script)
- [Intro Call Qualification Framework](/library/intro-qualification-framework)
- [No Shows and Maximizing Show Rates](/library/show-rate-levers)
- [Setter Lead Messaging](setter-lead-messaging.md)

## Open Questions

- [ ] Confirm GHL setter-calendar name, duration, and confirmation SMS (placeholder in intro script Opening 3).
- [ ] Confirm exact Slack channel names and emoji convention with ops.
- [x] **Setter quality lead** — confirmed GHL pipeline stage (2026-05-29).
