// Kick-off call workflow: fields, completion checks, and role options.

export const KICKOFF_CLIENT_FIELDS =
  'id, name, lifecycle_status, primary_contact_name, phone, contact_role, states_licensed, nmls, brokerage_name, timezone, appointment_settings, daily_adspend, facebook_page_name, phone_notifications, phone_live_transfer, live_transfer_approved, ghl_location_id';

export const CONTACT_ROLE_OPTIONS = [
  'Loan Officer',
  'Branch Manager',
  'Broker Owner',
  'MLO',
  'Team Lead',
  'Other',
] as const;

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
};

export type KickoffOnboardingCall = {
  id: string;
  recording_url: string | null;
  called_at: string;
};

export function isKickoffLifecycle(status: string | null | undefined): boolean {
  return status === 'new_account' || status === 'onboarding';
}

/** True when kick-off post-call requirements are not yet satisfied. */
export function isKickoffIncomplete(
  client: { lifecycle_status?: string | null; ghl_location_id?: string | null },
  onboardingCall: { recording_url?: string | null } | null | undefined,
): boolean {
  if (!isKickoffLifecycle(client.lifecycle_status)) return false;
  return !client.ghl_location_id?.trim() || !onboardingCall?.recording_url?.trim();
}

export function kickoffDraftFromClient(c: KickoffClient, recordingUrl = ''): KickoffDraft {
  const phone = c.phone ?? '';
  return {
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
    advance_lifecycle: c.lifecycle_status === 'new_account',
  };
}

const PREFILL_TRACKED_KEYS: (keyof KickoffDraft)[] = [
  'phone', 'contact_role', 'states_licensed', 'nmls', 'brokerage_name', 'timezone',
  'appointment_settings', 'daily_adspend', 'facebook_page_name', 'phone_notifications',
  'phone_live_transfer', 'live_transfer_approved', 'ghl_location_id', 'recording_url',
];

export function kickoffFieldHadValue(draft: KickoffDraft, key: keyof KickoffDraft): boolean {
  const v = draft[key];
  if (Array.isArray(v)) return v.length > 0;
  if (key === 'live_transfer_approved') return v === 'yes' || v === 'no';
  if (key === 'advance_lifecycle') return false;
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

export type KickoffDraft = {
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
  advance_lifecycle: boolean;
};

export function kickoffDraftToBody(
  draft: KickoffDraft,
  canViewRevenue: boolean,
  saveMode: 'progress' | 'complete' = 'complete',
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    save_mode: saveMode,
    phone: draft.phone.trim() || null,
    contact_role: draft.contact_role.trim() || null,
    states_licensed: draft.states_licensed,
    nmls: draft.nmls.trim() || null,
    brokerage_name: draft.brokerage_name.trim() || null,
    timezone: draft.timezone.trim() || null,
    appointment_settings: draft.appointment_settings.trim() || null,
    facebook_page_name: draft.facebook_page_name.trim() || null,
    phone_notifications: draft.phone_notifications.trim() || null,
    phone_live_transfer: draft.phone_live_transfer.trim() || null,
    live_transfer_approved:
      draft.live_transfer_approved === 'yes'
        ? true
        : draft.live_transfer_approved === 'no'
          ? false
          : null,
    ghl_location_id: draft.ghl_location_id.trim() || null,
    recording_url: draft.recording_url.trim() || null,
    advance_lifecycle: draft.advance_lifecycle,
  };
  if (canViewRevenue) {
    body.daily_adspend = draft.daily_adspend.trim() || null;
  }
  return body;
}
