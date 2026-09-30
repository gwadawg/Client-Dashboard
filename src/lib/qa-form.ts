import { latestReinstateCutoffIso, mapCycleProgress } from '@/lib/reinstate-progress';

export const QA_SKELETON_VERSION = 'qa-skeleton-v0';
export const QA_FINAL_CONFIRMATION = 'QA';

/** Same onboarding window as kickoff / launch. QA is not a live-account action. */
export function isQaLifecycle(status: string | null | undefined): boolean {
  return status === 'new_account' || status === 'onboarding';
}

export function isQaCompleteForCycle(
  rows: Array<{ form_type: string; submitted_at: string; status?: string }>,
  formType: 'tech_qa' | 'marketing_qa',
): boolean {
  return !!mapCycleProgress(rows, latestReinstateCutoffIso(rows))[formType];
}

export type QaLane = 'tech_setup' | 'media_buying';

export type QaChecklistItemDef = {
  key: string;
  label: string;
  helpText?: string;
};

export type QaFormConfig = {
  lane: QaLane;
  formType: 'tech_qa' | 'marketing_qa';
  clickupFieldKey: 'tech_qa' | 'marketing_qa';
  title: string;
  shortLabel: string;
  description: string;
  ownerLabel: string;
  items: QaChecklistItemDef[];
};

export type QaFormDraft = {
  completed_by_label: string;
  checklist: Record<string, boolean>;
  evidence: string;
  blockers: string;
  notes: string;
  final_confirmation: string;
};

export const QA_FORM_CONFIGS: Record<QaLane, QaFormConfig> = {
  tech_setup: {
    lane: 'tech_setup',
    formType: 'tech_qa',
    clickupFieldKey: 'tech_qa',
    title: 'Tech Setup QA',
    shortLabel: 'Tech QA',
    ownerLabel: 'Tech / VA',
    description:
      'Skeleton QA gate for A2P, GHL, routing, phone, and Closebot readiness. This closes the Tech QA fact for ClickUp automation testing.',
    items: [
      {
        key: 'a2p_status_checked',
        label: 'A2P status checked and any dependency is noted',
      },
      {
        key: 'ghl_subaccount_ready',
        label: 'GHL subaccount, custom values, calendar, and routing basics reviewed',
      },
      {
        key: 'phone_and_notifications_checked',
        label: 'Prospecting, notification, and live-transfer phone paths checked where applicable',
      },
      {
        key: 'closebot_or_booking_path_checked',
        label: 'Closebot / booking path reviewed or marked not applicable',
      },
      {
        key: 'no_unresolved_launch_blocker',
        label: 'No unresolved tech blocker remains for launch review',
        helpText: 'If something is still open, do not submit this QA. Note the blocker on the ClickUp lane task instead.',
      },
    ],
  },
  media_buying: {
    lane: 'media_buying',
    formType: 'marketing_qa',
    clickupFieldKey: 'marketing_qa',
    title: 'Media Buying QA',
    shortLabel: 'Media QA',
    ownerLabel: 'Media Buyer',
    description:
      'Skeleton QA gate for media buying and funnel readiness. This closes the Marketing QA fact for ClickUp automation testing.',
    items: [
      {
        key: 'ad_access_confirmed',
        label: 'Ad account, page, pixel, and required access reviewed',
      },
      {
        key: 'funnel_link_checked',
        label: 'Funnel link is present, opens correctly, and matches the intended offer',
      },
      {
        key: 'campaign_structure_ready',
        label: 'Campaign/ad set structure is prepared for launch review',
      },
      {
        key: 'creative_and_copy_reviewed',
        label: 'Creative, copy, naming, and compliance language received a launch-readiness pass',
      },
      {
        key: 'no_unresolved_marketing_blocker',
        label: 'No unresolved marketing blocker remains for launch review',
        helpText: 'If ads, funnel, or access are still blocked, leave QA pending and note the blocker in ClickUp.',
      },
    ],
  },
};

export function isQaLane(value: string): value is QaLane {
  return value === 'tech_setup' || value === 'media_buying';
}

export function getQaFormConfig(lane: QaLane): QaFormConfig {
  return QA_FORM_CONFIGS[lane];
}

export function emptyQaFormDraft(config: QaFormConfig, completedByLabel = ''): QaFormDraft {
  return {
    completed_by_label: completedByLabel,
    checklist: Object.fromEntries(config.items.map(item => [item.key, false])),
    evidence: '',
    blockers: '',
    notes: '',
    final_confirmation: '',
  };
}

export function isQaChecklistComplete(draft: QaFormDraft, config: QaFormConfig): boolean {
  if (!draft.completed_by_label.trim()) return false;
  if (draft.final_confirmation.trim().toUpperCase() !== QA_FINAL_CONFIRMATION) return false;
  return config.items.every(item => draft.checklist[item.key] === true);
}

export function getFirstIncompleteQaItemKey(
  draft: QaFormDraft,
  config: QaFormConfig,
): string | null {
  for (const item of config.items) {
    if (draft.checklist[item.key] !== true) return item.key;
  }
  return null;
}

export function qaDraftToResponses(
  draft: QaFormDraft,
  config: QaFormConfig,
): Record<string, unknown> {
  return {
    qa_lane: config.lane,
    skeleton_version: QA_SKELETON_VERSION,
    completed_by_label: draft.completed_by_label.trim(),
    checklist: draft.checklist,
    evidence: draft.evidence.trim() || null,
    blockers: draft.blockers.trim() || null,
    notes: draft.notes.trim() || null,
    final_confirmation: draft.final_confirmation.trim().toUpperCase(),
  };
}

export function formatQaClickUpComment(
  client: { id: string; name: string },
  config: QaFormConfig,
  draft: QaFormDraft,
): string {
  const lines = [
    `✅ ${config.title} submitted`,
    '',
    `Client (Mr. Waiz): ${client.name}`,
    `Mr. Waiz ID: ${client.id}`,
    `Skeleton: ${QA_SKELETON_VERSION}`,
    `Completed by: ${draft.completed_by_label.trim() || '—'}`,
    '',
    '— Checklist —',
    ...config.items.map(item => `✓ ${item.label}`),
  ];

  const evidence = draft.evidence.trim();
  const blockers = draft.blockers.trim();
  const notes = draft.notes.trim();

  if (evidence) lines.push('', '— Evidence —', evidence);
  if (blockers) lines.push('', '— Blockers / exceptions —', blockers);
  if (notes) lines.push('', '— Notes —', notes);

  return lines.join('\n');
}

