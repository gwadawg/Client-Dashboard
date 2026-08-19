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
  return NextResponse.json({ versions: data ?? [] });
}
