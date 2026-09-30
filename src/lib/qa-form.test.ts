import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyQaFormDraft,
  formatQaClickUpComment,
  getFirstIncompleteQaItemKey,
  getQaFormConfig,
  isQaChecklistComplete,
  isQaCompleteForCycle,
  isQaLane,
  isQaLifecycle,
  qaDraftToResponses,
  QA_FINAL_CONFIRMATION,
  QA_SKELETON_VERSION,
} from '@/lib/qa-form';

function completeDraft(lane: 'tech_setup' | 'media_buying') {
  const config = getQaFormConfig(lane);
  const draft = emptyQaFormDraft(config, 'christian@waiz.media');
  for (const item of config.items) draft.checklist[item.key] = true;
  draft.final_confirmation = QA_FINAL_CONFIRMATION;
  draft.evidence = 'https://example.com/evidence';
  return { config, draft };
}

describe('qa-form', () => {
  it('keeps two shared lanes, not per-client form definitions', () => {
    assert.equal(isQaLane('tech_setup'), true);
    assert.equal(isQaLane('media_buying'), true);
    assert.equal(isQaLane('funnel'), false);
    assert.equal(getQaFormConfig('tech_setup').formType, 'tech_qa');
    assert.equal(getQaFormConfig('media_buying').formType, 'marketing_qa');
    assert.equal(getQaFormConfig('tech_setup').clickupFieldKey, 'tech_qa');
    assert.equal(getQaFormConfig('media_buying').clickupFieldKey, 'marketing_qa');
  });

  it('is only available during onboarding lifecycles', () => {
    assert.equal(isQaLifecycle('new_account'), true);
    assert.equal(isQaLifecycle('onboarding'), true);
    assert.equal(isQaLifecycle('active'), false);
    assert.equal(isQaLifecycle('churned'), false);
    assert.equal(isQaLifecycle(null), false);
  });

  it('requires every checklist item plus completed-by and QA confirmation', () => {
    const { config, draft } = completeDraft('tech_setup');
    assert.equal(isQaChecklistComplete(draft, config), true);
    assert.equal(getFirstIncompleteQaItemKey(draft, config), null);

    draft.checklist.a2p_status_checked = false;
    assert.equal(isQaChecklistComplete(draft, config), false);
    assert.equal(getFirstIncompleteQaItemKey(draft, config), 'a2p_status_checked');

    draft.checklist.a2p_status_checked = true;
    draft.final_confirmation = 'yes';
    assert.equal(isQaChecklistComplete(draft, config), false);
  });

  it('stores answers in responses JSON, not ClickUp custom fields', () => {
    const { config, draft } = completeDraft('media_buying');
    const responses = qaDraftToResponses(draft, config);
    assert.equal(responses.qa_lane, 'media_buying');
    assert.equal(responses.skeleton_version, QA_SKELETON_VERSION);
    assert.equal(responses.completed_by_label, 'christian@waiz.media');
    assert.equal((responses.checklist as Record<string, boolean>).funnel_link_checked, true);
    assert.equal(responses.evidence, 'https://example.com/evidence');
  });

  it('formats a ClickUp comment with the shared checklist, not a per-client form body', () => {
    const { config, draft } = completeDraft('tech_setup');
    const comment = formatQaClickUpComment({ id: 'client-1', name: 'Acme LO' }, config, draft);
    assert.match(comment, /Tech Setup QA submitted/);
    assert.match(comment, /Mr\. Waiz ID: client-1/);
    assert.match(comment, /qa-skeleton-v0/);
    assert.match(comment, /A2P status checked/);
  });

  it('treats a reinstate as a new QA cycle', () => {
    const rows = [
      { form_type: 'tech_qa', submitted_at: '2026-01-01T00:00:00.000Z', status: 'applied' },
      { form_type: 'reinstate', submitted_at: '2026-09-01T00:00:00.000Z', status: 'applied' },
    ];
    assert.equal(isQaCompleteForCycle(rows, 'tech_qa'), false);
    assert.equal(
      isQaCompleteForCycle(
        [
          ...rows,
          { form_type: 'tech_qa', submitted_at: '2026-09-02T00:00:00.000Z', status: 'applied' },
        ],
        'tech_qa',
      ),
      true,
    );
  });
});
