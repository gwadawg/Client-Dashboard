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

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  unmapped: 'Unmapped',
  applied: 'Applied',
  dismissed: 'Dismissed',
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

/** Historical imports — must not block live launch/churn workflows. */
export function isBackfillFormSubmission(row: {
  submitted_by?: string | null;
  responses?: Record<string, unknown> | null;
  applied_patch?: Record<string, unknown> | null;
}): boolean {
  if (row.submitted_by === 'backfill') return true;
  if (row.responses?.backfill === true) return true;
  if (row.applied_patch?.backfill === true) return true;
  return false;
}

export function isOperationalFormSubmission(row: {
  submitted_by?: string | null;
  responses?: Record<string, unknown> | null;
  applied_patch?: Record<string, unknown> | null;
}): boolean {
  return !isBackfillFormSubmission(row);
}

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

export type FormSubmissionListRow = FormSubmissionRow & {
  client_name: string | null;
};

export async function countUnmappedOnboarding(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('client_form_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('form_type', 'onboarding')
    .eq('status', 'unmapped');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listUnmappedOnboardingSubmissions(
  service: SupabaseClient,
): Promise<FormSubmissionRow[]> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('form_type', 'onboarding')
    .eq('status', 'unmapped')
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FormSubmissionRow[];
}

export async function listFormSubmissions(
  service: SupabaseClient,
  opts?: {
    form_type?: FormType;
    status?: FormStatus;
    include_dismissed?: boolean;
    limit?: number;
  },
): Promise<FormSubmissionListRow[]> {
  let query = service
    .from('client_form_submissions')
    .select(`${FORM_SUBMISSION_FIELDS}, clients(name)`)
    .order('submitted_at', { ascending: false })
    .limit(opts?.limit ?? 300);

  if (opts?.form_type) query = query.eq('form_type', opts.form_type);
  if (opts?.status) query = query.eq('status', opts.status);
  else if (!opts?.include_dismissed) query = query.neq('status', 'dismissed');

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map(row => {
    const clients = row.clients as { name?: string } | null;
    const { clients: _clients, ...rest } = row;
    return {
      ...(rest as FormSubmissionRow),
      client_name: clients?.name ?? null,
    };
  });
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
