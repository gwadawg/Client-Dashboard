import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { mergeClients } from '@/lib/client-merge';

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_clients');
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const source_id = typeof body.source_id === 'string' ? body.source_id.trim() : '';
  const target_id = typeof body.target_id === 'string' ? body.target_id.trim() : '';
  if (!source_id || !target_id) {
    return NextResponse.json({ error: 'source_id and target_id are required' }, { status: 400 });
  }

  try {
    const result = await mergeClients(ctx.service, source_id, target_id);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
