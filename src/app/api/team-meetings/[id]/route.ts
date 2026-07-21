import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { parseChecklist, validateCompletePayload } from '@/lib/team-meetings';
import {
  ensureTemplates,
  mapInstanceView,
  INSTANCE_FIELDS,
  TEMPLATE_FIELDS,
  type TemplateDb,
} from '@/lib/team-meetings-db';
import { isValidTeamCallType } from '@/lib/team-calls';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const { id } = await routeCtx.params;

  const { data: row, error } = await ctx.service
    .from('team_meeting_instances')
    .select(INSTANCE_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: template, error: tErr } = await ctx.service
    .from('team_meeting_templates')
    .select(TEMPLATE_FIELDS)
    .eq('id', (row as { template_id: string }).template_id)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!template) return NextResponse.json({ error: 'Template missing' }, { status: 404 });

  return NextResponse.json({
    row: mapInstanceView(row as Record<string, unknown>, template as TemplateDb),
  });
}

export async function PATCH(req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await ctx.service
    .from('team_meeting_instances')
    .select(INSTANCE_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = (existing as { status: string }).status;
  if (status === 'completed' || status === 'cancelled') {
    return NextResponse.json({ error: `Cannot edit ${status} meeting` }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.checklist_state && typeof body.checklist_state === 'object') {
    patch.checklist_state = body.checklist_state;
  }
  if (body.responses && typeof body.responses === 'object') {
    patch.responses = {
      ...((existing as { responses?: Record<string, unknown> }).responses ?? {}),
      ...(body.responses as Record<string, unknown>),
    };
  }
  if (typeof body.notes === 'string') patch.notes = body.notes;
  if (typeof body.recording_url === 'string') {
    patch.recording_url = optionalText(body.recording_url);
  }

  if (status === 'scheduled' || body.status === 'in_progress') {
    patch.status = 'in_progress';
  }

  const { data: updated, error } = await ctx.service
    .from('team_meeting_instances')
    .update(patch)
    .eq('id', id)
    .select(INSTANCE_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: template } = await ctx.service
    .from('team_meeting_templates')
    .select(TEMPLATE_FIELDS)
    .eq('id', (updated as { template_id: string }).template_id)
    .maybeSingle();

  if (!template) return NextResponse.json({ error: 'Template missing' }, { status: 404 });

  return NextResponse.json({
    row: mapInstanceView(updated as Record<string, unknown>, template as TemplateDb),
  });
}

export async function POST(req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action === 'skip' ? 'skip' : 'complete';
  const nextStatus = action === 'skip' ? 'skipped' : 'completed';

  await ensureTemplates(ctx.service);

  const { data: existing, error: loadErr } = await ctx.service
    .from('team_meeting_instances')
    .select(INSTANCE_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ex = existing as {
    status: string;
    team_call_id: string | null;
    template_id: string;
    scheduled_at: string;
    checklist_state: Record<string, boolean>;
    responses: Record<string, unknown>;
    recording_url: string | null;
  };

  if (ex.status === 'completed' && ex.team_call_id) {
    const { data: template } = await ctx.service
      .from('team_meeting_templates')
      .select(TEMPLATE_FIELDS)
      .eq('id', ex.template_id)
      .maybeSingle();
    if (!template) return NextResponse.json({ error: 'Template missing' }, { status: 404 });
    return NextResponse.json({
      row: mapInstanceView(existing as Record<string, unknown>, template as TemplateDb),
      idempotent: true,
    });
  }

  if (ex.status === 'cancelled') {
    return NextResponse.json({ error: 'Meeting cancelled' }, { status: 400 });
  }

  const { data: template, error: tErr } = await ctx.service
    .from('team_meeting_templates')
    .select(TEMPLATE_FIELDS)
    .eq('id', ex.template_id)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!template) return NextResponse.json({ error: 'Template missing' }, { status: 404 });

  const checklist = parseChecklist((template as TemplateDb).checklist);
  const checklist_state =
    (body.checklist_state as Record<string, unknown>) ?? ex.checklist_state ?? {};
  const responses = {
    ...(ex.responses ?? {}),
    ...((body.responses as Record<string, unknown>) ?? {}),
  };
  const recording_url =
    optionalText(body.recording_url) ??
    optionalText(responses.recording_url) ??
    ex.recording_url;

  const validation = validateCompletePayload({
    status: nextStatus,
    checklist,
    checklist_state,
    responses,
    recording_url,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, missing: validation.missing },
      { status: 400 },
    );
  }

  let teamCallId = ex.team_call_id;

  if (nextStatus === 'completed') {
    const callType = (template as TemplateDb).call_type;
    if (!isValidTeamCallType(callType)) {
      return NextResponse.json({ error: 'Invalid template call_type' }, { status: 500 });
    }

    const tags = ['runbook', (template as TemplateDb).slug];
    const insert = {
      title: (template as TemplateDb).title,
      call_type: callType,
      called_at: ex.scheduled_at,
      participants: optionalText(responses.participants_present),
      recording_url,
      summary: optionalText(responses.summary),
      tags,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    };

    if (teamCallId) {
      const { error: updErr } = await ctx.service
        .from('team_calls')
        .update(insert)
        .eq('id', teamCallId);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    } else {
      const { data: created, error: createErr } = await ctx.service
        .from('team_calls')
        .insert(insert)
        .select('id')
        .single();
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
      teamCallId = (created as { id: string }).id;
    }
  }

  const { data: updated, error: updInstErr } = await ctx.service
    .from('team_meeting_instances')
    .update({
      status: nextStatus,
      checklist_state,
      responses,
      recording_url: nextStatus === 'skipped' ? null : recording_url,
      team_call_id: teamCallId,
      completed_at: new Date().toISOString(),
      completed_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(INSTANCE_FIELDS)
    .single();

  if (updInstErr) return NextResponse.json({ error: updInstErr.message }, { status: 500 });

  return NextResponse.json({
    row: mapInstanceView(updated as Record<string, unknown>, template as TemplateDb),
  });
}
