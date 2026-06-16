// Launch checklist — stored in client_form_submissions.responses, not clients columns.

export const LAUNCH_SECTIONS = [
  { id: 'media_buying', label: 'Media Buying' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'ghl_subaccount', label: 'GHL Subaccount' },
  { id: 'admin', label: 'Admin' },
] as const;

export type LaunchSectionId = (typeof LAUNCH_SECTIONS)[number]['id'];

export type LaunchChecklistItemDef = {
  key: string;
  label: string;
  section: LaunchSectionId;
  confirmType: 'checkbox' | 'type_yes';
  helpText?: string;
};

export const LAUNCH_CHECKLIST_ITEMS: LaunchChecklistItemDef[] = [
  // Media Buying
  {
    key: 'mb_creative_message_aligned',
    label: 'Headline / primary text aligned with creative message',
    section: 'media_buying',
    confirmType: 'checkbox',
  },
  {
    key: 'mb_states_targeted',
    label: 'Correct states are being targeted',
    section: 'media_buying',
    confirmType: 'checkbox',
  },
  {
    key: 'mb_budget_set',
    label: 'Correct budget is set',
    section: 'media_buying',
    confirmType: 'checkbox',
  },
  {
    key: 'mb_midnight_schedule',
    label: 'Campaign scheduled for launch at midnight',
    section: 'media_buying',
    confirmType: 'type_yes',
  },
  {
    key: 'mb_funnel_in_ad_live',
    label: 'Correct funnel is in the ad and tested funnel is live correctly',
    section: 'media_buying',
    confirmType: 'checkbox',
  },
  // Funnel
  {
    key: 'fn_headline_congruent',
    label: 'Funnel headline congruent to ad message / angle',
    section: 'funnel',
    confirmType: 'checkbox',
  },
  {
    key: 'fn_split_test_headlines',
    label: 'Split test between two headlines is on',
    section: 'funnel',
    confirmType: 'checkbox',
  },
  {
    key: 'fn_pixel_conversion_event',
    label: 'Pixel data working with correct conversion event',
    section: 'funnel',
    confirmType: 'type_yes',
  },
  {
    key: 'fn_ghl_integrated',
    label: 'GHL subaccount correctly integrated',
    section: 'funnel',
    confirmType: 'checkbox',
  },
  {
    key: 'fn_privacy_compliant_footer',
    label: 'Privacy policy and compliant footer added',
    section: 'funnel',
    confirmType: 'checkbox',
  },
  {
    key: 'fn_sms_compliant_checkbox',
    label: "Compliant checkbox for sending SMS with client's name",
    section: 'funnel',
    confirmType: 'checkbox',
  },
  // GHL Subaccount
  {
    key: 'ghl_client_info_not_updated',
    label: 'Client info NOT updated — client assigned user with HP tag (call center model)',
    section: 'ghl_subaccount',
    confirmType: 'type_yes',
    helpText: 'Verify you did not change client info; confirm assigned user has HP tag if on call center model.',
  },
  {
    key: 'ghl_custom_values_filled',
    label: 'Custom values all filled out',
    section: 'ghl_subaccount',
    confirmType: 'checkbox',
  },
  {
    key: 'ghl_calendar_assigned',
    label: 'Calendar assigned to correct user',
    section: 'ghl_subaccount',
    confirmType: 'checkbox',
  },
  {
    key: 'ghl_a2p_approved',
    label: 'A2P approved',
    section: 'ghl_subaccount',
    confirmType: 'type_yes',
  },
  // Admin
  {
    key: 'adm_mrw_clickup_complete',
    label: 'Mr. Waiz and ClickUp fields fully filled out',
    section: 'admin',
    confirmType: 'checkbox',
  },
  {
    key: 'adm_make_facebook_active',
    label: 'Make scenario for Facebook is active',
    section: 'admin',
    confirmType: 'checkbox',
  },
  {
    key: 'adm_full_test_lead_flow',
    label: 'Full test lead executed: perspective → SMS → AI booking → appointment booked',
    section: 'admin',
    confirmType: 'type_yes',
  },
];

export type LaunchChecklistKey = (typeof LAUNCH_CHECKLIST_ITEMS)[number]['key'];

export const LAUNCH_FINAL_CONFIRMATION = 'LAUNCH';

export type LaunchFormDraft = {
  launch_date: string;
  completed_by_user_id: string;
  completed_by_label: string;
  notes: string;
  checklist: Record<string, boolean>;
  confirmations: Record<string, string>;
  final_confirmation: string;
};

export function emptyLaunchDraft(launchDate = '', completedByUserId = '', completedByLabel = ''): LaunchFormDraft {
  const checklist: Record<string, boolean> = {};
  const confirmations: Record<string, string> = {};
  for (const item of LAUNCH_CHECKLIST_ITEMS) {
    checklist[item.key] = false;
    if (item.confirmType === 'type_yes') confirmations[item.key] = '';
  }
  return {
    launch_date: launchDate || new Date().toISOString().slice(0, 10),
    completed_by_user_id: completedByUserId,
    completed_by_label: completedByLabel,
    notes: '',
    checklist,
    confirmations,
    final_confirmation: '',
  };
}

export function isTypedYes(value: string): boolean {
  return value.trim().toLowerCase() === 'yes';
}

export function isLaunchItemSatisfied(item: LaunchChecklistItemDef, draft: LaunchFormDraft): boolean {
  if (!draft.checklist[item.key]) return false;
  if (item.confirmType === 'type_yes') {
    return isTypedYes(draft.confirmations[item.key] ?? '');
  }
  return true;
}

export function countSatisfiedItems(draft: LaunchFormDraft): number {
  return LAUNCH_CHECKLIST_ITEMS.filter(item => isLaunchItemSatisfied(item, draft)).length;
}

export function countSatisfiedInSection(sectionId: LaunchSectionId, draft: LaunchFormDraft): {
  satisfied: number;
  total: number;
} {
  const items = LAUNCH_CHECKLIST_ITEMS.filter(item => item.section === sectionId);
  return {
    satisfied: items.filter(item => isLaunchItemSatisfied(item, draft)).length,
    total: items.length,
  };
}

export function isLaunchChecklistComplete(draft: LaunchFormDraft): boolean {
  if (!draft.launch_date.trim()) return false;
  if (!draft.completed_by_user_id.trim()) return false;
  if (draft.final_confirmation.trim().toUpperCase() !== LAUNCH_FINAL_CONFIRMATION) return false;
  return LAUNCH_CHECKLIST_ITEMS.every(item => isLaunchItemSatisfied(item, draft));
}

export function getFirstIncompleteItemKey(draft: LaunchFormDraft): string | null {
  for (const item of LAUNCH_CHECKLIST_ITEMS) {
    if (!isLaunchItemSatisfied(item, draft)) return item.key;
  }
  return null;
}

export function launchDraftToResponses(draft: LaunchFormDraft): Record<string, unknown> {
  return {
    launch_date: draft.launch_date,
    completed_by_user_id: draft.completed_by_user_id,
    completed_by_label: draft.completed_by_label.trim() || null,
    notes: draft.notes.trim() || null,
    checklist: draft.checklist,
    confirmations: draft.confirmations,
    final_confirmation: draft.final_confirmation.trim().toUpperCase(),
  };
}

export function launchResponsesToDraft(responses: Record<string, unknown>): LaunchFormDraft {
  const draft = emptyLaunchDraft(
    typeof responses.launch_date === 'string' ? responses.launch_date : undefined,
    typeof responses.completed_by_user_id === 'string' ? responses.completed_by_user_id : '',
    typeof responses.completed_by_label === 'string' ? responses.completed_by_label : '',
  );
  draft.notes = typeof responses.notes === 'string' ? responses.notes : '';
  draft.final_confirmation =
    typeof responses.final_confirmation === 'string' ? responses.final_confirmation : '';

  const rawChecklist = responses.checklist;
  if (rawChecklist && typeof rawChecklist === 'object') {
    for (const item of LAUNCH_CHECKLIST_ITEMS) {
      draft.checklist[item.key] = !!(rawChecklist as Record<string, boolean>)[item.key];
    }
  }

  const rawConfirmations = responses.confirmations;
  if (rawConfirmations && typeof rawConfirmations === 'object') {
    for (const item of LAUNCH_CHECKLIST_ITEMS) {
      if (item.confirmType === 'type_yes') {
        const val = (rawConfirmations as Record<string, string>)[item.key];
        draft.confirmations[item.key] = typeof val === 'string' ? val : '';
      }
    }
  }

  return draft;
}

export function launchChecklistSummary(responses: Record<string, unknown>): string[] {
  const draft = launchResponsesToDraft(responses);
  return LAUNCH_CHECKLIST_ITEMS.filter(item => isLaunchItemSatisfied(item, draft)).map(item => item.label);
}

export function formatLaunchItemStatus(
  item: LaunchChecklistItemDef,
  draft: LaunchFormDraft,
): 'confirmed' | 'confirmed_typed_yes' | 'missing' {
  if (!isLaunchItemSatisfied(item, draft)) return 'missing';
  if (item.confirmType === 'type_yes') return 'confirmed_typed_yes';
  return 'confirmed';
}

export function formatLaunchSlackChecklist(responses: Record<string, unknown>): string {
  const draft = launchResponsesToDraft(responses);
  const lines: string[] = [];

  for (const section of LAUNCH_SECTIONS) {
    lines.push(section.label);
    const items = LAUNCH_CHECKLIST_ITEMS.filter(item => item.section === section.id);
    for (const item of items) {
      const status = formatLaunchItemStatus(item, draft);
      if (status === 'missing') {
        lines.push(`  — ${item.label}`);
      } else if (status === 'confirmed_typed_yes') {
        lines.push(`  ✓ ${item.label} (typed yes)`);
      } else {
        lines.push(`  ✓ ${item.label}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function getLaunchChecklistConfig() {
  return {
    sections: LAUNCH_SECTIONS,
    items: LAUNCH_CHECKLIST_ITEMS,
  };
}
