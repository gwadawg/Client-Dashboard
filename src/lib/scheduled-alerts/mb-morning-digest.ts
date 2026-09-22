/**
 * Media Buyer morning digest — posts actionable pulse + bet signals to Slack.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSlackConfigured, postToTeamChannel } from '@/lib/slack-notify';
import { buildMediaBuyerCommandPayload } from '@/lib/team-dashboards/media';
import type {
  ScheduledAlertResult,
  ScheduledAlertRunOpts,
  ScheduledAlertSlackSkipReason,
} from '@/lib/scheduled-alerts/types';

export const MB_MORNING_DIGEST_ALERT_ID = 'mb-morning-digest';
export const MB_MORNING_DIGEST_EVENT_KEY = 'media_buyer.morning_digest';

const CHANNEL_SLUG = 'media_buyer';

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.APP_URL?.replace(/\/$/, '') ||
    'https://os.waizmedia.net'
  );
}

function formatDigest(payload: Awaited<ReturnType<typeof buildMediaBuyerCommandPayload>>): {
  text: string;
  actionable: number;
} {
  const lines: string[] = [];
  const dashboardUrl = `${appBaseUrl()}/dashboard?view=team_dashboard&tab=media`;
  let actionable = 0;

  lines.push(`*Media Buyer morning digest — ${payload.today}*`);
  lines.push(`<${dashboardUrl}|Open Media Buyer Command>`);
  lines.push('');

  if (payload.pulse?.sync_stale) {
    actionable += 1;
    lines.push(
      `⚠️ *Meta sync stale* — last insight date ${payload.pulse.sync_watermark ?? 'none'} (${payload.pulse.sync_age_days ?? '?'}d old). Check Make before reading spend.`,
    );
    lines.push('');
  }

  const noDelivery = (payload.pulse?.rows ?? []).filter(r =>
    r.flags.includes('no_delivery'),
  );
  if (noDelivery.length > 0) {
    actionable += noDelivery.length;
    lines.push(`*Not spending (${noDelivery.length})*`);
    for (const r of noDelivery.slice(0, 8)) {
      const bud = r.budget_daily != null ? `$${Math.round(r.budget_daily)}/d` : 'no budget';
      lines.push(`• ${r.client_name} — ${bud}`);
    }
    if (noDelivery.length > 8) lines.push(`• …+${noDelivery.length - 8} more`);
    lines.push('');
  }

  const attention = (payload.pulse?.rows ?? []).filter(
    r =>
      !r.ads_paused &&
      r.flags.some(f =>
        ['under_pacing', 'over_pacing', 'cpl_spike', 'fatigue', 'low_optin', 'no_leads'].includes(f),
      ),
  );
  if (attention.length > 0) {
    actionable += attention.length;
    lines.push(`*Needs attention (${attention.length})*`);
    for (const r of attention.slice(0, 8)) {
      const flags = r.flags.filter(f => f !== 'red' && f !== 'paused').join(', ');
      lines.push(`• ${r.client_name} — ${flags || r.mb_tier}`);
    }
    if (attention.length > 8) lines.push(`• …+${attention.length - 8} more`);
    lines.push('');
  }

  const offTrack = payload.changesInFlight.filter(c => c.verdict === 'off_track');
  if (offTrack.length > 0) {
    actionable += offTrack.length;
    lines.push(`*Off-track bets (${offTrack.length})*`);
    for (const c of offTrack.slice(0, 6)) {
      lines.push(`• ${c.client_name}: ${c.title}`);
    }
    lines.push('');
  }

  if (payload.counts.reflections_overdue > 0) {
    actionable += payload.counts.reflections_overdue;
    lines.push(
      `*Reflections overdue: ${payload.counts.reflections_overdue}* — record outcomes today.`,
    );
    for (const r of payload.reflectionsDue.filter(x => x.overdue).slice(0, 5)) {
      lines.push(`• ${r.client_name}: ${r.title}`);
    }
    lines.push('');
  }

  if (payload.counts.fresh_incomplete > 0) {
    actionable += payload.counts.fresh_incomplete;
    lines.push(
      `*Fresh launches unchecked: ${payload.counts.fresh_incomplete}/${payload.counts.fresh_launches}*`,
    );
    for (const f of payload.freshLaunches.filter(x => !x.all_checked).slice(0, 5)) {
      lines.push(`• ${f.client_name} (day ${f.days_since_launch + 1})`);
    }
    lines.push('');
  }

  if (actionable === 0) {
    lines.push('_All clear — no delivery issues, off-track bets, or overdue reflections._');
  }

  return { text: lines.join('\n'), actionable };
}

export async function runMbMorningDigestScheduledAlert(
  service: SupabaseClient,
  opts: ScheduledAlertRunOpts = {},
): Promise<ScheduledAlertResult> {
  const dryRun = Boolean(opts.dryRun);
  const postAllClear = Boolean(opts.postAllClear);

  try {
    const payload = await buildMediaBuyerCommandPayload(service);
    const { text, actionable } = formatDigest(payload);
    const window = payload.pulse?.window ?? null;

    if (actionable === 0 && !postAllClear) {
      return {
        ok: true,
        alert_id: MB_MORNING_DIGEST_ALERT_ID,
        event_key: MB_MORNING_DIGEST_EVENT_KEY,
        scanned: payload.pulse?.totals.ads_clients ?? 0,
        triggered: 0,
        window,
        channel_slug: CHANNEL_SLUG,
        slack_posted: false,
        slack_skipped_reason: 'no_breaches',
        slack_error: null,
        details: { dry_run: dryRun, preview: text },
      };
    }

    let slack_posted = false;
    let slack_skipped_reason: ScheduledAlertSlackSkipReason = null;
    let slack_error: string | null = null;

    if (dryRun) {
      slack_skipped_reason = 'dry_run';
    } else if (!isSlackConfigured()) {
      slack_skipped_reason = 'slack_not_configured';
    } else {
      const posted = await postToTeamChannel(service, CHANNEL_SLUG, text);
      if (posted == null) {
        slack_skipped_reason = 'channel_missing';
      } else if (posted.ok) {
        slack_posted = true;
      } else {
        slack_error = posted.error ?? 'slack_post_failed';
      }
    }

    return {
      ok: slack_error == null,
      alert_id: MB_MORNING_DIGEST_ALERT_ID,
      event_key: MB_MORNING_DIGEST_EVENT_KEY,
      scanned: payload.pulse?.totals.ads_clients ?? 0,
      triggered: actionable,
      window,
      channel_slug: CHANNEL_SLUG,
      slack_posted,
      slack_skipped_reason,
      slack_error,
      details: { dry_run: dryRun, preview: text },
    };
  } catch (e) {
    return {
      ok: false,
      alert_id: MB_MORNING_DIGEST_ALERT_ID,
      event_key: MB_MORNING_DIGEST_EVENT_KEY,
      scanned: 0,
      triggered: 0,
      window: null,
      channel_slug: CHANNEL_SLUG,
      slack_posted: false,
      slack_skipped_reason: null,
      slack_error: e instanceof Error ? e.message : String(e),
      details: {},
    };
  }
}
