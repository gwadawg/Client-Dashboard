import { validateContactInput, type ContactType } from '@/lib/client-contacts';
import {
  normalizeEmailForMatch,
  normalizePhoneForMatch,
} from '@/lib/form-submissions';
import type {
  AccountManagement,
  CompanyAddress,
  CrmChoice,
  MemberDraft,
  ObRole,
  OnboardingFormVariant,
  PerformanceUnit,
} from '@/lib/onboarding-steps';
import { normalizeStatesLicensed } from '@/lib/us-states';
import { isKnownUsClientTimezone } from '@/lib/us-timezones';

export type OnboardingMemberInput = {
  contact_type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  nmls: string | null;
  states_licensed: string[] | null;
};

export type OnboardingFormInput = {
  form_variant: OnboardingFormVariant;
  first_name: string | null;
  last_name: string | null;
  account_management: AccountManagement;
  ob_role: ObRole;
  email: string;
  phone: string;
  nmls: string;
  states_licensed: string[];
  brokerage_name: string;
  legal_business_name: string;
  website: string;
  company_nmls: string;
  company_address: CompanyAddress;
  company_states_licensed: string[];
  biography: string;
  review_url: string | null;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  timezone: string;
  performance_unit: PerformanceUnit | null;
  crm_choice: CrmChoice | null;
  headshot_url?: string | null;
  additional_members: OnboardingMemberInput[];
};

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseCompanyAddress(body: Record<string, unknown>): CompanyAddress {
  if (body.company_address && typeof body.company_address === 'object' && !Array.isArray(body.company_address)) {
    const a = body.company_address as Record<string, unknown>;
    return {
      street: trim(a.street),
      city: trim(a.city),
      state: trim(a.state).toUpperCase().slice(0, 2),
      zip: trim(a.zip),
    };
  }
  return {
    street: trim(body.company_street),
    city: trim(body.company_city),
    state: trim(body.company_state).toUpperCase().slice(0, 2),
    zip: trim(body.company_zip),
  };
}

function parseMembers(body: Record<string, unknown>): OnboardingMemberInput[] {
  let raw: unknown = body.additional_members;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const members: OnboardingMemberInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid team member at position ${i + 1}`);
    }
    const validated = validateContactInput(item as Record<string, unknown>);
    if (!validated.ok) {
      throw new Error(`Team member ${i + 1}: ${validated.error}`);
    }
    members.push(validated.data);
  }
  return members;
}

function parseObRole(body: Record<string, unknown>): ObRole {
  const role = trim(body.ob_role);
  if (role === 'mlo' || role === 'owner') return role;
  throw new Error('Role is required (mlo or owner)');
}

function parseAccountManagement(body: Record<string, unknown>): AccountManagement {
  const v = trim(body.account_management);
  if (v === 'solo' || v === 'internal_team' || v === 'assistant' || v === 'partner') return v;
  throw new Error('Account management style is required');
}

function parseFormVariant(body: Record<string, unknown>): OnboardingFormVariant {
  const v = trim(body.form_variant);
  if (v === 'dscr_performance') return 'dscr_performance';
  return 'core';
}

function parsePerformanceUnit(body: Record<string, unknown>, variant: OnboardingFormVariant): PerformanceUnit | null {
  const raw = trim(body.performance_unit).toLowerCase();
  if (raw === 'leads' || raw === 'conversations') return raw;
  if (variant === 'dscr_performance') {
    throw new Error('Please choose Leads or Conversations');
  }
  return null;
}

function parseCrmChoice(
  body: Record<string, unknown>,
  variant: OnboardingFormVariant,
  unit: PerformanceUnit | null,
): CrmChoice | null {
  const raw = trim(body.crm_choice).toLowerCase();
  if (raw === 'waiz' || raw === 'client') return raw;
  if (variant === 'dscr_performance' && unit === 'leads') {
    throw new Error('Please choose whose CRM you will use');
  }
  return null;
}

export function parseOnboardingFormFields(body: Record<string, unknown>): OnboardingFormInput {
  const form_variant = parseFormVariant(body);
  const account_management = parseAccountManagement(body);
  const ob_role = parseObRole(body);
  const email = trim(body.email);
  const phone = trim(body.phone);
  if (!email && !phone) {
    throw new Error('Email or phone is required so we can match your account');
  }
  if (!email) throw new Error('Email is required');
  if (!phone) throw new Error('Phone is required');

  const first_name = trim(body.first_name) || null;
  const last_name = trim(body.last_name) || null;
  if (form_variant === 'dscr_performance') {
    if (!first_name) throw new Error('First name is required');
    if (!last_name) throw new Error('Last name is required');
  }

  const performance_unit = parsePerformanceUnit(body, form_variant);
  const crm_choice = parseCrmChoice(body, form_variant, performance_unit);

  const nmls = trim(body.nmls);
  if (!nmls) throw new Error('NMLS is required');

  const states_licensed = normalizeStatesLicensed(body.states_licensed) ?? [];
  if (!states_licensed.length) throw new Error('At least one licensed state is required');

  const city = trim(body.city);
  const state = trim(body.state).toUpperCase().slice(0, 2);
  if (!city) throw new Error('City is required');
  if (!state) throw new Error('State is required');

  const timezone = trim(body.timezone);
  if (!timezone) throw new Error('Timezone is required');
  if (!isKnownUsClientTimezone(timezone)) {
    throw new Error('Please select a valid US timezone');
  }

  const biography = trim(body.biography);
  if (!biography) throw new Error('Bio is required');

  const review_url = trim(body.review_url) || null;
  if (review_url && !/^https?:\/\/.+/i.test(review_url)) {
    throw new Error('Review URL must start with http:// or https://');
  }

  let brokerage_name = trim(body.brokerage_name);
  let legal_business_name = trim(body.legal_business_name);
  let website = trim(body.website);
  let company_nmls = trim(body.company_nmls);
  const company_address = parseCompanyAddress(body);
  let company_states_licensed = normalizeStatesLicensed(body.company_states_licensed) ?? [];

  if (ob_role === 'mlo') {
    if (!brokerage_name) throw new Error('Company name is required');
  } else {
    const company_name = trim(body.company_name) || legal_business_name || brokerage_name;
    if (!company_name) throw new Error('Company name is required');
    brokerage_name = company_name;
    legal_business_name = company_name;
    if (!website) throw new Error('Company website is required');
    if (!company_nmls) throw new Error('Company NMLS is required');
    if (!company_address.street || !company_address.city || !company_address.state || !company_address.zip) {
      throw new Error('Full company address is required');
    }
    if (!company_states_licensed.length) {
      throw new Error('At least one company licensed state is required');
    }
  }

  const additional_members = parseMembers(body);

  return {
    form_variant,
    first_name,
    last_name,
    account_management,
    ob_role,
    email,
    phone,
    nmls,
    states_licensed,
    brokerage_name,
    legal_business_name,
    website: ob_role === 'owner' ? website : '',
    company_nmls: ob_role === 'owner' ? company_nmls : '',
    company_address: ob_role === 'owner' ? company_address : { street: '', city: '', state: '', zip: '' },
    company_states_licensed: ob_role === 'owner' ? company_states_licensed : [],
    biography,
    review_url,
    street_address: trim(body.street_address),
    city,
    state,
    zip_code: trim(body.zip_code),
    timezone,
    performance_unit,
    crm_choice,
    headshot_url: trim(body.headshot_url) || null,
    additional_members,
  };
}

export function obRoleToContactRole(ob_role: ObRole): string {
  return ob_role === 'owner' ? 'Broker Owner' : 'MLO';
}

export function primaryContactNameFromInput(input: OnboardingFormInput): string | null {
  const name = [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

export function onboardingToClientPatch(input: OnboardingFormInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    email: input.email,
    billing_email: input.email,
    phone: input.phone,
    nmls: input.nmls,
    states_licensed: input.states_licensed,
    biography: input.biography,
    street_address: input.street_address || null,
    city: input.city,
    state: input.state,
    zip_code: input.zip_code || null,
    timezone: input.timezone,
    contact_role: obRoleToContactRole(input.ob_role),
  };

  const fullName = primaryContactNameFromInput(input);
  if (fullName) {
    patch.primary_contact_name = fullName;
    patch.primary_contact = fullName;
  }

  if (input.brokerage_name) patch.brokerage_name = input.brokerage_name;
  if (input.legal_business_name) patch.legal_business_name = input.legal_business_name;
  if (input.website) patch.website = input.website;
  if (input.headshot_url) patch.headshot_url = input.headshot_url;

  return patch;
}

export function onboardingResponsesFromInput(input: OnboardingFormInput): Record<string, unknown> {
  return {
    form_variant: input.form_variant,
    first_name: input.first_name,
    last_name: input.last_name,
    account_management: input.account_management,
    ob_role: input.ob_role,
    email: input.email,
    phone: input.phone,
    nmls: input.nmls,
    states_licensed: input.states_licensed,
    brokerage_name: input.brokerage_name,
    legal_business_name: input.legal_business_name,
    website: input.website || null,
    company_nmls: input.company_nmls || null,
    company_address: input.ob_role === 'owner' ? input.company_address : null,
    company_states_licensed: input.company_states_licensed.length ? input.company_states_licensed : null,
    biography: input.biography,
    review_url: input.review_url,
    street_address: input.street_address,
    city: input.city,
    state: input.state,
    zip_code: input.zip_code,
    timezone: input.timezone,
    performance_unit: input.performance_unit,
    crm_choice: input.crm_choice,
    headshot_url: input.headshot_url ?? null,
    additional_members: input.additional_members,
    match_email: normalizeEmailForMatch(input.email),
    match_phone: normalizePhoneForMatch(input.phone),
  };
}

export const ONBOARDING_FIELD_LABELS: Record<string, string> = {
  form_variant: 'Form variant',
  first_name: 'First name',
  last_name: 'Last name',
  account_management: 'Account management',
  ob_role: 'Role',
  email: 'Email',
  phone: 'Phone',
  nmls: 'NMLS',
  states_licensed: 'States licensed',
  brokerage_name: 'Brokerage / lender',
  legal_business_name: 'Legal business name',
  website: 'Company website',
  company_nmls: 'Company NMLS',
  company_address: 'Company address',
  company_states_licensed: 'Company licensed states',
  biography: 'Bio',
  review_url: 'Review link',
  street_address: 'Street address',
  city: 'City',
  state: 'State',
  zip_code: 'ZIP code',
  timezone: 'Timezone',
  performance_unit: 'Leads or Conversations',
  crm_choice: 'CRM',
  headshot_url: 'Headshot',
  additional_members: 'Team members',
};

/** Build multipart body fields from wizard draft for API submit. */
export function draftToSubmitBody(
  draft: {
    first_name: string;
    last_name: string;
    account_management: string;
    ob_role: string;
    brokerage_name: string;
    company_name: string;
    website: string;
    company_nmls: string;
    company_address: CompanyAddress;
    company_states_licensed: string[];
    nmls: string;
    phone: string;
    email: string;
    states_licensed: string[];
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    timezone: string;
    performance_unit: string;
    crm_choice: string;
    review_url: string;
    biography: string;
    additional_members: MemberDraft[];
  },
  formVariant: OnboardingFormVariant = 'core',
): Record<string, string> {
  const members = draft.additional_members
    .filter(m => m.contact_type && m.name.trim())
    .map(m => ({
      contact_type: m.contact_type,
      name: m.name.trim(),
      email: m.email.trim() || null,
      phone: m.phone.trim() || null,
      nmls: m.nmls.trim() || null,
      states_licensed: m.states_licensed.length ? m.states_licensed : null,
      notes: null,
    }));

  return {
    form_variant: formVariant,
    first_name: draft.first_name,
    last_name: draft.last_name,
    account_management: draft.account_management,
    ob_role: draft.ob_role,
    brokerage_name: draft.brokerage_name,
    company_name: draft.company_name,
    legal_business_name: draft.company_name,
    website: draft.website,
    company_nmls: draft.company_nmls,
    company_street: draft.company_address.street,
    company_city: draft.company_address.city,
    company_state: draft.company_address.state,
    company_zip: draft.company_address.zip,
    company_states_licensed: JSON.stringify(draft.company_states_licensed),
    nmls: draft.nmls,
    phone: draft.phone,
    email: draft.email,
    states_licensed: JSON.stringify(draft.states_licensed),
    street_address: draft.street_address,
    city: draft.city,
    state: draft.state,
    zip_code: draft.zip_code,
    timezone: draft.timezone,
    performance_unit: draft.performance_unit,
    crm_choice: draft.crm_choice,
    review_url: draft.review_url,
    biography: draft.biography,
    additional_members: JSON.stringify(members),
  };
}
