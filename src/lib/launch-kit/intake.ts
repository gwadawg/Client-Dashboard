/**
 * Launch Kit intake — draft shape, prefill from `clients` + last kit, validation, variant resolution.
 *
 * No `clients` columns are added for the kit. Kit-only fields live in
 * `client_form_submissions.responses` (form_type = 'launch_kit'); URLs that already have a
 * column are written back via `clientPatchFromDraft`.
 */

import { normalizeReportingType } from '@/lib/reporting-types';
import { normalizeServiceProgram } from '@/lib/service-program';
import type { KitDialOwner, KitProduct, KitVariant } from './types';

export const TO_FILL = '[TO FILL]';

/** "What's live" properties, in PDF order. */
export const LAUNCH_KIT_PROPERTIES = [
  { key: 'funnel_url', label: 'Funnel / lander', kind: 'url', clientColumn: 'funnel_url', naAllowed: false },
  { key: 'crm_url', label: 'CRM', kind: 'url', clientColumn: 'ghl_subaccount_url', naAllowed: false },
  { key: 'calendar_url', label: 'Calendar', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'ads_url', label: 'Meta ads', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'skool_url', label: 'Skool / training', kind: 'url', clientColumn: null, naAllowed: true },
  { key: 'launch_kit_folder_url', label: 'Launch Kit folder', kind: 'url', clientColumn: null, naAllowed: true },
] as const;

export type LaunchKitPropertyKey = (typeof LAUNCH_KIT_PROPERTIES)[number]['key'];

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
  /** Property keys the CSM has explicitly marked as not part of this account. */
  property_na: Partial<Record<LaunchKitPropertyKey, boolean>>;
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
};

export const LAUNCH_KIT_CLIENT_FIELDS =
  'id, name, lifecycle_status, primary_contact_name, brokerage_name, legal_business_name, reporting_type, service_program, launch_date, slack_id, funnel_url, ghl_subaccount_url, drive_folder_url, states_licensed, ghl_location_id';

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

  return {
    ...base,
    product,
    dial_owner: dialOwner,
    contact_first_name: contact,
    company_name:
      base.company_name || client.brokerage_name?.trim() || client.legal_business_name?.trim() || client.name,
    go_live_date: client.launch_date ?? base.go_live_date,
    market: base.market || (client.states_licensed ?? []).join(', '),
    who_works_leads: base.who_works_leads || defaultWhoWorksLeads(variant, contact),
    funnel_url: client.funnel_url?.trim() || base.funnel_url,
    crm_url: client.ghl_subaccount_url?.trim() || base.crm_url,
    launch_kit_folder_url: base.launch_kit_folder_url || client.drive_folder_url?.trim() || '',
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
  for (const p of LAUNCH_KIT_PROPERTIES) d[p.key] = str(responses[p.key]);
  const na = responses.property_na;
  if (na && typeof na === 'object') {
    for (const p of LAUNCH_KIT_PROPERTIES) {
      if ((na as Record<string, unknown>)[p.key] === true) d.property_na[p.key] = true;
    }
  }
  return d;
}

export function draftToResponses(draft: LaunchKitDraft): Record<string, unknown> {
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
    property_na: Object.fromEntries(
      LAUNCH_KIT_PROPERTIES.filter(p => draft.property_na[p.key]).map(p => [p.key, true]),
    ),
  };
  for (const p of LAUNCH_KIT_PROPERTIES) out[p.key] = draft[p.key].trim();
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

export function isPropertyNa(draft: LaunchKitDraft, key: LaunchKitPropertyKey): boolean {
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

  const textFields: Array<[keyof LaunchKitDraft, string]> = [
    ['contact_first_name', 'Contact first name'],
    ['company_name', 'Company / DBA'],
    ['csm_name', 'CSM'],
    ['market', 'Market'],
    ['who_works_leads', 'Who works leads'],
    ['speed_standard', 'Speed standard'],
    ['slack_channel_name', 'Slack channel'],
  ];
  for (const [key, label] of textFields) {
    const v = draft[key];
    if (typeof v === 'string' && v.includes(TO_FILL)) errors.push(`${label} still contains ${TO_FILL}.`);
  }

  return errors;
}

/** URL write-backs to `clients` for columns the kit intake owns a copy of. */
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
