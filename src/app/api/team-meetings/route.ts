import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { addDaysToYmd, todayYmdInCallCenterTz, type TeamMeetingInstanceView } from '@/lib/team-meetings';
import {
  ensureInstances,
  ensureTemplates,
  localYmdSaoPaulo,
  mapInstanceView,
  INSTANCE_FIELDS,
} from '@/lib/team-meetings-db';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const today = todayYmdInCallCenterTz();
  const fromYmd = searchParams.get('from')?.trim() || today;
  const toYmd = searchParams.get('to')?.trim() || addDaysToYmd(today, 13);

  try {
    const templates = await ensureTemplates(ctx.service);
    await ensureInstances(ctx.service, templates, fromYmd, toYmd);

    const byId = new Map(templates.map(t => [t.id, t]));

    const { data, error } = await ctx.service
      .from('team_meeting_instances')
      .select(INSTANCE_FIELDS)
      .gte('scheduled_at', `${addDaysToYmd(fromYmd, -1)}T00:00:00.000Z`)
      .lte('scheduled_at', `${addDaysToYmd(toYmd, 1)}T23:59:59.999Z`)
      .order('scheduled_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows: TeamMeetingInstanceView[] = [];
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const template = byId.get(r.template_id as string);
      if (!template) continue;
      const localDay = localYmdSaoPaulo(r.scheduled_at as string);
      if (localDay < fromYmd || localDay > toYmd) continue;
      rows.push(mapInstanceView(r, template));
    }

    return NextResponse.json({
      rows,
      from: fromYmd,
      to: toYmd,
      timezone: 'America/Sao_Paulo',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load meetings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
