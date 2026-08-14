import { randomBytes } from 'crypto';
import { getAppBaseUrl } from '@/lib/app-url';
import { buildContactKey, normalizePhone } from '@/lib/contact-key';
import type { createServiceClient } from '@/lib/supabase';

type Service = ReturnType<typeof createServiceClient>;

export const LOAN_LOG_STAGES = ['submitted', 'funded'] as const;
export type LoanLogStage = (typeof LOAN_LOG_STAGES)[number];

const CONVERSATION_TYPES = new Set(['show', 'live_transfer', 'claimed']);
const PROPOSAL_TYPES = new Set(['proposal_made', 'proposal_sent']);
const SUBMISSION_TYPES = new Set(['submission_made', 'loan_processing']);
const FUNDED_TYPES = new Set(['loan_funded', 'closed']);

export type LoanLogExistingEvent = {
  event_type: string;
  occurred_at: string | null;
};

export type LoanLogEventRow = {
  client_id: string;
  event_type: string;
  occurred_at: string;
  occurred_at_has_time: boolean;
  lead_name: string;
  lead_phone: string;
  ghl_contact_id: string;
  raw: Record<string, unknown>;
};

export type PlanLoanLogInput = {
  stage: LoanLogStage;
  createLead: boolean;
  occurredDate: string;
  loanSize: number;
  commissionAmount: number | null;
  clientId: string;
  leadName: string;
  leadPhone: string;
  ghlContactId: string | null;
  existing: LoanLogExistingEvent[];
};

export type PlanLoanLogResult = {
  rows: LoanLogEventRow[];
  duplicateClicked: boolean;
  ghlContactId: string;
};

export function isLoanLogStage(value: unknown): value is LoanLogStage {
  return value === 'submitted' || value === 'funded';
}

export function generateLoanLogToken(): string {
  return randomBytes(24).toString('base64url');
}

export function buildLoanLogUrl(token: string, baseUrl = getAppBaseUrl()): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/forms/loans/${encodeURIComponent(token)}`;
}

export function parseLoanLogDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const t = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return null;
  return trimmed;
}

export function parseMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function dateKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function hasType(events: LoanLogExistingEvent[], types: Set<string>): boolean {
  return events.some(e => types.has(e.event_type));
}

function hasTypeOnDate(
  events: LoanLogExistingEvent[],
  types: Set<string>,
  date: string,
): boolean {
  return events.some(e => types.has(e.event_type) && dateKey(e.occurred_at) === date);
}

export function planLoanLogEvents(input: PlanLoanLogInput): PlanLoanLogResult {
  const phone = normalizePhone(input.leadPhone);
  const ghlContactId =
    input.ghlContactId?.trim() || buildContactKey(input.clientId, input.leadPhone);
  const occurredAt = `${input.occurredDate}T12:00:00.000Z`;
  const identity = {
    client_id: input.clientId,
    occurred_at: occurredAt,
    occurred_at_has_time: false,
    lead_name: input.leadName.trim(),
    lead_phone: input.leadPhone.trim(),
    ghl_contact_id: ghlContactId,
  };

  const existing = input.existing;
  const hasLead = existing.some(e => e.event_type === 'lead');
  const hasConversation = hasType(existing, CONVERSATION_TYPES);
  const hasProposal = hasType(existing, PROPOSAL_TYPES);
  const hasSubmission = hasType(existing, SUBMISSION_TYPES);
  const clickedTypes = input.stage === 'funded' ? FUNDED_TYPES : SUBMISSION_TYPES;
  const duplicateClicked = hasTypeOnDate(existing, clickedTypes, input.occurredDate);

  const rows: LoanLogEventRow[] = [];

  const push = (event_type: string, raw: Record<string, unknown> = {}) => {
    rows.push({ ...identity, event_type, raw });
  };

  if (input.createLead && !hasLead) {
    push('lead', { source: 'loan_log_form' });
  }
  if (!hasConversation) {
    push('claimed', { source: 'loan_log_form' });
  }
  if (!hasProposal) {
    push('proposal_made', { source: 'loan_log_form' });
  }

  const moneyRaw: Record<string, unknown> = {
    source: 'loan_log_form',
    loan_size: input.loanSize,
  };

  if (!hasSubmission) {
    push('submission_made', moneyRaw);
  } else if (input.stage === 'submitted' && !duplicateClicked) {
    push('submission_made', moneyRaw);
  }

  if (input.stage === 'funded' && !duplicateClicked) {
    const fundedRaw = { ...moneyRaw };
    if (input.commissionAmount != null) {
      fundedRaw.commission_amount = input.commissionAmount;
    }
    push('loan_funded', fundedRaw);
  }

  return { rows, duplicateClicked, ghlContactId };
}

export function extractCommissionTotal(raws: unknown[]): number {
  let sum = 0;
  for (const raw of raws) {
    if (!raw || typeof raw !== 'object') continue;
    const n = Number((raw as { commission_amount?: unknown }).commission_amount);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

export async function ensureLoanLogToken(
  service: Service,
  clientId: string,
): Promise<{ token: string; url: string; created: boolean }> {
  const { data: existing, error: readError } = await service
    .from('clients')
    .select('id, loan_log_token')
    .eq('id', clientId)
    .single();

  if (readError) {
    const status = readError.code === 'PGRST116' ? 404 : 500;
    throw Object.assign(new Error(readError.message), { status });
  }
  if (!existing) {
    throw Object.assign(new Error('Client not found'), { status: 404 });
  }

  if (existing.loan_log_token) {
    return {
      token: existing.loan_log_token,
      url: buildLoanLogUrl(existing.loan_log_token),
      created: false,
    };
  }

  const token = generateLoanLogToken();
  const { error: writeError } = await service
    .from('clients')
    .update({ loan_log_token: token })
    .eq('id', clientId)
    .is('loan_log_token', null);

  if (writeError) {
    const { data: again } = await service
      .from('clients')
      .select('loan_log_token')
      .eq('id', clientId)
      .single();
    if (again?.loan_log_token) {
      return {
        token: again.loan_log_token,
        url: buildLoanLogUrl(again.loan_log_token),
        created: false,
      };
    }
    throw Object.assign(new Error(writeError.message), { status: 500 });
  }

  return { token, url: buildLoanLogUrl(token), created: true };
}

export async function rotateLoanLogToken(
  service: Service,
  clientId: string,
): Promise<{ token: string; url: string }> {
  const token = generateLoanLogToken();
  const { data, error } = await service
    .from('clients')
    .update({ loan_log_token: token })
    .eq('id', clientId)
    .select('id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    throw Object.assign(new Error(error.message), { status });
  }
  if (!data) {
    throw Object.assign(new Error('Client not found'), { status: 404 });
  }

  return { token, url: buildLoanLogUrl(token) };
}

export async function resolveLoanLogToken(
  service: Service,
  token: string,
): Promise<{ client_id: string; client_name: string } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await service
    .from('clients')
    .select('id, name')
    .eq('loan_log_token', trimmed)
    .maybeSingle();

  if (error || !data) return null;
  return { client_id: data.id, client_name: data.name };
}

export { normalizePhone, buildContactKey };
