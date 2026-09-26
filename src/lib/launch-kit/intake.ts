/**
 * Launch Kit intake — draft shape, prefill from `clients` + last kit, validation, variant resolution.
 *
 * No `clients` columns are added for the kit. Kit-only fields live in
 * `client_form_submissions.responses` (form_type = 'launch_kit'); URLs that already have a
 * column are written back via `clientPatchFromDraft` (funnel + CRM only).
 */

import { normalizeReportingType } from '@/lib/reporting-types';
import { normalizeServiceProgram } from '@/lib/service-program';
import type { KitDialOwner, KitProduct, KitVariant } from './types';

export const TO_FILL = '[TO FILL]';

/** "What's live" properties, in PDF order. */
export const LAUNCH_KIT_PROPERTIES = [
  { key: 'funnel_url', label: 'Perspective funnel', kind: 'url', clientColumn: 'funnel_url', naAllowed: false },
  { key: 'crm_url', label: 'CRM', kind: 'url', clientColumn: 'ghl_subaccount_url', naAllowed: false },
  { key: 'calendar_url', label: 'Calendar', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'ads_url', label: 'Meta ads', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'skool_url', label: 'Skool / training', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'launch_kit_folder_url', label: 'Launch Kit folder', kind: 'url', clientColumn: null, naAllowed: true },
] as const;

export type LaunchKitPropertyKey = (typeof LAUNCH_KIT_PROPERTIES)[number]['key'];

/**
 * Client-facing review checklist. Prefills from `clients` but is kit-snapshot only —
 * never written back via `clientPatchFromDraft`.
 */
export const LAUNCH_KIT_REVIEW_FIELDS = [
  {
    key: 'website_url',
    label: 'Website',
    kind: 'url' as const,
    naAllowed: true,
    naLabel: 'Not part of this account',
    pdfLabel: 'Website',
  },
  {
    key: 'legal_notice_url',
    label: 'Legal notice',
    kind: 'url' as const,
    naAllowed: true,
    naLabel: 'Declined / not needed',
    pdfLabel: 'Legal notice (compliance approve)',
  },
  {
    key: 'phone_prospecting',
    label: 'Prospecting number',
    kind: 'text' as const,
    naAllowed: true,
    naLabel: 'Not part of this account',
    pdfLabel: 'Number we use to contact leads',
  },
  {
    key: 'phone_live_transfer',
    label: 'Live-transfer number',
    kind: 'text' as const,
    naAllowed: true,
    naLabel: 'Not part of this account',
    pdfLabel: 'Number we use for live transfers',
  },
  {
    key: 'virtual_card_url',
    label: 'Virtual business card',
    kind: 'url' as const,
    naAllowed: true,
    naLabel: 'Not part of this account',
    pdfLabel: 'Virtual business card',
  },
  {
    key: 'facebook_page',
    label: 'Facebook page',
    kind: 'text' as const,
    naAllowed: true,
    naLabel: 'Not part of this account',
    pdfLabel: 'Facebook page',
  },
] as const;

export type LaunchKitReviewKey = (typeof LAUNCH_KIT_REVIEW_FIELDS)[number]['key'];

export type LaunchKitNaKey = LaunchKitPropertyKey | LaunchKitReviewKey;

export type LaunchKitDraft = {
  product: KitProduct | '';
  dial_owner: KitDialOwner | '';
  contact_first_name: string;
  company_name: string;
  go_live_date: string;
  csm_name: string;
  slack_channel_name: string;
  market: string;
  who_works_leads: string;
  speed_standard: string;
  funnel_url: string;
  crm_url: string;
  calendar_url: string;
  ads_url: string;
  skool_url: string;
  launch_kit_folder_url: string;
  /** Kit-snapshot review fields (prefill from clients; never write back). */
  website_url: string;
  legal_notice_url: string;
  phone_prospecting: string;
  phone_live_transfer: string;
  virtual_card_url: string;
  facebook_page: string;
  /** On-file receipt (kit snapshot). */
  nmls: string;
  states_licensed: string;
  /** Property / review keys the CSM has explicitly marked as not part of this account. */
  property_na: Partial<Record<LaunchKitNaKey, boolean>>;
  notes: string;
};

export type LaunchKitClient = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  primary_contact_name: string | null;
  brokerage_name: string | null;
  legal_business_name: string | null;
  reporting_type: string | null;
  service_program: string | null;
  launch_date: string | null;
  slack_id: string | null;
  funnel_url: string | null;
  ghl_subaccount_url: string | null;
  drive_folder_url: string | null;
  states_licensed: string[] | null;
  ghl_location_id: string | null;
  website: string | null;
  nmls: string | null;
  phone_ghl: string | null;
  phone_live_transfer: string | null;
  virtual_business_card_url: string | null;
  facebook_page_name: string | null;
};

export const LAUNCH_KIT_CLIENT_FIELDS =
  'id, name, lifecycle_status, primary_contact_name, brokerage_name, legal_business_name, reporting_type, service_program, launch_date, slack_id, funnel_url, ghl_subaccount_url, drive_folder_url, states_licensed, ghl_location_id, website, nmls, phone_ghl, phone_live_transfer, virtual_business_card_url, facebook_page_name';

export function emptyLaunchKitDraft(): LaunchKitDraft {
  return {
    product: '',
    dial_owner: '',
    contact_first_name: '',
    company_name: '',
    go_live_date: '',
    csm_name: '',
    slack_channel_name: '',
    market: '',
    who_works_leads: '',
    speed_standard: '',
    funnel_url: '',
    crm_url: '',
    calendar_url: '',
    ads_url: '',
    skool_url: '',
    launch_kit_folder_url: '',
    website_url: '',
    legal_notice_url: '',
    phone_prospecting: '',
    phone_live_transfer: '',
    virtual_card_url: '',
    facebook_page: '',
    nmls: '',
    states_licensed: '',
    property_na: {},
    notes: '',
  };
}

/** Product from `reporting_type`. CALL_CENTER / unknown → '' so the CSM must choose. */
export function productFromReportingType(reportingType: unknown): KitProduct | '' {
  const raw = String(reportingType ?? '').trim();
  if (!raw) return '';
  const v = normalizeReportingType(raw);
  if (v === 'RM') return 'rm';
  if (v === 'DSCR') return 'dscr';
  return '';
}

/** Dial owner from `service_program`. core = Waiz dials/books; lead_gen = client dials. CALL_CENTER → waiz. */
export function dialOwnerFromClient(reportingType: unknown, serviceProgram: unknown): KitDialOwner | '' {
  if (normalizeReportingType(reportingType) === 'CALL_CENTER' && String(reportingType ?? '').trim()) {
    return 'waiz';
  }
  const program = normalizeServiceProgram(serviceProgram);
  if (program === 'core') return 'waiz';
  if (program === 'lead_gen') return 'client';
  return '';
}

export function resolveVariant(draft: Pick<LaunchKitDraft, 'product' | 'dial_owner'>): KitVariant | null {
  if (!draft.product || !draft.dial_owner) return null;
  return { product: draft.product, dialOwner: draft.dial_owner };
}

export function defaultWhoWorksLeads(variant: KitVariant | null, contactFirstName: string): string {
  if (!variant) return '';
  if (variant.dialOwner === 'waiz') {
    return variant.product === 'dscr' ? 'Laura (your AI assistant)' : 'The Waiz call center';
  }
  const name = contactFirstName.trim();
  return name ? `${name} and your team` : 'You and your team';
}

function firstName(full: string | null | undefined): string {
  const t = (full ?? '').trim();
  if (!t) return '';
  return t.split(/\s+/)[0] ?? '';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function statesLicensedLabel(states: string[] | null | undefined): string {
  return (states ?? []).map(s => String(s).trim()).filter(Boolean).join(', ');
}

/** Prefill: last kit submission wins for kit-only fields; `clients` columns win for URLs they own. */
export function draftFromClient(
  client: LaunchKitClient,
  lastResponses?: Record<string, unknown> | null,
): LaunchKitDraft {
  const last = lastResponses ? draftFromResponses(lastResponses) : null;
  const base = last ?? emptyLaunchKitDraft();

  const product = productFromReportingType(client.reporting_type) || base.product;
  const dialOwner = dialOwnerFromClient(client.reporting_type, client.service_program) || base.dial_owner;
  const contact = base.contact_first_name || firstName(client.primary_contact_name);
  const variant = resolveVariant({ product, dial_owner: dialOwner });
  const clientStates = statesLicensedLabel(client.states_licensed);

  return {
    ...base,
    product,
    dial_owner: dialOwner,
    contact_first_name: contact,
    company_name:
      base.company_name || client.brokerage_name?.trim() || client.legal_business_name?.trim() || client.name,
    go_live_date: client.launch_date ?? base.go_live_date,
    market: base.market || clientStates,
    who_works_leads: base.who_works_leads || defaultWhoWorksLeads(variant, contact),
    funnel_url: client.funnel_url?.trim() || base.funnel_url,
    crm_url: client.ghl_subaccount_url?.trim() || base.crm_url,
    launch_kit_folder_url: base.launch_kit_folder_url || client.drive_folder_url?.trim() || '',
    // Review + receipt: last kit wins when present; otherwise prefill from client (never write back).
    website_url: base.website_url || client.website?.trim() || '',
    legal_notice_url: base.legal_notice_url,
    phone_prospecting: base.phone_prospecting || client.phone_ghl?.trim() || '',
    phone_live_transfer: base.phone_live_transfer || client.phone_live_transfer?.trim() || '',
    virtual_card_url: base.virtual_card_url || client.virtual_business_card_url?.trim() || '',
    facebook_page: base.facebook_page || client.facebook_page_name?.trim() || '',
    nmls: base.nmls || client.nmls?.trim() || '',
    states_licensed: base.states_licensed || clientStates,
  };
}

export function draftFromResponses(responses: Record<string, unknown>): LaunchKitDraft {
  const d = emptyLaunchKitDraft();
  const product = str(responses.product);
  const dialOwner = str(responses.dial_owner);
  d.product = product === 'rm' || product === 'dscr' ? product : '';
  d.dial_owner = dialOwner === 'waiz' || dialOwner === 'client' ? dialOwner : '';
  d.contact_first_name = str(responses.contact_first_name);
  d.company_name = str(responses.company_name);
  d.go_live_date = str(responses.go_live_date);
  d.csm_name = str(responses.csm_name);
  d.slack_channel_name = str(responses.slack_channel_name);
  d.market = str(responses.market);
  d.who_works_leads = str(responses.who_works_leads);
  d.speed_standard = str(responses.speed_standard);
  d.notes = str(responses.notes);
  d.nmls = str(responses.nmls);
  d.states_licensed = str(responses.states_licensed);
  for (const p of LAUNCH_KIT_PROPERTIES) d[p.key] = str(responses[p.key]);
  for (const p of LAUNCH_KIT_REVIEW_FIELDS) d[p.key] = str(responses[p.key]);
  const na = responses.property_na;
  if (na && typeof na === 'object') {
    for (const p of LAUNCH_KIT_PROPERTIES) {
      if ((na as Record<string, unknown>)[p.key] === true) d.property_na[p.key] = true;
    }
    for (const p of LAUNCH_KIT_REVIEW_FIELDS) {
      if ((na as Record<string, unknown>)[p.key] === true) d.property_na[p.key] = true;
    }
  }
  return d;
}

export function draftToResponses(draft: LaunchKitDraft): Record<string, unknown> {
  const naKeys = [
    ...LAUNCH_KIT_PROPERTIES.filter(p => draft.property_na[p.key]).map(p => p.key),
    ...LAUNCH_KIT_REVIEW_FIELDS.filter(p => draft.property_na[p.key]).map(p => p.key),
  ];
  const out: Record<string, unknown> = {
    product: draft.product || null,
    dial_owner: draft.dial_owner || null,
    contact_first_name: draft.contact_first_name.trim(),
    company_name: draft.company_name.trim(),
    go_live_date: draft.go_live_date.trim(),
    csm_name: draft.csm_name.trim(),
    slack_channel_name: draft.slack_channel_name.trim(),
    market: draft.market.trim(),
    who_works_leads: draft.who_works_leads.trim(),
    speed_standard: draft.speed_standard.trim(),
    notes: draft.notes.trim(),
    nmls: draft.nmls.trim(),
    states_licensed: draft.states_licensed.trim(),
    property_na: Object.fromEntries(naKeys.map(k => [k, true])),
  };
  for (const p of LAUNCH_KIT_PROPERTIES) out[p.key] = draft[p.key].trim();
  for (const p of LAUNCH_KIT_REVIEW_FIELDS) out[p.key] = draft[p.key].trim();
  return out;
}

export function parseLaunchKitDraft(body: unknown): LaunchKitDraft {
  if (!body || typeof body !== 'object') return emptyLaunchKitDraft();
  return draftFromResponses(body as Record<string, unknown>);
}

export function isValidHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isPropertyNa(draft: LaunchKitDraft, key: LaunchKitNaKey): boolean {
  return draft.property_na[key] === true;
}

/** Every rule the SOP enforces before a kit may ship. Empty array = OK to generate. */
export function validateForGenerate(draft: LaunchKitDraft): string[] {
  const errors: string[] = [];
  if (!draft.product) errors.push('Choose the product (Reverse mortgage or DSCR).');
  if (!draft.dial_owner) errors.push('Choose who works the leads (Waiz or the client).');
  if (!draft.contact_first_name.trim()) errors.push('Contact first name is required.');
  if (!draft.company_name.trim()) errors.push('Company / DBA is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.go_live_date.trim())) errors.push('Go-live date is required (YYYY-MM-DD).');
  if (!draft.csm_name.trim()) errors.push('CSM name is required.');
  if (!draft.who_works_leads.trim()) errors.push('Who works new leads is required.');

  for (const p of LAUNCH_KIT_PROPERTIES) {
    const value = draft[p.key].trim();
    const na = isPropertyNa(draft, p.key);
    if (na) {
      if (!p.naAllowed) errors.push(`${p.label} cannot be marked N/A.`);
      continue;
    }
    if (!value) {
      errors.push(`${p.label} URL is missing. Fill it or mark N/A — never ship a guessed link.`);
      continue;
    }
    if (value.includes(TO_FILL)) {
      errors.push(`${p.label} still contains ${TO_FILL}.`);
      continue;
    }
    if (!isValidHttpUrl(value)) errors.push(`${p.label} must be a full http(s) URL.`);
  }

  for (const p of LAUNCH_KIT_REVIEW_FIELDS) {
    const value = draft[p.key].trim();
    const na = isPropertyNa(draft, p.key);
    if (na) continue;
    if (!value) {
      errors.push(
        p.kind === 'url'
          ? `${p.label} is missing. Fill it or mark N/A — never ship a guessed link.`
          : `${p.label} is missing. Fill it or mark N/A.`,
      );
      continue;
    }
    if (value.includes(TO_FILL)) {
      errors.push(`${p.label} still contains ${TO_FILL}.`);
      continue;
    }
    if (p.kind === 'url' && !isValidHttpUrl(value)) {
      errors.push(`${p.label} must be a full http(s) URL.`);
    }
  }

  const textFields: Array<[keyof LaunchKitDraft, string]> = [
    ['contact_first_name', 'Contact first name'],
    ['company_name', 'Company / DBA'],
    ['csm_name', 'CSM'],
    ['market', 'Market'],
    ['who_works_leads', 'Who works leads'],
    ['speed_standard', 'Speed standard'],
    ['slack_channel_name', 'Slack channel'],
    ['nmls', 'NMLS'],
    ['states_licensed', 'States licensed'],
  ];
  for (const [key, label] of textFields) {
    const v = draft[key];
    if (typeof v === 'string' && v.includes(TO_FILL)) errors.push(`${label} still contains ${TO_FILL}.`);
  }

  if (!draft.nmls.trim()) errors.push('NMLS is required for the on-file receipt.');
  if (!draft.states_licensed.trim()) errors.push('States licensed is required for the on-file receipt.');

  return errors;
}

/** URL write-backs to `clients` for columns the kit intake owns a copy of. Funnel + CRM only. */
export function clientPatchFromDraft(
  draft: LaunchKitDraft,
  client: Pick<LaunchKitClient, 'funnel_url' | 'ghl_subaccount_url'>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  const funnel = draft.funnel_url.trim();
  if (funnel && !isPropertyNa(draft, 'funnel_url') && funnel !== (client.funnel_url ?? '').trim()) {
    patch.funnel_url = funnel;
  }
  const crm = draft.crm_url.trim();
  if (crm && !isPropertyNa(draft, 'crm_url') && crm !== (client.ghl_subaccount_url ?? '').trim()) {
    patch.ghl_subaccount_url = crm;
  }
  return patch;
}

export function launchKitSlug(companyName: string, fallback: string): string {
  const base = (companyName.trim() || fallback).toLowerCase();
  const slug = base
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'client';
}

export function launchKitStoragePath(clientId: string, slug: string, version: number): string {
  return `${clientId}/${slug}-launch-kit-v${version}.pdf`;
}

/** Statuses in which the kit action is offered. Regeneration after go-live is allowed. */
export function isLaunchKitLifecycle(status: string | null | undefined): boolean {
  return status === 'new_account' || status === 'onboarding' || status === 'active';
}
