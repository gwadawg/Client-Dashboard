import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import { requireClosebotAgentsRead } from "@/lib/closebot-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotAgentsRead(ctx);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: agent, error: agentErr } = await ctx.service
    .from("closebot_agents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data, error } = await ctx.service
    .from("closebot_agent_versions")
    .select("*")
    .eq("agent_id", id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const versions = (data ?? []) as { id: string }[];
  const versionIds = versions.map((v) => v.id);
  const counts = new Map<string, { open: number; resolved: number }>();
  if (versionIds.length > 0) {
    const { data: tickets, error: ticketErr } = await ctx.service
      .from("closebot_tickets")
      .select("agent_version_id, status")
      .eq("agent_id", id);
    if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });
    for (const row of tickets ?? []) {
      const vid = (row as { agent_version_id: string | null }).agent_version_id;
      if (!vid) continue;
      const status = (row as { status: string }).status;
      const current = counts.get(vid) ?? { open: 0, resolved: 0 };
      if (status === "new" || status === "investigating" || status === "ticket_open") {
        current.open += 1;
      } else {
        current.resolved += 1;
      }
      counts.set(vid, current);
    }
  }

  return NextResponse.json({
    versions: versions.map((v) => {
      const c = counts.get(v.id) ?? { open: 0, resolved: 0 };
      return { ...v, open_ticket_count: c.open, resolved_ticket_count: c.resolved };
    }),
  });
}
