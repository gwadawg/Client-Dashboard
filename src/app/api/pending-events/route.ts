import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { clientNamesMatch } from '@/lib/client-name-match';
import {
  listPendingEventGroups,
  countPendingEvents,
  reconcilePendingEvents,
} from '@/lib/pending-events';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  try {
    // Opening the roster panel self-heals rows that already map (name / location /
    // prior contact activity) so mapped clients do not sit in "Unmapped" forever.
    const reconcile = await reconcilePendingEvents(ctx.service);

    const [groups, total] = await Promise.all([
      listPendingEventGroups(ctx.service),
      countPendingEvents(ctx.service),
    ]);
    const { data: clients } = await ctx.service.from('clients').select('id, name, ghl_location_id');
    const roster = clients ?? [];

    const groupsWithSuggestion = groups.map(g => {
      const matches = roster.filter(c => {
        if (c.ghl_location_id && g.ghl_location_id && c.ghl_location_id === g.ghl_location_id) {
          return true;
        }
        return clientNamesMatch(c.name, g.client_name);
      });
      return {
        ...g,
        suggested_client_id: matches.length === 1 ? matches[0]!.id : null,
      };
    });

    return NextResponse.json({
      total,
      groups: groupsWithSuggestion,
      clients: roster,
      reconcile,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
