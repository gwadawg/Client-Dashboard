// Client account contacts: LOA, Co-LO, and other team members (primary holder stays on clients).

import { normalizeStatesLicensed } from '@/lib/us-states';

export const CONTACT_TYPE_CODES = ['loa', 'co_lo', 'other'] as const;
export type ContactType = (typeof CONTACT_TYPE_CODES)[number];

export const CONTACT_TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: 'loa', label: 'LOA / Assistant' },
  { value: 'co_lo', label: 'Co-LO / Partner LO' },
  { value: 'other', label: 'Other' },
];

export type ClientContact = {
  id: string;
  client_id: string;
  contact_type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  nmls: string | null;
  states_licensed: string[] | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export const CLIENT_CONTACT_FIELDS =
  'id, client_id, contact_type, name, email, phone, nmls, states_licensed, notes, sort_order, created_at, updated_at, created_by, updated_by';

export function isValidContactType(value: unknown): value is ContactType {
  return typeof value === 'string' && (CONTACT_TYPE_CODES as readonly string[]).includes(value);
}

export function contactTypeLabel(type: string | null | undefined): string {
  const found = CONTACT_TYPE_OPTIONS.find(o => o.value === type);
  return found?.label ?? type ?? '—';
}

export function contactRequiresLicensedStates(type: string | null | undefined): boolean {
  return type === 'co_lo';
}

export type ContactInput = {
  contact_type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  nmls: string | null;
  states_licensed: string[] | null;
  notes: string | null;
};

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function validateContactInput(
  body: Record<string, unknown>,
): { ok: true; data: ContactInput } | { ok: false; error: string } {
  if (!isValidContactType(body.contact_type)) {
    return { ok: false, error: 'Invalid contact_type' };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'name is required' };
  }

  const states_licensed = contactRequiresLicensedStates(body.contact_type)
    ? normalizeStatesLicensed(body.states_licensed)
    : null;

  if (contactRequiresLicensedStates(body.contact_type) && !states_licensed?.length) {
    return { ok: false, error: 'Licensed states are required for Co-LO contacts' };
  }

  return {
    ok: true,
    data: {
      contact_type: body.contact_type,
      name,
      email: optionalText(body.email),
      phone: optionalText(body.phone),
      nmls: optionalText(body.nmls),
      states_licensed,
      notes: optionalText(body.notes),
    },
  };
}

export function validateContactPatch(
  body: Record<string, unknown>,
  current: Pick<ClientContact, 'contact_type' | 'states_licensed'>,
): { ok: true; updates: Partial<ContactInput> } | { ok: false; error: string } {
  const updates: Partial<ContactInput> = {};

  if ('contact_type' in body) {
    if (!isValidContactType(body.contact_type)) {
      return { ok: false, error: 'Invalid contact_type' };
    }
    updates.contact_type = body.contact_type;
  }

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { ok: false, error: 'name cannot be empty' };
    updates.name = name;
  }

  if ('email' in body) updates.email = optionalText(body.email);
  if ('phone' in body) updates.phone = optionalText(body.phone);
  if ('nmls' in body) updates.nmls = optionalText(body.nmls);
  if ('notes' in body) updates.notes = optionalText(body.notes);

  const effectiveType = updates.contact_type ?? current.contact_type;

  if ('states_licensed' in body) {
    updates.states_licensed = contactRequiresLicensedStates(effectiveType)
      ? normalizeStatesLicensed(body.states_licensed)
      : null;
  } else if (updates.contact_type && !contactRequiresLicensedStates(effectiveType)) {
    updates.states_licensed = null;
  }

  if (contactRequiresLicensedStates(effectiveType)) {
    const resolvedStates =
      updates.states_licensed !== undefined ? updates.states_licensed : current.states_licensed;
    if (!resolvedStates?.length) {
      return { ok: false, error: 'Licensed states are required for Co-LO contacts' };
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'No fields to update' };
  }

  return { ok: true, updates };
}
