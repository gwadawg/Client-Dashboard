import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  conversionExplorerNav,
  isActivityStage,
  isConversionStage,
  isKpiRoiSub,
  isLeadQualityFilter,
  matchesActivityStage,
  matchesConversionRollup,
  matchesLeadQuality,
  profilesForConversionExplorer,
  shouldShowConversionCosts,
} from './conversion-explorer';
import { DATA_EXPLORER_TABS, resolveWorkspaceSubTab } from './nav';

const fundedOnly = {
  has_proposal_made: false,
  has_submission_made: false,
  has_loan_funded: true,
  has_lead_in_period: false,
};

const proposalOnly = {
  has_proposal_made: true,
  has_submission_made: false,
  has_loan_funded: false,
  has_lead_in_period: true,
};

describe('conversion-explorer', () => {
  it('treats roi and conversions as the KPI ROI sub', () => {
    assert.equal(isKpiRoiSub('roi'), true);
    assert.equal(isKpiRoiSub('conversions'), true);
    assert.equal(isKpiRoiSub('leads'), false);
    assert.equal(isKpiRoiSub(null), false);
  });

  it('accepts only the three canonical conv values', () => {
    assert.equal(isConversionStage('proposal_made'), true);
    assert.equal(isConversionStage('loan_funded'), true);
    assert.equal(isConversionStage('lead'), false);
    assert.equal(isConversionStage(''), false);
  });

  it('rolls later stages into earlier filters', () => {
    assert.equal(matchesConversionRollup(fundedOnly, 'proposal_made'), true);
    assert.equal(matchesConversionRollup(fundedOnly, 'submission_made'), true);
    assert.equal(matchesConversionRollup(fundedOnly, 'loan_funded'), true);
    assert.equal(matchesConversionRollup(proposalOnly, 'submission_made'), false);
    assert.equal(matchesConversionRollup(proposalOnly, 'loan_funded'), false);
  });

  it('lists conversion-in-range contacts even without a lead event in range', () => {
    const rows = profilesForConversionExplorer(
      [fundedOnly, proposalOnly],
      'loan_funded',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0], fundedOnly);
  });

  it('keeps lead-in-period only when no conversion filter is set', () => {
    const rows = profilesForConversionExplorer(
      [fundedOnly, proposalOnly],
      null,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0], proposalOnly);
  });

  it('hides cost cards when spend is 0', () => {
    assert.equal(shouldShowConversionCosts(0), false);
    assert.equal(shouldShowConversionCosts(12.5), true);
  });

  it('builds explorer nav for a KPI click', () => {
    assert.deepEqual(conversionExplorerNav('loan_funded'), {
      view: 'client_workspace',
      tab: 'explorer',
      sub: 'leads',
      conv: 'loan_funded',
    });
  });
});

describe('explorer leads tab', () => {
  it('lists Call Log next to Leads (no separate Conversions tab)', () => {
    assert.deepEqual(
      DATA_EXPLORER_TABS.map(t => t.key),
      ['leads', 'dials', 'appointments', 'speed_to_lead', 'meta_ads'],
    );
    assert.equal(DATA_EXPLORER_TABS[1].label, 'Call Log');
  });

  it('canonicalizes legacy explorer sub=conversions to leads', () => {
    assert.equal(resolveWorkspaceSubTab('explorer', 'conversions'), 'leads');
    assert.equal(resolveWorkspaceSubTab('explorer', 'roi'), 'leads');
  });
});


describe('activity and quality filters', () => {
  it('recognizes activity stage values', () => {
    assert.equal(isActivityStage('conversations'), true);
    assert.equal(isActivityStage('claimed'), true);
    assert.equal(isActivityStage('live_transfer'), true);
    assert.equal(isActivityStage('show'), true);
    assert.equal(isActivityStage('proposal_made'), false);
  });

  it('matches conversations as claimed ∪ live transfer ∪ show', () => {
    assert.equal(matchesActivityStage({ claimed: 1, live_transfers: 0, shows: 0 }, 'conversations'), true);
    assert.equal(matchesActivityStage({ claimed: 0, live_transfers: 1, shows: 0 }, 'conversations'), true);
    assert.equal(matchesActivityStage({ claimed: 0, live_transfers: 0, shows: 1 }, 'conversations'), true);
    assert.equal(matchesActivityStage({ claimed: 0, live_transfers: 0, shows: 0 }, 'conversations'), false);
    assert.equal(matchesActivityStage({ claimed: 0, live_transfers: 2, shows: 0 }, 'live_transfer'), true);
    assert.equal(matchesActivityStage({ claimed: 0, live_transfers: 2, shows: 0 }, 'claimed'), false);
  });

  it('filters lead quality flags', () => {
    assert.equal(isLeadQualityFilter('qualified_hot'), true);
    assert.equal(matchesLeadQuality({ is_qualified: true, is_hot: true }, 'qualified_hot'), true);
    assert.equal(matchesLeadQuality({ is_qualified: true, is_hot: false }, 'qualified_hot'), false);
    assert.equal(matchesLeadQuality({ is_qualified: true, is_hot: false }, 'qualified'), true);
    assert.equal(matchesLeadQuality({ is_qualified: false, is_hot: true }, 'hot'), true);
  });

  it('lists conversation-stage leads via profilesForConversionExplorer', () => {
    const rows = profilesForConversionExplorer(
      [
        {
          has_proposal_made: false,
          has_submission_made: false,
          has_loan_funded: false,
          has_lead_in_period: true,
          counts: { claimed: 0, live_transfers: 1, shows: 0 },
        },
        {
          has_proposal_made: false,
          has_submission_made: false,
          has_loan_funded: false,
          has_lead_in_period: true,
          counts: { claimed: 0, live_transfers: 0, shows: 0 },
        },
      ],
      'conversations',
    );
    assert.equal(rows.length, 1);
  });
});
