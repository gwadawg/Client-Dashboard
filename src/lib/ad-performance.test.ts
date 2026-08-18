import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AdLibraryResolver,
  aggregateAdPerformance,
  buildAdDrilldown,
  buildMultiAdDrilldown,
  resolveAdGranularity,
  rollupAdPerformanceByLibrary,
  type AdEventRow,
  type AdMetaRow,
} from './ad-performance';

function meta(partial: Partial<AdMetaRow> = {}): AdMetaRow {
  return {
    client_id: 'c1',
    ad_name: 'Hook A',
    insight_date: '2026-08-01',
    spend: 100,
    impressions: 1000,
    clicks: 20,
    ...partial,
  };
}

function evt(partial: Partial<AdEventRow> & { event_type: string }): AdEventRow {
  return {
    client_id: 'c1',
    ghl_contact_id: 'ghl-1',
    ad_name: 'Hook A',
    occurred_at: '2026-08-01T12:00:00.000Z',
    ...partial,
  };
}

describe('resolveAdGranularity', () => {
  it('uses day for ranges of 90 days or less', () => {
    assert.equal(resolveAdGranularity('2026-01-01', '2026-03-31'), 'day');
  });

  it('uses week when the range is over 90 days', () => {
    assert.equal(resolveAdGranularity('2026-01-01', '2026-04-15'), 'week');
  });
});

describe('aggregateAdPerformance unique funnel', () => {
  it('counts unique conversations so two shows on one contact do not double CPCONV', () => {
    const rows = aggregateAdPerformance(
      [meta({ spend: 200 })],
      [
        evt({ event_type: 'lead', is_qualified: true }),
        evt({ event_type: 'show', occurred_at: '2026-08-02T12:00:00.000Z' }),
        evt({ event_type: 'show', occurred_at: '2026-08-05T12:00:00.000Z' }),
      ],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].shows, 2);
    assert.equal(rows[0].unique_conversations, 1);
    assert.equal(rows[0].cp_conversation, 200);
    assert.equal(rows[0].cost_per_show, 100);
  });

  it('credits claimed and live_transfer as conversations and hand-raises', () => {
    const rows = aggregateAdPerformance(
      [meta({ spend: 300 })],
      [
        evt({ event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ event_type: 'lead', ghl_contact_id: 'b', is_qualified: true }),
        evt({ event_type: 'lead', ghl_contact_id: 'c', is_qualified: true }),
        evt({ event_type: 'claimed', ghl_contact_id: 'a', ad_name: null }),
        evt({ event_type: 'live_transfer', ghl_contact_id: 'b', ad_name: null }),
        evt({ event_type: 'appointment_booked', ghl_contact_id: 'c', ad_name: null }),
      ],
    );
    const row = rows[0];
    assert.equal(row.leads, 3);
    assert.equal(row.qualified, 3);
    assert.equal(row.unique_conversations, 2);
    assert.equal(row.unique_hand_raises, 3);
    assert.equal(row.cp_conversation, 150);
    assert.equal(row.hand_raise_rate, 100);
    assert.equal(row.conversation_rate, 66.7);
  });

  it('does not double CPCONV when the same contact is booked twice', () => {
    const rows = aggregateAdPerformance(
      [meta({ spend: 80 })],
      [
        evt({ event_type: 'lead', is_qualified: true }),
        evt({ event_type: 'appointment_booked', occurred_at: '2026-08-02T12:00:00.000Z' }),
        evt({ event_type: 'appointment_booked', occurred_at: '2026-08-04T12:00:00.000Z' }),
        evt({ event_type: 'show', occurred_at: '2026-08-04T15:00:00.000Z' }),
      ],
    );
    assert.equal(rows[0].appointments, 2);
    assert.equal(rows[0].unique_booked, 1);
    assert.equal(rows[0].unique_conversations, 1);
    assert.equal(rows[0].cp_conversation, 80);
    assert.equal(rows[0].booking_rate, 100);
  });

  it('computes CPL and CPQL from volume denominators', () => {
    const rows = aggregateAdPerformance(
      [meta({ spend: 400 })],
      [
        evt({ event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ event_type: 'lead', ghl_contact_id: 'b', is_qualified: false }),
      ],
    );
    assert.equal(rows[0].cpl, 200);
    assert.equal(rows[0].cost_per_qualified, 400);
    assert.equal(rows[0].qualified_rate, 50);
  });

  it('rolls funded borrowers into submissions and proposals without double-counting', () => {
    const rows = aggregateAdPerformance(
      [meta({ spend: 600 })],
      [
        evt({ event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ event_type: 'lead', ghl_contact_id: 'b', is_qualified: true }),
        evt({ event_type: 'proposal_made', ghl_contact_id: 'a', ad_name: null }),
        evt({ event_type: 'loan_funded', ghl_contact_id: 'b', ad_name: null }),
        evt({ event_type: 'loan_funded', ghl_contact_id: 'b', ad_name: null, occurred_at: '2026-08-08T12:00:00.000Z' }),
      ],
    );
    const row = rows[0];
    assert.equal(row.unique_proposals, 2);
    assert.equal(row.unique_submissions, 1);
    assert.equal(row.unique_funded, 1);
    assert.equal(row.closes, 2);
    assert.equal(row.cp_proposal, 300);
    assert.equal(row.cp_submission, 600);
    assert.equal(row.cp_funded, 600);
  });
});

describe('buildAdDrilldown', () => {
  it('splits spend and CPCONV by client and day', () => {
    const drill = buildAdDrilldown(
      'Hook A',
      [
        meta({ client_id: 'c1', spend: 100, insight_date: '2026-08-01' }),
        meta({ client_id: 'c2', spend: 300, insight_date: '2026-08-01' }),
      ],
      [
        evt({ client_id: 'c1', event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ client_id: 'c1', event_type: 'show', ghl_contact_id: 'a', ad_name: null }),
        evt({ client_id: 'c2', event_type: 'lead', ghl_contact_id: 'b', is_qualified: true }),
        evt({ client_id: 'c2', event_type: 'show', ghl_contact_id: 'b', ad_name: null }),
      ],
    );
    assert.equal(drill.granularity, 'day');
    assert.equal(drill.perClient.length, 2);
    const cheap = drill.perClient.find((c) => c.client_id === 'c1');
    const expensive = drill.perClient.find((c) => c.client_id === 'c2');
    assert.equal(cheap?.cp_conversation, 100);
    assert.equal(expensive?.cp_conversation, 300);
    assert.equal(drill.daily.length, 1);
    assert.equal(drill.daily[0].cp_conversation, 200);
    assert.equal(drill.perClientDaily.length, 2);
  });

  it('buckets by week when the range is over 90 days', () => {
    const drill = buildAdDrilldown(
      'Hook A',
      [
        meta({ spend: 50, insight_date: '2026-01-06' }),
        meta({ spend: 50, insight_date: '2026-01-07' }),
      ],
      [
        evt({ event_type: 'lead', is_qualified: true, occurred_at: '2026-01-06T12:00:00.000Z' }),
        evt({ event_type: 'show', occurred_at: '2026-01-07T12:00:00.000Z' }),
      ],
      { startDate: '2026-01-01', endDate: '2026-04-15' },
    );
    assert.equal(drill.granularity, 'week');
    assert.equal(drill.daily.length, 1);
    assert.equal(drill.daily[0].date, '2026-01-05');
    assert.equal(drill.daily[0].spend, 100);
    assert.equal(drill.daily[0].cp_conversation, 100);
  });
});

describe('rollupAdPerformanceByLibrary', () => {
  it('merges alias variants into one library row', () => {
    const perName = aggregateAdPerformance(
      [
        meta({ ad_name: 'Hook A', spend: 100 }),
        meta({ ad_name: 'Hook A v2', spend: 50 }),
      ],
      [
        evt({ ad_name: 'Hook A', event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ ad_name: 'Hook A v2', event_type: 'lead', ghl_contact_id: 'b', is_qualified: true }),
        evt({ ad_name: 'Hook A', event_type: 'show', ghl_contact_id: 'a' }),
      ],
    );
    const resolver = new AdLibraryResolver(
      [{
        id: 'lib-1',
        ad_name: 'Hook A',
        status: 'active',
        platform: 'facebook',
        ad_format: 'ugc',
        product: 'reverse',
        summary: null,
        visual_notes: null,
        drive_url: null,
        thumbnail_url: null,
      }],
      [{ id: 'al-1', library_id: 'lib-1', alias_name: 'Hook A v2' }],
    );
    const rolled = rollupAdPerformanceByLibrary(perName, resolver);
    assert.equal(rolled.length, 1);
    assert.equal(rolled[0].spend, 150);
    assert.equal(rolled[0].leads, 2);
    assert.equal(rolled[0].unique_conversations, 1);
    assert.equal(rolled[0].is_sourced, true);
    assert.deepEqual(rolled[0].variant_names, ['Hook A', 'Hook A v2']);
  });
});

describe('buildMultiAdDrilldown', () => {
  it('keeps unique conversations when merging variants', () => {
    const drill = buildMultiAdDrilldown(
      'Hook A',
      ['Hook A', 'Hook A v2'],
      [
        meta({ ad_name: 'Hook A', spend: 100 }),
        meta({ ad_name: 'Hook A v2', spend: 100 }),
      ],
      [
        evt({ ad_name: 'Hook A', event_type: 'lead', ghl_contact_id: 'a', is_qualified: true }),
        evt({ ad_name: 'Hook A', event_type: 'show', ghl_contact_id: 'a' }),
        evt({ ad_name: 'Hook A v2', event_type: 'lead', ghl_contact_id: 'b', is_qualified: true }),
        evt({ ad_name: 'Hook A v2', event_type: 'claimed', ghl_contact_id: 'b' }),
      ],
      'lib-1',
    );
    assert.equal(drill.daily[0].unique_conversations, 2);
    assert.equal(drill.daily[0].cp_conversation, 100);
    assert.equal(drill.variants?.length, 2);
  });
});
