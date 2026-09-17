import type { SupabaseClient } from '@supabase/supabase-js';
import { insertFormSubmission } from '@/lib/form-submissions';
import { CONTACT_ROLE_OPTIONS } from '@/lib/kickoff';
import { latestReinstateCutoffIso } from '@/lib/reinstate-progress';
import { normalizeStatesLicensed } from '@/lib/us-states';
import { isKnownUsClientTimezone } from '@/lib/us-timezones';

/** Columns needed to resolve + prefill. Do not select tokens, GHL, MRR, or lifecycle. */
export const WELCOME_BACK_CLIENT_SELECT =
  'id, name, primary_contact_name, email, phone, brokerage_name, legal_business_name, nmls, city, state, zip_code, street_address, states_licensed, timezone, website, facebook_page_name, contact_role, biography';

export const WELCOME_BACK_PREFILL_FIELDS = WELCOME_BACK_CLIENT_SELECT;

export type WelcomeBackPrefill = {
  name: string;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  brokerage_name: string | null;
  legal_business_name: string | null;
  nmls: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  street_address: string | null;
  states_licensed: string[];
  timezone: string | null;
  website: string | null;
  facebook_page_name: string | null;
  contact_role: string | null;
  biography: string | null;
};

export type WelcomeBackClientRow = WelcomeBackPrefill & { id: string };

export type WelcomeBackFormInput = {
  primary_contact_name: string;
  email: string;
  phone: string;
  brokerage_name: string;
  legal_business_name: string;
  nmls: string;
  city: string;
  state: string;
  zip_code: string;
  street_address: string;
  states_licensed: string[];
  timezone: string;
  website: string;
  facebook_page_name: string;
  contact_role: string;
  biography: string;
};

/** Client columns the welcome-back POST may write. */
export const WELCOME_BACK_PATCH_KEYS = [
  'primary_contact_name',
  'primary_contact',
  'email',
  'billing_email',
  'phone',
  'brokerage_name',
  'legal_business_name',
  'nmls',
  'city',
  'state',
  'zip_code',
  'street_address',
  'states_licensed',
  'timezone',
  'website',
  'facebook_page_name',
  'contact_role',
  'biography',
] as const;

const PATCH_KEY_SET = new Set<string>(WELCOME_BACK_PATCH_KEYS);
const CONTACT_ROLES = CONTACT_ROLE_OPTIONS as readonly string[];

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function textOrNull(v: unknown): string | null {
  const s = trim(v);
  return s || null;
}

export function welcomeBackInvalidMessage(): string {
  return "This welcome-back link isn’t valid. Ask your Waiz contact for a new one.";
}

export function prefillFromClientRow(row: Record<string, unknown>): WelcomeBackPrefill {
  return {
    name: trim(row.name),
    primary_contact_name: textOrNull(row.primary_contact_name),
    email: textOrNull(row.email),
    phone: textOrNull(row.phone),
    brokerage_name: textOrNull(row.brokerage_name),
    legal_business_name: textOrNull(row.legal_business_name),
    nmls: textOrNull(row.nmls),
    city: textOrNull(row.city),
    state: textOrNull(row.state),
    zip_code: textOrNull(row.zip_code),
    street_address: textOrNull(row.street_address),
    states_licensed: normalizeStatesLicensed(row.states_licensed) ?? [],
    timezone: textOrNull(row.timezone),
    website: textOrNull(row.website),
    facebook_page_name: textOrNull(row.facebook_page_name),
    contact_role: textOrNull(row.contact_role),
    biography: textOrNull(row.biography),
  };
}

export function toWelcomeBackPrefill(client: WelcomeBackClientRow): WelcomeBackPrefill {
  return prefillFromClientRow(client);
}

/** True when a welcome-back OB already exists in the current reinstate cycle. */
export function hasWelcomeBackSubmittedAfterCutoff(
  rows: Array<{ form_type: string; submitted_at: string; status?: string }>,
): boolean {
  const cutoff = latestReinstateCutoffIso(rows);
  return rows.some((row) => {
    if (row.form_type !== 'reinstate_onboarding') return false;
    if (row.status && row.status !== 'applied' && row.status !== 'submitted') return false;
    if (cutoff && row.submitted_at < cutoff) return false;
    return true;
  });
}

export async function resolveWelcomeBackToken(
  service: SupabaseClient,
  token: string,
): Promise<WelcomeBackClientRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const { data, error } = await service
    .from('clients')
    .select(WELCOME_BACK_CLIENT_SELECT)
    .eq('welcome_back_token', trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { id: String(row.id), ...prefillFromClientRow(row) };
}

export async function hasWelcomeBackAlreadySubmitted(
  service: SupabaseClient,
  clientId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select('form_type, submitted_at, status')
    .eq('client_id', clientId)
    .in('form_type', ['reinstate', 'reinstate_onboarding']);
  if (error) throw new Error(error.message);
  return hasWelcomeBackSubmittedAfterCutoff(
    (data ?? []) as Array<{ form_type: string; submitted_at: string; status?: string }>,
  );
}

function parseStatesInput(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      return normalizeStatesLicensed(JSON.parse(raw)) ?? [];
    } catch {
      return normalizeStatesLicensed(raw.split(',').map((s) => s.trim()).filter(Boolean)) ?? [];
    }
  }
  return normalizeStatesLicensed(raw) ?? [];
}

export function parseWelcomeBackFormFields(body: Record<string, unknown>): WelcomeBackFormInput {
  const primary_contact_name = trim(body.primary_contact_name);
  if (!primary_contact_name) throw new Error('Primary contact name is required');

  const email = trim(body.email);
  const phone = trim(body.phone);
  if (!email) throw new Error('Email is required');
  if (!phone) throw new Error('Phone is required');

  const nmls = trim(body.nmls);
  if (!nmls) throw new Error('NMLS is required');

  const city = trim(body.city);
  const state = trim(body.state).toUpperCase().slice(0, 2);
  if (!city) throw new Error('City is required');
  if (!state) throw new Error('State is required');

  const timezone = trim(body.timezone);
  if (!timezone) throw new Error('Timezone is required');
  if (!isKnownUsClientTimezone(timezone)) {
    throw new Error('Please select a valid US timezone');
  }

  const states_licensed = parseStatesInput(body.states_licensed);
  if (!states_licensed.length) throw new Error('At least one licensed state is required');

  const contact_role = trim(body.contact_role);
  if (contact_role && !CONTACT_ROLES.includes(contact_role)) {
    throw new Error('Please select a valid contact role');
  }

  const website = trim(body.website);
  if (website && !/^https?:\/\/.+/i.test(website)) {
    throw new Error('Website must start with http:// or https://');
  }

  return {
    primary_contact_name,
    email,
    phone,
    brokerage_name: trim(body.brokerage_name),
    legal_business_name: trim(body.legal_business_name),
    nmls,
    city,
    state,
    zip_code: trim(body.zip_code),
    street_address: trim(body.street_address),
    states_licensed,
    timezone,
    website,
    facebook_page_name: trim(body.facebook_page_name),
    contact_role,
    biography: trim(body.biography),
  };
}

export function welcomeBackToClientPatch(input: WelcomeBackFormInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    email: input.email,
    billing_email: input.email,
    phone: input.phone,
    primary_contact_name: input.primary_contact_name,
    primary_contact: input.primary_contact_name,
    brokerage_name: input.brokerage_name || null,
    legal_business_name: input.legal_business_name || null,
    nmls: input.nmls,
    city: input.city,
    state: input.state,
    zip_code: input.zip_code || null,
    street_address: input.street_address || null,
    states_licensed: input.states_licensed,
    timezone: input.timezone,
    website: input.website || null,
    facebook_page_name: input.facebook_page_name || null,
    contact_role: input.contact_role || null,
    biography: input.biography || null,
  };

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (PATCH_KEY_SET.has(key)) safe[key] = value;
  }
  return safe;
}

export function welcomeBackResponsesFromInput(input: WelcomeBackFormInput): Record<string, unknown> {
  return { ...input };
}

export async function applyWelcomeBackSubmission(
  service: SupabaseClient,
  clientId: string,
  input: WelcomeBackFormInput,
  _rawBody?: Record<string, unknown>,
): Promise<{ client_id: string; submission_id: string }> {
  const patch = welcomeBackToClientPatch(input);
  const { error } = await service.from('clients').update(patch).eq('id', clientId);
  if (error) throw new Error(error.message);

  const submission = await insertFormSubmission(service, {
    client_id: clientId,
    form_type: 'reinstate_onboarding',
    status: 'applied',
    submitted_by: 'client',
    match_email: input.email,
    match_phone: input.phone,
    responses: welcomeBackResponsesFromInput(input),
    applied_patch: patch,
  });

  return { client_id: clientId, submission_id: submission.id };
}

export type WelcomeBackParseResult =
  | { ok: true; patch: Record<string, unknown>; responses: Record<string, unknown> }
  | { ok: false; error: string };

export function parseWelcomeBackBody(body: Record<string, unknown>): WelcomeBackParseResult {
  try {
    const input = parseWelcomeBackFormFields(body);
    return {
      ok: true,
      patch: welcomeBackToClientPatch(input),
      responses: welcomeBackResponsesFromInput(input),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
