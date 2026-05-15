/** Normalize phone to digits for matching (US 11-digit → 10). */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

/**
 * Stable lead/contact key scoped per client.
 * Same phone on two clients → two different keys.
 * Uses ghl_contact_id when present (GHL or import `ldr:…` values).
 */
export function buildContactKey(
  clientId: string,
  phone: string | null | undefined,
  ghlContactId?: string | null,
): string {
  const ghl = ghlContactId?.trim();
  if (ghl) return ghl;

  const digits = normalizePhone(phone);
  if (digits) return `ldr:${clientId}:${digits}`;

  return `ldr:${clientId}:unknown`;
}

export function eventPhone(row: {
  lead_phone?: string | null;
  phone_number_used?: string | null;
}): string | null {
  return row.lead_phone ?? row.phone_number_used ?? null;
}

export function shortLeadId(contactKey: string): string {
  if (contactKey.length <= 14) return contactKey;
  return `…${contactKey.slice(-10)}`;
}
