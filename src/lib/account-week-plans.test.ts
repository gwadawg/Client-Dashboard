import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canApprovePlans,
  canCompleteTask,
  canPatchPlanReflection,
  canTransitionPlan,
  filterActiveWorkTasks,
  filterAdhocLogsForPlanWeek,
  isAccountPlanTaskStatus,
  isAccountWeekPlanStatus,
  isReflectionOnlyPatch,
  isTaskOverdue,
  softDuplicatePlanWarn,
  weekPlanModeForTemplateSlug,
  weekStartMondayContaining,
} from './account-week-plans';
import { hasPermission } from './permissions';
import { LOG_WORK_PERMISSIONS } from './client-work-log';

describe('account-week-plans', () => {
  it('weekStartMondayContaining returns Monday for mid-week and Sunday', () => {
    assert.equal(weekStartMondayContaining('2026-08-06'), '2026-08-03');
    assert.equal(weekStartMondayContaining('2026-08-09'), '2026-08-03');
    assert.equal(weekStartMondayContaining('2026-08-03'), '2026-08-03');
  });

  it('plan transitions: pending → approved|rejected only', () => {
    assert.equal(canTransitionPlan('pending', 'approved').ok, true);
    assert.equal(canTransitionPlan('pending', 'rejected').ok, true);
    assert.equal(canTransitionPlan('approved', 'rejected').ok, false);
    assert.equal(canTransitionPlan('rejected', 'approved').ok, false);
  });

  it('canCompleteTask requires approved plan and open task', () => {
    assert.equal(canCompleteTask({ planStatus: 'approved', taskStatus: 'open' }).ok, true);
    assert.equal(canCompleteTask({ planStatus: 'pending', taskStatus: 'open' }).ok, false);
    assert.equal(canCompleteTask({ planStatus: 'approved', taskStatus: 'done' }).ok, false);
  });

  it('filterActiveWorkTasks requires approved plan + open status', () => {
    const rows = [
      {
        id: '1',
        plan_status: 'approved' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-05',
      },
      {
        id: '2',
        plan_status: 'pending' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-05',
      },
      {
        id: '3',
        plan_status: 'approved' as const,
        status: 'done' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-05',
      },
    ];
    const active = filterActiveWorkTasks(rows, {
      assigneeUserId: 'u1',
      scheduledFor: '2026-08-05',
    });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, '1');
  });

  it('softDuplicatePlanWarn flags non-rejected same client+week', () => {
    const warn = softDuplicatePlanWarn(
      [
        {
          client_id: 'c1',
          week_start: '2026-08-03',
          status: 'pending',
        },
      ],
      'c1',
      '2026-08-03',
    );
    assert.equal(warn, true);
  });

  it('status type guards', () => {
    assert.equal(isAccountWeekPlanStatus('pending'), true);
    assert.equal(isAccountWeekPlanStatus('draft'), false);
    assert.equal(isAccountPlanTaskStatus('open'), true);
    assert.equal(isAccountPlanTaskStatus('active'), false);
  });

  it('weekPlanModeForTemplateSlug maps mon/thu only', () => {
    assert.equal(weekPlanModeForTemplateSlug('mon-kpi-week-plan'), 'intake');
    assert.equal(weekPlanModeForTemplateSlug('thu-kpi-commitment-check'), 'review');
    assert.equal(weekPlanModeForTemplateSlug('mon-ops-planning'), null);
  });

  it('canApprovePlans allows owner or ceo', () => {
    assert.equal(canApprovePlans({ isOwner: true, hasCeoPermission: false }), true);
    assert.equal(canApprovePlans({ isOwner: false, hasCeoPermission: true }), true);
    assert.equal(canApprovePlans({ isOwner: false, hasCeoPermission: false }), false);
  });

  it('isTaskOverdue only for approved open past scheduled day', () => {
    assert.equal(
      isTaskOverdue({
        planStatus: 'approved',
        taskStatus: 'open',
        scheduledFor: '2026-08-01',
        todayYmd: '2026-08-06',
      }),
      true,
    );
    assert.equal(
      isTaskOverdue({
        planStatus: 'pending',
        taskStatus: 'open',
        scheduledFor: '2026-08-01',
        todayYmd: '2026-08-06',
      }),
      false,
    );
    assert.equal(
      isTaskOverdue({
        planStatus: 'approved',
        taskStatus: 'done',
        scheduledFor: '2026-08-01',
        todayYmd: '2026-08-06',
      }),
      false,
    );
    assert.equal(
      isTaskOverdue({
        planStatus: 'approved',
        taskStatus: 'open',
        scheduledFor: '2026-08-06',
        todayYmd: '2026-08-06',
      }),
      false,
    );
  });

  it('isReflectionOnlyPatch ignores empty extra keys', () => {
    assert.equal(isReflectionOnlyPatch({ reflection: 'Keep the offer' }), true);
    assert.equal(isReflectionOnlyPatch({ reflection: 'Keep', why: 'new why' }), false);
    assert.equal(isReflectionOnlyPatch({ why: 'x' }), false);
  });

  it('canPatchPlanReflection blocks rejected plans', () => {
    assert.equal(canPatchPlanReflection('approved').ok, true);
    assert.equal(canPatchPlanReflection('pending').ok, true);
    assert.equal(canPatchPlanReflection('rejected').ok, false);
  });

  it('filterAdhocLogsForPlanWeek drops linked tasks and other weeks', () => {
    const logs = [
      {
        id: 'linked',
        client_id: 'c1',
        title: 'From plan',
        work_type: 'cadence',
        change_date: '2026-08-05',
        planned_date: null,
        created_at: '2026-08-05T12:00:00.000Z',
        status: 'in_progress',
      },
      {
        id: 'adhoc',
        client_id: 'c1',
        title: 'Killed ads',
        work_type: 'cadence',
        change_date: '2026-08-06',
        planned_date: null,
        created_at: '2026-08-06T12:00:00.000Z',
        status: 'in_progress',
      },
      {
        id: 'other-week',
        client_id: 'c1',
        title: 'Last week',
        work_type: 'finding',
        change_date: '2026-07-28',
        planned_date: null,
        created_at: '2026-07-28T12:00:00.000Z',
        status: 'in_progress',
      },
    ];
    const adhoc = filterAdhocLogsForPlanWeek(logs, {
      clientId: 'c1',
      weekStart: '2026-08-03',
      linkedLogIds: ['linked'],
    });
    assert.equal(adhoc.length, 1);
    assert.equal(adhoc[0].id, 'adhoc');
  });
});

describe('log-work permissions', () => {
  it('client_workspace without client_health can log work', () => {
    const workspaceOnly = { isOwner: false, allowedPermissions: ['client_workspace'] };
    assert.equal(
      LOG_WORK_PERMISSIONS.some(key => hasPermission(key, workspaceOnly)),
      true,
    );
    const agentsOnly = { isOwner: false, allowedPermissions: ['agents'] };
    assert.equal(
      LOG_WORK_PERMISSIONS.some(key => hasPermission(key, agentsOnly)),
      false,
    );
  });
});
