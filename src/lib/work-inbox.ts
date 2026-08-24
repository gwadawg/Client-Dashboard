/**
 * Read-time work inbox — union of existing tables. No tasks table.
 * Spec: docs/superpowers/specs/2026-08-24-work-inbox-and-account-work-cleanup-design.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { filterInboxPlanTasks } from '@/lib/account-week-plans';
import { CS_TOUCHPOINT_LABELS, type CsTouchpointType } from '@/lib/cs-touchpoints';
import { isBetWorkType } from '@/lib/client-work-log';
import { hasPermission, type AllowedPermissions } from '@/lib/permissions';
import { canAccessTeamCommandApi } from '@/lib/team-dashboards/access';
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz, zonedWallTimeToUtc } from '@/lib/time';

export const WORK_INBOX_KINDS = ['plan_task', 'cs_followup', 'plan_approve'] as const;
export type WorkInboxKind = (typeof WORK_INBOX_KINDS)[number];

export type WorkInboxCompleteMode = 'inline' | 'deep_link';

export type WorkInboxItem = {
  kind: WorkInboxKind;
  source_table: 'account_plan_tasks' | 'cs_touchpoints' | 'account_week_plans';
  source_id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  label: string;
  due_at: string | null;
  assignee_user_id: string | null;
  complete_mode: WorkInboxCompleteMode;
  href: string;
  blocked_reason: string | null;
};

export type WorkInboxWarning = { kind: WorkInboxKind; message: string };

export type WorkInboxPayload = {
  day: string;
  scope: 'me' | 'user';
  user_id: string;
  can_scope_user: boolean;
  items: WorkInboxItem[];
  warnings: WorkInboxWarning[];
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isWorkInboxYmd(v: unknown): v is string {
  return typeof v === 'string' && YMD.test(v);
}

export function exclusiveEndIsoForCallCenterYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedWallTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    CALL_CENTER_TIMEZONE,
  ).toISOString();
}

export function startIsoForCallCenterYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, 0, CALL_CENTER_TIMEZONE).toISOString();
}

export function planTaskCompleteMode(workType: string | null | undefined): WorkInboxCompleteMode {
  return isBetWorkType(workType) ? 'deep_link' : 'inline';
}

export function canSeeUnownedFollowups(opts: {
  isOwner: boolean;
  isAdmin: boolean;
  allowedPermissions: AllowedPermissions;
  payType?: string | null;
}): boolean {
  if (opts.isOwner || opts.isAdmin) return true;
  if (hasPermission('ceo', { isOwner: opts.isOwner, allowedPermissions: opts.allowedPermissions })) {
    return true;
  }
  return opts.payType === 'client_success';
}

export function canLoadWorkInbox(opts: {
  isOwner: boolean;
  isAdmin: boolean;
  allowedPermissions: AllowedPermissions;
  payType?: string | null;
  hasPlanAccess: boolean;
}): boolean {
  if (opts.hasPlanAccess) return true;
  return canAccessTeamCommandApi({
    isOwner: opts.isOwner,
    isAdmin: opts.isAdmin,
    allowedPermissions: opts.allowedPermissions,
    payType: opts.payType,
  });
}

export function mapPlanTaskItem(opts: {
  id: string;
  client_id: string;
  client_name: string | null;
  title: string;
  work_type?: string | null;
  scheduled_for: string | null;
  assignee_user_id: string | null;
}): WorkInboxItem {
  const bet = isBetWorkType(opts.work_type);
  return {
    kind: 'plan_task',
    source_table: 'account_plan_tasks',
    source_id: opts.id,
    client_id: opts.client_id,
    client_name: opts.client_name,
    title: opts.title,
    label: bet ? 'Bet' : opts.work_type === 'finding' ? 'Finding' : 'Cadence',
    due_at: opts.scheduled_for ? `${opts.scheduled_for}T12:00:00.000Z` : null,
    assignee_user_id: opts.assignee_user_id,
    complete_mode: planTaskCompleteMode(opts.work_type),
    href: '/dashboard?view=account_work',
    blocked_reason: bet ? 'Complete from Account Work (bet needs hypothesis + metric)' : null,
  };
}

export function mapFollowupItem(opts: {
  id: string;
  client_id: string;
  client_name: string | null;
  touchpoint_type: string;
  due_at: string;
}): WorkInboxItem {
  const type = opts.touchpoint_type as CsTouchpointType;
  const label = CS_TOUCHPOINT_LABELS[type] ?? opts.touchpoint_type;
  return {
    kind: 'cs_followup',
    source_table: 'cs_touchpoints',
    source_id: opts.id,
    client_id: opts.client_id,
    client_name: opts.client_name,
    title: opts.client_name ?? 'Follow-up',
    label,
    due_at: opts.due_at,
    assignee_user_id: null,
    complete_mode: 'inline',
    href: '/dashboard?view=client_health&tab=followups',
    blocked_reason: 'Completing requires Slack snippet',
  };
}

export function mapPlanApproveItem(opts: {
  id: string;
  client_id: string;
  client_name: string | null;
  why: string;
  week_start: string;
}): WorkInboxItem {
  return {
    kind: 'plan_approve',
    source_table: 'account_week_plans',
    source_id: opts.id,
    client_id: opts.client_id,
    client_name: opts.client_name,
    title: opts.why?.trim() || 'Week plan waiting for approval',
    label: 'Approve plan',
    due_at: `${opts.week_start}T12:00:00.000Z`,
    assignee_user_id: null,
    complete_mode: 'deep_link',
    href: '/dashboard?view=account_work',
    blocked_reason: 'Approve in Account Work',
  };
}

export function sortInboxItems(items: WorkInboxItem[], day: string): WorkInboxItem[] {
  const start = startIsoForCallCenterYmd(day);
  const rank = (k: WorkInboxKind) =>
    k === 'plan_approve' ? 0 : k === 'plan_task' ? 1 : 2;
  return [...items].sort((a, b) => {
    const aOver = a.due_at && a.due_at < start ? 0 : 1;
    const bOver = b.due_at && b.due_at < start ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const ad = a.due_at ?? '';
    const bd = b.due_at ?? '';
    if (ad !== bd) return ad.localeCompare(bd);
    return rank(a.kind) - rank(b.kind);
  });
}

type ClientRow = { id: string; name: string | null };

async function clientNames(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data, error } = await service.from('clients').select('id, name').in('id', unique);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as ClientRow[]) {
    map.set(row.id, row.name ?? 'Unknown client');
  }
  return map;
}

export async function loadWorkInbox(
  service: SupabaseClient,
  opts: {
    day: string;
    plateUserId: string;
    includePlanApprove: boolean;
    includeUnownedFollowups: boolean;
  },
): Promise<{ items: WorkInboxItem[]; warnings: WorkInboxWarning[] }> {
  const warnings: WorkInboxWarning[] = [];
  const items: WorkInboxItem[] = [];
  const day = opts.day || todayYmdInCallCenterTz();

  try {
    const { data: taskRows, error: taskErr } = await service
      .from('account_plan_tasks')
      .select(
        'id, plan_id, client_id, title, work_type, scheduled_for, assignee_user_id, status',
      )
      .eq('status', 'open')
      .eq('assignee_user_id', opts.plateUserId)
      .not('scheduled_for', 'is', null)
      .lte('scheduled_for', day);

    if (taskErr) throw new Error(taskErr.message);

    const planIds = [...new Set((taskRows ?? []).map(r => r.plan_id as string))];
    let planStatus = new Map<string, string>();
    if (planIds.length) {
      const { data: plans, error: planErr } = await service
        .from('account_week_plans')
        .select('id, status')
        .in('id', planIds);
      if (planErr) throw new Error(planErr.message);
      for (const p of plans ?? []) {
        planStatus.set(p.id as string, p.status as string);
      }
    }

    const joined = (taskRows ?? []).map(r => ({
      ...r,
      plan_status: (planStatus.get(r.plan_id as string) ?? 'pending') as
        | 'pending'
        | 'approved'
        | 'rejected',
      status: r.status as 'open' | 'done' | 'cancelled',
      assignee_user_id: r.assignee_user_id as string | null,
      scheduled_for: r.scheduled_for as string | null,
    }));

    const active = filterInboxPlanTasks(joined, {
      assigneeUserId: opts.plateUserId,
      day,
    });
    const names = await clientNames(
      service,
      active.map(r => r.client_id as string),
    );
    for (const t of active) {
      items.push(
        mapPlanTaskItem({
          id: t.id as string,
          client_id: t.client_id as string,
          client_name: names.get(t.client_id as string) ?? null,
          title: t.title as string,
          work_type: (t as { work_type?: string | null }).work_type,
          scheduled_for: t.scheduled_for,
          assignee_user_id: t.assignee_user_id,
        }),
      );
    }
  } catch (e) {
    warnings.push({
      kind: 'plan_task',
      message: e instanceof Error ? e.message : 'Failed to load plan tasks',
    });
  }

  if (opts.includePlanApprove) {
    try {
      const { data: pending, error } = await service
        .from('account_week_plans')
        .select('id, client_id, why, week_start, status')
        .eq('status', 'pending')
        .order('week_start', { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      const names = await clientNames(
        service,
        (pending ?? []).map(p => p.client_id as string),
      );
      for (const p of pending ?? []) {
        items.push(
          mapPlanApproveItem({
            id: p.id as string,
            client_id: p.client_id as string,
            client_name: names.get(p.client_id as string) ?? null,
            why: (p.why as string) ?? '',
            week_start: p.week_start as string,
          }),
        );
      }
    } catch (e) {
      warnings.push({
        kind: 'plan_approve',
        message: e instanceof Error ? e.message : 'Failed to load pending plans',
      });
    }
  }

  if (opts.includeUnownedFollowups) {
    try {
      const end = exclusiveEndIsoForCallCenterYmd(day);
      const { data: rows, error } = await service
        .from('cs_touchpoints')
        .select('id, client_id, touchpoint_type, status, due_at')
        .in('status', ['open', 'snoozed'])
        .lt('due_at', end)
        .order('due_at', { ascending: true })
        .limit(40);
      if (error) throw new Error(error.message);
      const names = await clientNames(
        service,
        (rows ?? []).map(r => r.client_id as string),
      );
      for (const r of rows ?? []) {
        items.push(
          mapFollowupItem({
            id: r.id as string,
            client_id: r.client_id as string,
            client_name: names.get(r.client_id as string) ?? null,
            touchpoint_type: r.touchpoint_type as string,
            due_at: r.due_at as string,
          }),
        );
      }
    } catch (e) {
      warnings.push({
        kind: 'cs_followup',
        message: e instanceof Error ? e.message : 'Failed to load follow-ups',
      });
    }
  }

  return { items: sortInboxItems(items, day), warnings };
}
