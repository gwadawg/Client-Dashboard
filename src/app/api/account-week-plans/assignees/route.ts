import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requirePlanAccess } from '@/lib/account-week-plans-api';

/** Lightweight assignee list for week-plan forms (not admin /api/users). */
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePlanAccess(ctx);
  if (denied) return denied;

  const { data: linkedEmployees } = await ctx.service
    .from('agents')
    .select('id, name, user_id')
    .not('user_id', 'is', null)
    .order('name', { ascending: true });

  const { data: list, error } = await ctx.service.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    // Fallback: agent-linked users only
    const assignees = (linkedEmployees ?? [])
      .filter(e => e.user_id)
      .map(e => ({
        id: e.user_id as string,
        name: e.name as string,
        email: null as string | null,
      }));
    return NextResponse.json({ assignees });
  }

  const nameByUserId = new Map(
    (linkedEmployees ?? [])
      .filter(e => e.user_id)
      .map(e => [e.user_id as string, e.name as string]),
  );

  const assignees = (list.users ?? []).map(u => {
    const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
    const fromMeta = meta?.full_name || meta?.name || null;
    const fromAgent = nameByUserId.get(u.id) ?? null;
    const email = u.email ?? null;
    const name =
      fromAgent ||
      fromMeta ||
      (email ? email.split('@')[0] : u.id.slice(0, 8));
    return { id: u.id, name, email };
  });

  assignees.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ assignees });
}
