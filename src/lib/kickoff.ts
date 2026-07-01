// Kick-off call workflow: fields, completion checks, and role options.

import {
  isKickoffIdentityFieldComplete,
  KICKOFF_IDENTITY_FIELD_KEYS,
  type KickoffIdentityFieldKey,
} from '@/lib/client-identity';
import { clientNeedsGhlMapping } from '@/lib/client-ghl-mapping';

export { isKickoffIdentityFieldComplete, KICKOFF_IDENTITY_FIELD_KEYS, type KickoffIdentityFieldKey };
import {
  getOnboardingFormProfile,
  type OnboardingFormProfile,
} from '@/lib/onboarding-form-profile';
import { normalizeReportingType, type ReportingType } from '@/lib/reporting-types';
import {
  normalizeServiceProgram,
  serviceProgramApplies,
  type ServiceProgram,
} from '@/lib/service-program';

export const KICKOFF_CLIENT_FIELDS =
  'id, name, lifecycle_status, primary_contact_name, phone, contact_role, states_licensed, nmls, brokerage_name, timezone, appointment_settings, daily_adspend, facebook_page_name, phone_notifications, phone_live_transfer, live_transfer_approved, ghl_location_id, reporting_type, service_program, offer';

export const CONTACT_ROLE_OPTIONS = [
  'Loan Officer',
  'Branch Manager',
  'Broker Owner',
  'MLO',
  'Team Lead',
  'Other',
] as const;

export type KickoffFieldKey =
  | 'phone'
  | 'contact_role'
  | 'states_licensed'
  | 'nmls'
  | 'brokerage_name'
  | 'timezone'
  | 'appointment_settings'
  | 'daily_adspend'
  | 'facebook_page_name'
  | 'phone_notifications'
  | 'phone_live_transfer'
  | 'live_transfer_approved'
  | 'pm_landing_copy'
  | 'pm_brand_assets'
  | 'pm_compliance_notes'
  | 'pm_competitor_refs'
  | 'pm_funnel_requirements'
  | 'cc_lead_source'
  | 'cc_qualification_criteria'
  | 'cc_hp_tag_user'
  | 'cc_setter_notes'
  | 'sub_account_name'
  | 'ghl_location_id'
  | 'recording_url';

export type KickoffSectionId =
  | 'confirm'
  | 'get_info'
  | 'pm'
  | 'call_center'
  | 'post_call';

export type KickoffFieldDef = {
  key: KickoffFieldKey;
  section: KickoffSectionId;
  profiles: OnboardingFormProfile[];
  requiresRevenue?: boolean;
};

export const KICKOFF_FIELD_REGISTRY: KickoffFieldDef[] = [
  { key: 'phone', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'contact_role', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'states_licensed', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'nmls', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'brokerage_name', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'timezone', section: 'confirm', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'appointment_settings', section: 'get_info', profiles: ['marketing_core', 'call_center'] },
  { key: 'daily_adspend', section: 'get_info', profiles: ['marketing_core', 'marketing_lead_gen'], requiresRevenue: true },
  { key: 'facebook_page_name', section: 'get_info', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'phone_notifications', section: 'get_info', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'phone_live_transfer', section: 'get_info', profiles: ['marketing_core', 'call_center'] },
  { key: 'live_transfer_approved', section: 'get_info', profiles: ['marketing_core', 'call_center'] },
  { key: 'pm_landing_copy', section: 'pm', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'pm_brand_assets', section: 'pm', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'pm_compliance_notes', section: 'pm', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'pm_competitor_refs', section: 'pm', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'pm_funnel_requirements', section: 'pm', profiles: ['marketing_core', 'marketing_lead_gen'] },
  { key: 'cc_lead_source', section: 'call_center', profiles: ['call_center'] },
  { key: 'cc_qualification_criteria', section: 'call_center', profiles: ['call_center'] },
  { key: 'cc_hp_tag_user', section: 'call_center', profiles: ['call_center'] },
  { key: 'cc_setter_notes', section: 'call_center', profiles: ['call_center'] },
  { key: 'sub_account_name', section: 'post_call', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'ghl_location_id', section: 'post_call', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
  { key: 'recording_url', section: 'post_call', profiles: ['marketing_core', 'marketing_lead_gen', 'call_center'] },
];

export const CC_KICKOFF_FIELD_LABELS: Record<string, string> = {
  cc_lead_source: 'Lead source / how leads arrive',
  cc_qualification_criteria: 'Setter qualification criteria',
  cc_hp_tag_user: 'GHL assigned user / HP tag contact',
  cc_setter_notes: 'Setter script / dial notes',
};

export type KickoffClient = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  primary_contact_name: string | null;
  phone: string | null;
  contact_role: string | null;
  states_licensed: string[] | null;
  nmls: string | null;
  brokerage_name: string | null;
  timezone: string | null;
  appointment_settings: string | null;
  daily_adspend: number | null;
  facebook_page_name: string | null;
  phone_notifications: string | null;
  phone_live_transfer: string | null;
  live_transfer_approved: boolean | null;
  ghl_location_id: string | null;
  reporting_type: string | null;
  service_program: string | null;
  offer: string | null;
};

export type KickoffOnboardingCall = {
  id: string;
  recording_url: string | null;
  transcript: string | null;
  called_at: string;
};

export type KickoffConfig = {
  profile: OnboardingFormProfile;
  visibleFields: KickoffFieldKey[];
  visibleSections: KickoffSectionId[];
  showPmSection: boolean;
  showCallCenterSection: boolean;
};

export function getKickoffConfig(
  profile: OnboardingFormProfile,
  canViewRevenue = true,
): KickoffConfig {
  const visibleFields = KICKOFF_FIELD_REGISTRY.filter(
    f => f.profiles.includes(profile) && (!f.requiresRevenue || canViewRevenue),
  ).map(f => f.key);
  const visibleSections = [...new Set(
    KICKOFF_FIELD_REGISTRY.filter(f => f.profiles.includes(profile)).map(f => f.section),
  )];
  return {
    profile,
    visibleFields,
    visibleSections,
    showPmSection: profile === 'marketing_core' || profile === 'marketing_lead_gen',
    showCallCenterSection: profile === 'call_center',
  };
}

export function isKickoffFieldVisible(
  key: KickoffFieldKey,
  profile: OnboardingFormProfile,
  canViewRevenue = true,
): boolean {
  const def = KICKOFF_FIELD_REGISTRY.find(f => f.key === key);
  if (!def) return false;
  if (def.requiresRevenue && !canViewRevenue) return false;
  return def.profiles.includes(profile);
}

export function isKickoffLifecycle(status: string | null | undefined): boolean {
  return status === 'new_account' || status === 'onboarding';
}

export function isKickoffIncomplete(
  client: {
    lifecycle_status?: string | null;
    ghl_location_id?: string | null;
    name?: string | null;
    primary_contact_name?: string | null;
  },
  onboardingCall: { recording_url?: string | null } | null | undefined,
): boolean {
  if (!isKickoffLifecycle(client.lifecycle_status)) return false;
  if (clientNeedsGhlMapping(client)) return true;
  return !client.ghl_location_id?.trim() || !onboardingCall?.recording_url?.trim();
}

export type KickoffDraft = {
  reporting_type: ReportingType;
  service_program: ServiceProgram | '';
  vertical_confirmed: boolean;
  sub_account_name: string;
  phone: string;
  contact_role: string;
  states_licensed: string[];
  nmls: string;
  brokerage_name: string;
  timezone: string;
  appointment_settings: string;
  daily_adspend: string;
  facebook_page_name: string;
  phone_notifications: string;
  phone_live_transfer: string;
  live_transfer_approved: '' | 'yes' | 'no';
  ghl_location_id: string;
  recording_url: string;
  transcript: string;
  advance_lifecycle: boolean;
  pm_landing_copy: string;
  pm_brand_assets: string;
  pm_compliance_notes: string;
  pm_competitor_refs: string;
  pm_funnel_requirements: string;
  cc_lead_source: string;
  cc_qualification_criteria: string;
  cc_hp_tag_user: string;
  cc_setter_notes: string;
};

export function kickoffDraftFromClient(
  c: KickoffClient,
  recordingUrl = '',
  verticalConfirmed = false,
  transcript = '',
): KickoffDraft {
  const phone = c.phone ?? '';
  return {
    reporting_type: normalizeReportingType(c.reporting_type),
    service_program: normalizeServiceProgram(c.service_program) ?? '',
    vertical_confirmed: verticalConfirmed,
    sub_account_name: c.name ?? '',
    phone,
    contact_role: c.contact_role ?? '',
    states_licensed: c.states_licensed ?? [],
    nmls: c.nmls ?? '',
    brokerage_name: c.brokerage_name ?? '',
    timezone: c.timezone ?? '',
    appointment_settings: c.appointment_settings ?? '',
    daily_adspend: c.daily_adspend != null ? String(c.daily_adspend) : '',
    facebook_page_name: c.facebook_page_name ?? '',
    phone_notifications: c.phone_notifications ?? phone,
    phone_live_transfer: c.phone_live_transfer ?? '',
    live_transfer_approved: c.live_transfer_approved === true ? 'yes' : c.live_transfer_approved === false ? 'no' : '',
    ghl_location_id: c.ghl_location_id ?? '',
    recording_url: recordingUrl,
    transcript,
    advance_lifecycle: c.lifecycle_status === 'new_account',
    pm_landing_copy: '',
    pm_brand_assets: '',
    pm_compliance_notes: '',
    pm_competitor_refs: '',
    pm_funnel_requirements: '',
    cc_lead_source: '',
    cc_qualification_criteria: '',
    cc_hp_tag_user: '',
    cc_setter_notes: '',
  };
}

const PREFILL_TRACKED_KEYS: (keyof KickoffDraft)[] = [
  'sub_account_name', 'phone', 'contact_role', 'states_licensed', 'nmls', 'brokerage_name', 'timezone',
  'appointment_settings', 'daily_adspend', 'facebook_page_name', 'phone_notifications',
  'phone_live_transfer', 'live_transfer_approved', 'ghl_location_id', 'recording_url',
  'cc_lead_source', 'cc_qualification_criteria', 'cc_hp_tag_user', 'cc_setter_notes',
];

export function kickoffFieldHadValue(draft: KickoffDraft, key: keyof KickoffDraft): boolean {
  const v = draft[key];
  if (Array.isArray(v)) return v.length > 0;
  if (key === 'live_transfer_approved') return v === 'yes' || v === 'no';
  if (key === 'advance_lifecycle' || key === 'vertical_confirmed') return false;
  return typeof v === 'string' && v.trim().length > 0;
}

export function countKickoffFieldsOnFile(draft: KickoffDraft): number {
  return PREFILL_TRACKED_KEYS.filter(k => kickoffFieldHadValue(draft, k)).length;
}

export function kickoffFieldsMatch(a: KickoffDraft, b: KickoffDraft, key: keyof KickoffDraft): boolean {
  const left = a[key];
  const right = b[key];
  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

export function kickoffPmFieldsFromDraft(draft: KickoffDraft): Record<string, unknown> {
  return {
    pm_landing_copy: draft.pm_landing_copy.trim() || null,
    pm_brand_assets: draft.pm_brand_assets.trim() || null,
    pm_compliance_notes: draft.pm_compliance_notes.trim() || null,
    pm_competitor_refs: draft.pm_competitor_refs.trim() || null,
    pm_funnel_requirements: draft.pm_funnel_requirements.trim() || null,
  };
}

export function kickoffCcFieldsFromDraft(draft: KickoffDraft): Record<string, unknown> {
  return {
    cc_lead_source: draft.cc_lead_source.trim() || null,
    cc_qualification_criteria: draft.cc_qualification_criteria.trim() || null,
    cc_hp_tag_user: draft.cc_hp_tag_user.trim() || null,
    cc_setter_notes: draft.cc_setter_notes.trim() || null,
  };
}

export function kickoffExtraFieldsFromDraft(
  profile: OnboardingFormProfile,
  draft: KickoffDraft,
): Record<string, unknown> {
  if (profile === 'call_center') return kickoffCcFieldsFromDraft(draft);
  if (profile === 'marketing_core' || profile === 'marketing_lead_gen') return kickoffPmFieldsFromDraft(draft);
  return {};
}

export function kickoffDraftToBody(
  draft: KickoffDraft,
  canViewRevenue: boolean,
  saveMode: 'progress' | 'complete' = 'complete',
): Record<string, unknown> {
  const profile = getOnboardingFormProfile(draft.reporting_type, draft.service_program);
  const body: Record<string, unknown> = {
    save_mode: saveMode,
    reporting_type: draft.reporting_type,
    service_program: serviceProgramApplies(draft.reporting_type)
      ? (draft.service_program || null)
      : null,
    vertical_confirmed: draft.vertical_confirmed,
    sub_account_name: draft.sub_account_name.trim() || null,
    phone: draft.phone.trim() || null,
    contact_role: draft.contact_role.trim() || null,
    states_licensed: draft.states_licensed,
    nmls: draft.nmls.trim() || null,
    brokerage_name: draft.brokerage_name.trim() || null,
    timezone: draft.timezone.trim() || null,
    ghl_location_id: draft.ghl_location_id.trim() || null,
    recording_url: draft.recording_url.trim() || null,
    transcript: draft.transcript.trim() || null,
    advance_lifecycle: draft.advance_lifecycle,
  };

  if (isKickoffFieldVisible('appointment_settings', profile, canViewRevenue)) {
    body.appointment_settings = draft.appointment_settings.trim() || null;
  }
  if (isKickoffFieldVisible('facebook_page_name', profile, canViewRevenue)) {
    body.facebook_page_name = draft.facebook_page_name.trim() || null;
  }
  if (isKickoffFieldVisible('phone_notifications', profile, canViewRevenue)) {
    body.phone_notifications = draft.phone_notifications.trim() || null;
  }
  if (isKickoffFieldVisible('phone_live_transfer', profile, canViewRevenue)) {
    body.phone_live_transfer = draft.phone_live_transfer.trim() || null;
    body.live_transfer_approved =
      draft.live_transfer_approved === 'yes'
        ? true
        : draft.live_transfer_approved === 'no'
          ? false
          : null;
  }
  if (canViewRevenue && isKickoffFieldVisible('daily_adspend', profile, canViewRevenue)) {
    body.daily_adspend = draft.daily_adspend.trim() || null;
  }

  Object.assign(body, kickoffExtraFieldsFromDraft(profile, draft));

  return body;
}

export function kickoffIdentitySlice(draft: KickoffDraft): Record<KickoffIdentityFieldKey, unknown> {
  return {
    phone: draft.phone,
    contact_role: draft.contact_role,
    states_licensed: draft.states_licensed,
    nmls: draft.nmls,
    brokerage_name: draft.brokerage_name,
    timezone: draft.timezone,
  };
}

export function isKickoffSetupResolved(draft: KickoffDraft): boolean {
  if (!draft.vertical_confirmed) return false;
  if (serviceProgramApplies(draft.reporting_type) && !draft.service_program) return false;
  return true;
}
