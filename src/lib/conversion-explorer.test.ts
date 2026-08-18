import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  conversionExplorerNav,
  isConversionStage,
  isKpiRoiSub,
  matchesConversionRollup,
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
      sub: 'conversions',
      conv: 'loan_funded',
    });
  });
});

describe('explorer conversions tab', () => {
  it('lists Conversions next to Leads', () => {
    assert.equal(DATA_EXPLORER_TABS[0].key, 'leads');
    assert.equal(DATA_EXPLORER_TABS[1].key, 'conversions');
    assert.equal(DATA_EXPLORER_TABS[1].label, 'Conversions');
  });

  it('resolves explorer sub=conversions instead of falling back to leads', () => {
    assert.equal(resolveWorkspaceSubTab('explorer', 'conversions'), 'conversions');
    assert.equal(resolveWorkspaceSubTab('explorer', 'roi'), 'leads');
  });
});
