import type { SupabaseClient } from '@supabase/supabase-js';

export const FORM_TYPES = ['new_client', 'onboarding', 'kickoff', 'launch', 'churn'] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const FORM_STATUSES = ['draft', 'submitted', 'unmapped', 'applied', 'dismissed'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  new_client: 'New Client',
  onboarding: 'Onboarding',
  kickoff: 'Kickoff',
  launch: 'Launch',
  churn: 'Churn / Offboarding',
};

export type FormSubmissionRow = {
  id: string;
  client_id: string | null;
  form_type: FormType;
  status: FormStatus;
  submitted_by: string | null;
  match_email: string | null;
  match_phone: string | null;
  responses: Record<string, unknown>;
  applied_patch: Record<string, unknown> | null;
  submitted_at: string;
};

export const FORM_SUBMISSION_FIELDS =
  'id, client_id, form_type, status, submitted_by, match_email, match_phone, responses, applied_patch, submitted_at';

export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return digits || null;
}

export function normalizeEmailForMatch(email: string | null | undefined): string | null {
  if (!email) return null;
  const s = email.trim().toLowerCase();
  return s || null;
}

export async function insertFormSubmission(
  service: SupabaseClient,
  row: {
    client_id?: string | null;
    form_type: FormType;
    status?: FormStatus;
    submitted_by?: string | null;
    match_email?: string | null;
    match_phone?: string | null;
    responses?: Record<string, unknown>;
    applied_patch?: Record<string, unknown> | null;
  },
): Promise<FormSubmissionRow> {
  const { data, error } = await service
    .from('client_form_submissions')
    .insert({
      client_id: row.client_id ?? null,
      form_type: row.form_type,
      status: row.status ?? (row.client_id ? 'applied' : 'submitted'),
      submitted_by: row.submitted_by ?? null,
      match_email: row.match_email ? normalizeEmailForMatch(row.match_email) : null,
      match_phone: row.match_phone ? normalizePhoneForMatch(row.match_phone) : null,
      responses: row.responses ?? {},
      applied_patch: row.applied_patch ?? null,
    })
    .select(FORM_SUBMISSION_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as FormSubmissionRow;
}

export async function findClientsByContact(
  service: SupabaseClient,
  email: string | null,
  phone: string | null,
): Promise<{ id: string; name: string; email: string | null; phone: string | null }[]> {
  const normEmail = normalizeEmailForMatch(email);
  const normPhone = normalizePhoneForMatch(phone);
  const matches = new Map<string, { id: string; name: string; email: string | null; phone: string | null }>();

  if (normEmail) {
    const { data } = await service.from('clients').select('id, name, email, phone, billing_email');
    for (const c of data ?? []) {
      const e = normalizeEmailForMatch(c.email) ?? normalizeEmailForMatch(c.billing_email);
      if (e === normEmail) matches.set(c.id, { id: c.id, name: c.name, email: c.email, phone: c.phone });
    }
  }

  if (normPhone) {
    const { data } = await service.from('clients').select('id, name, email, phone');
    for (const c of data ?? []) {
      if (normalizePhoneForMatch(c.phone) === normPhone) {
        matches.set(c.id, { id: c.id, name: c.name, email: c.email, phone: c.phone });
      }
    }
  }

  return [...matches.values()];
}

export async function getFormProgressForClients(
  service: SupabaseClient,
  clientIds: string[],
): Promise<Record<string, Partial<Record<FormType, boolean>>>> {
  if (clientIds.length === 0) return {};
  const { data, error } = await service
    .from('client_form_submissions')
    .select('client_id, form_type, status')
    .in('client_id', clientIds)
    .in('status', ['applied', 'submitted'])
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);

  const out: Record<string, Partial<Record<FormType, boolean>>> = {};
  for (const row of data ?? []) {
    if (!row.client_id) continue;
    const cid = row.client_id as string;
    const ft = row.form_type as FormType;
    if (!out[cid]) out[cid] = {};
    if (out[cid][ft] === undefined) out[cid][ft] = true;
  }
  return out;
}

export async function getLatestSubmissionsByClient(
  service: SupabaseClient,
  clientId: string,
): Promise<Partial<Record<FormType, FormSubmissionRow>>> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('client_id', clientId)
    .in('status', ['applied', 'submitted'])
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);

  const out: Partial<Record<FormType, FormSubmissionRow>> = {};
  for (const row of (data ?? []) as FormSubmissionRow[]) {
    if (!out[row.form_type]) out[row.form_type] = row;
  }
  return out;
}

export async function listFormSubmissionsForClient(
  service: SupabaseClient,
  clientId: string,
): Promise<FormSubmissionRow[]> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('client_id', clientId)
    .neq('status', 'dismissed')
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FormSubmissionRow[];
}
