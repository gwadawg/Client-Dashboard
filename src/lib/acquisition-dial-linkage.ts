import type { SupabaseClient } from '@supabase/supabase-js';

export type DialOption = {
  id: string;
  occurred_at: string;
  duration_seconds: number | null;
  agent_name: string | null;
  recording_url: string | null;
  outcome: string | null;
  phone: string | null;
};

export type DialPickerResult = {
  dials: DialOption[];
  suggested_dial_id: string | null;
};

const DIAL_LIST_LIMIT = 20;
const SUGGEST_WINDOW_MS = 3 * 60 * 60 * 1000; // ±3 hours around appointment

function dialHasRecording(d: DialOption): boolean {
  return !!d.recording_url?.trim();
}

function absTimeDiffMs(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime());
}

/** Pick default dial: explicit id, then closest-with-recording near appointment, else newest with recording. */
export function suggestDialId(
  dials: DialOption[],
  appointmentAt: string | null | undefined,
  explicitDialId?: string | null,
): string | null {
  if (explicitDialId?.trim()) {
    const hit = dials.find((d) => d.id === explicitDialId.trim());
    if (hit) return hit.id;
  }

  const withRecording = dials.filter(dialHasRecording);
  if (withRecording.length === 0) return dials[0]?.id ?? null;

  if (appointmentAt) {
    const apptMs = new Date(appointmentAt).getTime();
    if (Number.isFinite(apptMs)) {
      const inWindow = withRecording.filter((d) => absTimeDiffMs(d.occurred_at, appointmentAt) <= SUGGEST_WINDOW_MS);
      if (inWindow.length === 1) return inWindow[0]!.id;
      if (inWindow.length > 1) {
        return inWindow.sort((a, b) => {
          const timeDiff =
            absTimeDiffMs(a.occurred_at, appointmentAt) - absTimeDiffMs(b.occurred_at, appointmentAt);
          if (timeDiff !== 0) return timeDiff;
          return (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0);
        })[0]!.id;
      }
    }
  }

  if (withRecording.length === 1) return withRecording[0]!.id;

  return withRecording.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  )[0]!.id;
}

export async function listDialsForLead(
  service: SupabaseClient,
  leadId: string,
  opts?: { limit?: number; sinceDays?: number },
): Promise<DialOption[]> {
  const limit = opts?.limit ?? DIAL_LIST_LIMIT;
  const sinceDays = opts?.sinceDays ?? 14;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const { data, error } = await service
    .from('acquisition_dials')
    .select('id, occurred_at, duration_seconds, agent_name, recording_url, outcome, phone')
    .eq('lead_id', leadId)
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as DialOption[];
}

export async function getDialPickerForLead(
  service: SupabaseClient,
  leadId: string,
  opts?: {
    appointmentAt?: string | null;
    explicitDialId?: string | null;
    limit?: number;
    sinceDays?: number;
  },
): Promise<DialPickerResult> {
  const dials = await listDialsForLead(service, leadId, opts);
  return {
    dials,
    suggested_dial_id: suggestDialId(dials, opts?.appointmentAt, opts?.explicitDialId),
  };
}

export type ResolvedDialLink = {
  dial_id: string;
  recording_url: string | null;
  link_method: 'picker' | 'single_candidate';
};

/** Resolve dial for form submit. Requires dial_id unless exactly one candidate near appointment. */
export async function resolveDialLinkForSubmit(
  service: SupabaseClient,
  leadId: string,
  opts: {
    dial_id?: string | null;
    appointmentAt?: string | null;
    recording_url?: string | null;
  },
): Promise<ResolvedDialLink | null> {
  const explicitId = opts.dial_id?.trim();
  if (explicitId) {
    const { data, error } = await service
      .from('acquisition_dials')
      .select('id, recording_url, lead_id')
      .eq('id', explicitId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error('Selected call was not found');
    if (data.lead_id && data.lead_id !== leadId) {
      throw new Error('Selected call does not belong to this lead');
    }
    return {
      dial_id: data.id,
      recording_url: data.recording_url ?? opts.recording_url ?? null,
      link_method: 'picker',
    };
  }

  const dials = await listDialsForLead(service, leadId, { sinceDays: 14 });
  if (dials.length === 0) return null;

  const appointmentAt = opts.appointmentAt;
  if (appointmentAt) {
    const candidates = dials.filter(
      (d) => absTimeDiffMs(d.occurred_at, appointmentAt) <= SUGGEST_WINDOW_MS,
    );
    if (candidates.length === 1) {
      return {
        dial_id: candidates[0]!.id,
        recording_url: candidates[0]!.recording_url ?? opts.recording_url ?? null,
        link_method: 'single_candidate',
      };
    }
  }

  return null;
}

export function formatDialOptionLabel(d: DialOption): string {
  const when = new Date(d.occurred_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const dur =
    d.duration_seconds != null
      ? `${Math.floor(d.duration_seconds / 60)}:${String(d.duration_seconds % 60).padStart(2, '0')}`
      : '—';
  const agent = d.agent_name ?? 'Unknown agent';
  const outcome = d.outcome ?? 'unknown';
  const rec = dialHasRecording(d) ? '' : ' · no recording';
  return `${when} · ${dur} · ${agent} · ${outcome}${rec}`;
}

export type DialReportStatus = {
  documented: boolean;
  form_type: string | null;
  call_id: string | null;
};

/** Batch-load report status for dial ids (form_submission linked). */
export async function loadDialReportStatusByDialIds(
  service: SupabaseClient,
  dialIds: string[],
): Promise<Map<string, DialReportStatus>> {
  const out = new Map<string, DialReportStatus>();
  if (dialIds.length === 0) return out;

  const { data: calls, error: callErr } = await service
    .from('acquisition_calls')
    .select('id, dial_id, form_submission_id')
    .in('dial_id', dialIds)
    .not('form_submission_id', 'is', null);

  if (callErr) throw new Error(callErr.message);

  const submissionIds = [...new Set((calls ?? []).map((c) => c.form_submission_id).filter(Boolean))] as string[];
  const formTypeBySubmission = new Map<string, string>();

  if (submissionIds.length > 0) {
    const { data: subs, error: subErr } = await service
      .from('acquisition_form_submissions')
      .select('id, form_type')
      .in('id', submissionIds);
    if (subErr) throw new Error(subErr.message);
    for (const s of subs ?? []) {
      if (s.id && s.form_type) formTypeBySubmission.set(s.id, s.form_type);
    }
  }

  for (const dialId of dialIds) {
    out.set(dialId, { documented: false, form_type: null, call_id: null });
  }

  for (const call of calls ?? []) {
    if (!call.dial_id) continue;
    out.set(call.dial_id, {
      documented: true,
      form_type: call.form_submission_id
        ? (formTypeBySubmission.get(call.form_submission_id) ?? null)
        : null,
      call_id: call.id,
    });
  }

  return out;
}
