import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  canAccessScope,
  listAccessibleScopes,
  runDataChat,
  type ChatMessage,
  type DataChatFilters,
  type DataChatScope,
} from '@/lib/ai/data-chat';

const SCOPES = new Set<DataChatScope>([
  'client_questions',
  'call_rep_questions',
  'client_success',
]);

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const scopes = listAccessibleScopes({
    isOwner: ctx.isOwner,
    allowedPermissions: ctx.allowedPermissions,
  });

  return NextResponse.json({
    scopes: scopes.map(s => ({
      id: s.id,
      label: s.label,
      description: s.description,
      usesClientFilter: s.usesClientFilter,
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as {
    scope?: unknown;
    messages?: unknown;
    filters?: {
      start_date?: unknown;
      end_date?: unknown;
      client_id?: unknown;
      live_only?: unknown;
    };
  };

  const scope = payload.scope;
  if (typeof scope !== 'string' || !SCOPES.has(scope as DataChatScope)) {
    return NextResponse.json(
      {
        error:
          'scope must be client_questions, call_rep_questions, or client_success',
      },
      { status: 400 },
    );
  }

  if (
    !canAccessScope(scope as DataChatScope, {
      isOwner: ctx.isOwner,
      allowedPermissions: ctx.allowedPermissions,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden for this data scope' }, { status: 403 });
  }

  const start_date = payload.filters?.start_date;
  const end_date = payload.filters?.end_date;
  if (!isIsoDate(start_date) || !isIsoDate(end_date)) {
    return NextResponse.json(
      { error: 'filters.start_date and filters.end_date (YYYY-MM-DD) are required' },
      { status: 400 },
    );
  }
  if (start_date > end_date) {
    return NextResponse.json({ error: 'start_date must be on or before end_date' }, { status: 400 });
  }

  const filters: DataChatFilters = {
    start_date,
    end_date,
    client_id:
      typeof payload.filters?.client_id === 'string' && payload.filters.client_id.trim()
        ? payload.filters.client_id.trim()
        : null,
    live_only: payload.filters?.live_only === true,
  };

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const messages: ChatMessage[] = [];
  for (const raw of payload.messages) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }
    const m = raw as { role?: unknown; content?: unknown };
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'Each message needs role and content' }, { status: 400 });
    }
    const content = m.content.trim();
    if (!content) continue;
    if (content.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
    }
    messages.push({ role: m.role, content });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: 'At least one non-empty message is required' }, { status: 400 });
  }
  if (messages.length > 24) {
    return NextResponse.json({ error: 'Too many messages (max 24)' }, { status: 400 });
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from the user' }, { status: 400 });
  }

  try {
    const result = await runDataChat({
      ctx,
      scope: scope as DataChatScope,
      filters,
      messages,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Data chat failed';
    const status = message.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
