import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ClientHealthRow, HealthTier, KpiGrade, KpiKey, RecentLeading } from './client-health';
import {
  ccmStatus,
  deptStatus,
  gradesForLens,
  mediaBuyerStatus,
  worstTier,
} from './dept-health';

function grade(key: KpiKey, tier: HealthTier): KpiGrade {
  return { key, label: key, value: 0, display: '—', tier, tierLabel: tier };
}

function stubRow(opts: {
  worst?: HealthTier;
  grades?: KpiGrade[];
  leading?: KpiGrade[];
  appt_booking_rate?: number;
  conversation_rate?: number;
}): ClientHealthRow {
  const grades = opts.grades ?? [];
  const recent: RecentLeading | null = opts.leading
    ? {
        start: '2026-07-01',
        end: '2026-07-07',
        window_days: 7,
        leads: 20,
        qualified_leads: 10,
        dials: 40,
        booking_rate: 25,
        lead_to_qualified_pct: 50,
        hand_raise_rate: 25,
        cpl: 20,
        cpql: 40,
        conversations: 5,
        momentum: 'stable',
        leading_grades: opts.leading,
      }
    : null;

  return {
    client_id: 'c1',
    client_name: 'Test',
    is_live: true,
    reporting_type: 'RM',
    current: {
      metrics: {
        new_leads: 100,
        qualified_leads: 50,
        appt_booking_rate: opts.appt_booking_rate ?? 30,
        conversation_rate: opts.conversation_rate ?? 30,
        hand_raise_rate: 30,
        net_show_pct: 70,
        lead_booking_rate: 8,
        outbound_dials: 200,
        cpl: 15,
        cp_conversation: 80,
        ad_spend: 1500,
        booked_appointments: 15,
        shows: 10,
        no_shows: 4,
        live_transfers: 2,
        claimed: 1,
        closed: 2,
        pickup_pct: 40,
      } as ClientHealthRow['current']['metrics'],
      lead_to_qualified_pct: 50,
      close_rate_pct: 20,
      cpql: 30,
      cpconv: 80,
      conversation_yield: 0.3,
      optin_rate_pct: 0,
      grades,
      worst_tier: opts.worst ?? 'at',
      attention_score: 2,
      constraint: 'healthy',
      constraint_label: 'ok',
    },
    prior: null,
    trend: 'stable',
    trend_delta_score: 0,
    has_activity: true,
    recent,
    recent_prior: null,
    focus: {
      focus: 'on_track',
      label: 'On track',
      verdict_critical: false,
      leading_critical: false,
    },
    open_action: null,
    launch_date: null,
    is_fresh_launch: false,
    fresh: null,
  };
}

describe('worstTier', () => {
  it('returns the worst graded tier', () => {
    assert.equal(worstTier('above', 'at', 'critical'), 'critical');
    assert.equal(worstTier('above', 'below'), 'below');
  });
});

describe('mediaBuyerStatus', () => {
  it('is critical when CPL is critical even if account CPConv is fine', () => {
    const row = stubRow({
      worst: 'at',
      grades: [
        grade('cpl', 'critical'),
        grade('cpql', 'at'),
        grade('lead_to_qualified', 'at'),
        grade('cps', 'at'),
      ],
    });
    assert.equal(mediaBuyerStatus(row), 'critical');
    assert.equal(deptStatus(row, 'overview', false), 'at');
  });

  it('prefers leading CPL/CPQL/qual over baseline', () => {
    const row = stubRow({
      worst: 'at',
      grades: [
        grade('cpl', 'above'),
        grade('cpql', 'above'),
        grade('lead_to_qualified', 'above'),
      ],
      leading: [
        grade('cpl', 'critical'),
        grade('cpql', 'at'),
        grade('lead_to_qualified', 'at'),
      ],
    });
    assert.equal(mediaBuyerStatus(row), 'critical');
  });

  it('never uses CPConv', () => {
    const row = stubRow({
      worst: 'critical',
      grades: [
        grade('cpl', 'above'),
        grade('cpql', 'above'),
        grade('lead_to_qualified', 'above'),
        grade('cps', 'critical'),
      ],
    });
    assert.equal(mediaBuyerStatus(row), 'above');
  });
});

describe('ccmStatus', () => {
  it('stays healthy when only CPConv / CPL are 911', () => {
    const row = stubRow({
      worst: 'critical',
      grades: [
        grade('show_rate', 'above'),
        grade('hand_raise_rate', 'above'),
        grade('cps', 'critical'),
        grade('cpl', 'critical'),
      ],
      appt_booking_rate: 30,
      conversation_rate: 30,
    });
    assert.notEqual(ccmStatus(row, false), 'critical');
    assert.notEqual(deptStatus(row, 'ccm', false), 'critical');
  });

  it('is critical when show rate is critical', () => {
    const row = stubRow({
      worst: 'at',
      grades: [
        grade('show_rate', 'critical'),
        grade('hand_raise_rate', 'above'),
      ],
    });
    assert.equal(ccmStatus(row, false), 'critical');
  });
});

describe('gradesForLens', () => {
  it('filters to media owner KPIs', () => {
    const grades = [
      grade('cpl', 'critical'),
      grade('hand_raise_rate', 'at'),
      grade('cps', 'critical'),
    ];
    assert.deepEqual(
      gradesForLens(grades, 'media_buyer').map(g => g.key),
      ['cpl'],
    );
    assert.deepEqual(
      gradesForLens(grades, 'ccm').map(g => g.key),
      ['hand_raise_rate'],
    );
    assert.equal(gradesForLens(grades, 'overview').length, 3);
  });
});
