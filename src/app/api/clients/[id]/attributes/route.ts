import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';

const SELECT = 'id, client_id, attr_key, attr_value, created_at, updated_at, created_by, updated_by';

function normalizeKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim().toLowerCase().replace(/\s+/g, '_');
  return trimmed.length > 0 && trimmed.length <= 64 ? trimmed : null;
}

// GET /api/clients/[id]/attributes
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  const { data, error } = await ctx.service
    .from('client_attributes')
    .select(SELECT)
    .eq('client_id', id)
    .order('attr_key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attributes: data ?? [] });
}

// PUT /api/clients/[id]/attributes — upsert one key/value pair.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();
  const attrKey = normalizeKey(body.attr_key ?? body.key);
  if (!attrKey) {
    return NextResponse.json({ error: 'attr_key is required (max 64 chars)' }, { status: 400 });
  }
  if (!('attr_value' in body) && !('value' in body)) {
    return NextResponse.json({ error: 'attr_value is required' }, { status: 400 });
  }

  const attrValue = body.attr_value !== undefined ? body.attr_value : body.value;
  const now = new Date().toISOString();

  const { data, error } = await ctx.service
    .from('client_attributes')
    .upsert(
      {
        client_id: clientId,
        attr_key: attrKey,
        attr_value: attrValue,
        updated_at: now,
        updated_by: ctx.userId,
        created_by: ctx.userId,
      },
      { onConflict: 'client_id,attr_key' },
    )
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attribute: data });
}

// DELETE /api/clients/[id]/attributes?key=foo
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const attrKey = normalizeKey(new URL(req.url).searchParams.get('key'));
  if (!attrKey) {
    return NextResponse.json({ error: 'key query param is required' }, { status: 400 });
  }

  const { error } = await ctx.service
    .from('client_attributes')
    .delete()
    .eq('client_id', clientId)
    .eq('attr_key', attrKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
