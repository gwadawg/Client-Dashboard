import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWaizPreset,
  decodeSimulatorState,
  encodeSimulatorState,
  metricsToSimulatorInputs,
  simulateFunnel,
  solveForTargetFunded,
  type SimulatorInputs,
} from './kpi-simulator';
import type { MetricsResult } from './metrics';

function baseInputs(overrides: Partial<SimulatorInputs> = {}): SimulatorInputs {
  return {
    funnel_mode: 'conversation',
    cost_anchor: 'spend_cpl',
    ad_spend: 5000,
    cpl: 10,
    total_leads: 0,
    lead_to_qual_pct: 60,
    booking_rate_pct: 30,
    net_show_rate_pct: 65,
    live_transfer_pct: 2,
    claimed_pct: 1,
    conversation_close_rate_pct: 25,
    proposal_rate_pct: 50,
    submission_rate_pct: 60,
    funded_rate_pct: 30,
    avg_commission: 8500,
    ...overrides,
  };
}

describe('kpi-simulator', () => {
  it('conversation mode: closes = conversations × close rate', () => {
    const result = simulateFunnel(baseInputs({ conversation_close_rate_pct: 20 }));
    assert.ok(result.counts.conversations > 0);
    assert.equal(
      result.counts.funded_loans,
      result.counts.conversations * 0.2,
    );
    assert.equal(result.counts.proposals_made, 0);
  });

  it('pipeline mode: full LO stages', () => {
    const result = simulateFunnel(baseInputs({ funnel_mode: 'pipeline' }));
    assert.ok(result.counts.proposals_made > 0);
    assert.ok(result.counts.submissions_made > 0);
    assert.ok(result.counts.funded_loans > 0);
  });

  it('forward pass derives leads from spend and CPL', () => {
    const result = simulateFunnel(baseInputs({ ad_spend: 5000, cpl: 10 }));
    assert.equal(result.counts.total_leads, 500);
    assert.equal(result.costs.cpl, 10);
  });

  it('forward pass computes CPConv = spend / conversations', () => {
    const result = simulateFunnel(baseInputs());
    const expected = result.ad_spend / result.counts.conversations;
    assert.ok(result.counts.conversations > 0);
    assert.ok(Math.abs(result.costs.cp_conversation - expected) < 0.01);
  });

  it('CPConv cross-check matches CPQL / conversation yield', () => {
    const result = simulateFunnel(baseInputs());
    assert.ok(result.cpconv_cross_check != null);
    assert.ok(Math.abs(result.costs.cp_conversation - (result.cpconv_cross_check as number)) < 0.01);
  });

  it('reverse solve hits close target in conversation mode', () => {
    const inputs = baseInputs();
    const forward = simulateFunnel(inputs);
    const target = Math.max(4, Math.ceil(forward.counts.funded_loans) + 2);
    const solved = solveForTargetFunded(target, inputs, forward);
    assert.ok(solved);
    assert.equal(solved!.required.funded_loans, target);
    assert.ok(solved!.required.ad_spend > forward.ad_spend);
  });

  it('encode/decode round-trips simulator state', () => {
    const inputs = applyWaizPreset('at_kpi');
    const encoded = encodeSimulatorState(inputs);
    const decoded = decodeSimulatorState(encoded);
    assert.deepEqual(decoded, inputs);
  });

  it('decode migrates legacy state without funnel_mode', () => {
    const legacy = applyWaizPreset('at_kpi');
    const { funnel_mode: _, conversation_close_rate_pct: __, ...rest } = legacy;
    const encoded = btoa(JSON.stringify(rest));
    const decoded = decodeSimulatorState(encoded);
    assert.ok(decoded);
    assert.equal(decoded!.funnel_mode, 'conversation');
    assert.ok(decoded!.conversation_close_rate_pct > 0);
  });

  it('metricsToSimulatorInputs uses conversation close rate', () => {
    const metrics = {
      new_leads: 100,
      qualified_leads: 60,
      qualified_rate: 60,
      ad_spend: 1500,
      cpl: 15,
      appt_booking_rate: 28,
      net_show_pct: 68,
      live_transfers: 3,
      claimed: 2,
      shows: 12,
      proposals_made: 8,
      submissions_made: 5,
      funded_loans: 2,
    } as MetricsResult;

    const inputs = metricsToSimulatorInputs(metrics);
    const conversations = 17;
    assert.equal(inputs.conversation_close_rate_pct, (2 / conversations) * 100);
    assert.equal(inputs.funnel_mode, 'conversation');
  });
});
