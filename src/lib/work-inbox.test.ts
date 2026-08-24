import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterInboxPlanTasks } from './account-week-plans';
import {
  canSeeUnownedFollowups,
  exclusiveEndIsoForCallCenterYmd,
  mapPlanApproveItem,
  mapPlanTaskItem,
  planTaskCompleteMode,
} from './work-inbox';

describe('work-inbox', () => {
  it('includes approved open tasks scheduled on or before the day', () => {
    const rows = [
      {
        id: 'today',
        plan_status: 'approved' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-24',
      },
      {
        id: 'overdue',
        plan_status: 'approved' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-20',
      },
      {
        id: 'future',
        plan_status: 'approved' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-25',
      },
      {
        id: 'pending-plan',
        plan_status: 'pending' as const,
        status: 'open' as const,
        assignee_user_id: 'u1',
        scheduled_for: '2026-08-24',
      },
      {
        id: 'other-person',
        plan_status: 'approved' as const,
        status: 'open' as const,
        assignee_user_id: 'u2',
        scheduled_for: '2026-08-24',
      },
    ];
    const active = filterInboxPlanTasks(rows, {
      assigneeUserId: 'u1',
      day: '2026-08-24',
    });
    assert.deepEqual(
      active.map(r => r.id).sort(),
      ['overdue', 'today'],
    );
  });

  it('maps bet plan tasks to deep_link and cadence to inline', () => {
    assert.equal(planTaskCompleteMode('bet'), 'deep_link');
    assert.equal(planTaskCompleteMode('cadence'), 'inline');
    assert.equal(planTaskCompleteMode(null), 'inline');
    const bet = mapPlanTaskItem({
      id: 't1',
      client_id: 'c1',
      client_name: 'Acme',
      title: 'New angle',
      work_type: 'bet',
      scheduled_for: '2026-08-24',
      assignee_user_id: 'u1',
    });
    assert.equal(bet.complete_mode, 'deep_link');
    assert.equal(bet.href, '/dashboard?view=account_work');
  });

  it('maps pending plans as deep_link approve items', () => {
    const item = mapPlanApproveItem({
      id: 'p1',
      client_id: 'c1',
      client_name: 'Acme',
      why: 'Show rate dip',
      week_start: '2026-08-24',
    });
    assert.equal(item.kind, 'plan_approve');
    assert.equal(item.complete_mode, 'deep_link');
  });

  it('exclusive end of Sao Paulo day is next local midnight', () => {
    assert.equal(exclusiveEndIsoForCallCenterYmd('2026-08-24'), '2026-08-25T03:00:00.000Z');
  });

  it('keeps unowned follow-ups off a non-lead CS plate', () => {
    assert.equal(
      canSeeUnownedFollowups({
        isOwner: false,
        isAdmin: false,
        allowedPermissions: ['team_dashboard'],
        payType: 'ccm',
      }),
      false,
    );
    assert.equal(
      canSeeUnownedFollowups({
        isOwner: false,
        isAdmin: false,
        allowedPermissions: ['client_health'],
        payType: 'client_success',
      }),
      true,
    );
  });
});
