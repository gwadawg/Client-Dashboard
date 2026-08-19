import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotAgentsRead,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  AGENT_LIST_SELECT,
  agentConfigKeysPresent,
  parseAgentConfigFields,
  resolvePersonaSnapshot,
  upsertPendingVersion,
} from "@/lib/closebot-store";
import { snapshotFromAgent, type ClosebotAgent } from "@/lib/closebot";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotAgentsRead(ctx);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await ctx.service
    .from("closebot_agents")
    .select(AGENT_LIST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: pending } = await ctx.service
    .from("closebot_agent_versions")
    .select("*")
    .eq("agent_id", id)
    .eq("status", "pending")
    .maybeSingle();

  return NextResponse.json({ ...data, pending_version: pending ?? null });
}

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogWrite(ctx);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await ctx.service
    .from("closebot_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const livePatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
    }
    livePatch.is_active = body.is_active;
  }

  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return NextResponse.json({ error: "sort_order must be a number" }, { status: 400 });
    }
    livePatch.sort_order = Math.trunc(body.sort_order);
  }

  const wantsConfig = agentConfigKeysPresent(body);
  if (!wantsConfig && Object.keys(livePatch).length <= 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (wantsConfig) {
    const { data: pendingRow } = await ctx.service
      .from("closebot_agent_versions")
      .select("*")
      .eq("agent_id", id)
      .eq("status", "pending")
      .maybeSingle();

    const baseAgent = (pendingRow ?? existing) as ClosebotAgent;
    const base = snapshotFromAgent(baseAgent, pendingRow?.persona_snapshot ?? null);
    const parsed = parseAgentConfigFields(body, base);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const snapshot = parsed.snapshot!;

    if ("persona_id" in body) {
      const resolved = await resolvePersonaSnapshot(ctx.service, snapshot.persona_id);
      if (resolved.error) {
        const status = resolved.error === "Persona not found" ? 400 : 500;
        return NextResponse.json({ error: resolved.error }, { status });
      }
      snapshot.persona_snapshot = resolved.snapshot;
    } else if (snapshot.persona_id && !snapshot.persona_snapshot) {
      const resolved = await resolvePersonaSnapshot(ctx.service, snapshot.persona_id);
      if (resolved.error && resolved.error !== "Persona not found") {
        return NextResponse.json({ error: resolved.error }, { status: 500 });
      }
      snapshot.persona_snapshot = resolved.snapshot;
    }

    const pending = await upsertPendingVersion(ctx.service, id, snapshot, ctx.userId);
    if (pending.error) return NextResponse.json({ error: pending.error }, { status: 500 });

    if (Object.keys(livePatch).length > 1) {
      const { error } = await ctx.service.from("closebot_agents").update(livePatch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data, error } = await ctx.service
      .from("closebot_agents")
      .select(AGENT_LIST_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, pending_version: pending.version ?? null });
  }

  const { data, error } = await ctx.service
    .from("closebot_agents")
    .update(livePatch)
    .eq("id", id)
    .select(AGENT_LIST_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(data);
}
