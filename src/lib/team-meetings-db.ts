import {
  TEAM_MEETING_SEED,
  parseChecklist,
  plannedSlotsForRange,
  templateRowFromSeed,
  type DispositionFieldDef,
  type TeamMeetingInstanceView,
} from '@/lib/team-meetings';
import type { createServiceClient } from '@/lib/supabase';

export type ServiceClient = ReturnType<typeof createServiceClient>;

export const TEMPLATE_FIELDS =
  'id, slug, title, theme, call_type, weekdays, default_time, duration_min, host_role, attendee_roles, agenda_md, checklist, disposition, active';

export const INSTANCE_FIELDS =
  'id, template_id, scheduled_at, status, host_agent_id, checklist_state, responses, recording_url, notes, team_call_id, completed_at, completed_by, created_at, updated_at';

export type TemplateDb = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  call_type: string;
  weekdays: number[];
  default_time: string;
  duration_min: number;
  host_role: string;
  attendee_roles: string[];
  agenda_md: string;
  checklist: unknown;
  disposition: unknown;
  active: boolean;
};

export async function ensureTemplates(service: ServiceClient): Promise<TemplateDb[]> {
  for (const seed of TEAM_MEETING_SEED) {
    const row = templateRowFromSeed(seed);
    const { error } = await service.from('team_meeting_templates').upsert(row, {
      onConflict: 'slug',
    });
    if (error) throw new Error(error.message);
  }

  const { data, error } = await service
    .from('team_meeting_templates')
    .select(TEMPLATE_FIELDS)
    .eq('active', true);
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateDb[];
}

export async function ensureInstances(
  service: ServiceClient,
  templates: TemplateDb[],
  fromYmd: string,
  toYmd: string,
) {
  const inserts: { template_id: string; scheduled_at: string; status: string }[] = [];
  for (const t of templates) {
    const time =
      typeof t.default_time === 'string' && t.default_time.length >= 5
        ? t.default_time.slice(0, 5)
        : '09:00';
    const slots = plannedSlotsForRange(
      { weekdays: t.weekdays ?? [], default_time: time },
      fromYmd,
      toYmd,
    );
    for (const slot of slots) {
      inserts.push({
        template_id: t.id,
        scheduled_at: slot.toISOString(),
        status: 'scheduled',
      });
    }
  }

  if (!inserts.length) return;

  const { error } = await service.from('team_meeting_instances').upsert(inserts, {
    onConflict: 'template_id,scheduled_at',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}

export function mapInstanceView(
  row: Record<string, unknown>,
  template: TemplateDb,
): TeamMeetingInstanceView {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    scheduled_at: row.scheduled_at as string,
    status: row.status as TeamMeetingInstanceView['status'],
    host_agent_id: (row.host_agent_id as string | null) ?? null,
    checklist_state: (row.checklist_state as Record<string, boolean>) ?? {},
    responses: (row.responses as Record<string, unknown>) ?? {},
    recording_url: (row.recording_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    team_call_id: (row.team_call_id as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    completed_by: (row.completed_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    template: {
      slug: template.slug,
      title: template.title,
      theme: template.theme,
      call_type: template.call_type,
      host_role: template.host_role,
      checklist: parseChecklist(template.checklist),
      disposition: Array.isArray(template.disposition)
        ? (template.disposition as DispositionFieldDef[])
        : [],
      agenda_md: template.agenda_md,
      duration_min: template.duration_min,
    },
  };
}

export function localYmdSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
