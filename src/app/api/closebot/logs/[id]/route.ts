import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotLogView,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  cleanHttpUrls,
  cleanString,
  isClosebotLogStatus,
  parseChangedAt,
} from "@/lib/closebot";

type Params = { params: Promise<{ id: string }> };

const LOG_SELECT =
  "id, agent_id, changed_at, prompt_body, problem_solved, change_reason, reference_urls, status, outcome_notes, created_by, updated_by, created_at, updated_at, agent:closebot_agents(id, name, slug, is_active)";

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogView(ctx);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await ctx.service
    .from("closebot_prompt_log")
    .select(LOG_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Log not found" }, { status: 404 });
  return NextResponse.json(data);
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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  if ("agent_id" in body) {
    const agentId = cleanString(body.agent_id);
    if (!agentId) return NextResponse.json({ error: "agent_id cannot be empty" }, { status: 400 });
    const { data: agent, error: agentErr } = await ctx.service
      .from("closebot_agents")
      .select("id")
      .eq("id", agentId)
      .maybeSingle();
    if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 400 });
    // Allow reassignment to archived agents only for historical edits — agent must exist.
    patch.agent_id = agentId;
  }

  if ("prompt_body" in body) {
    const promptBody = cleanString(body.prompt_body);
    if (!promptBody) {
      return NextResponse.json({ error: "prompt_body cannot be empty" }, { status: 400 });
    }
    patch.prompt_body = promptBody;
  }

  if ("problem_solved" in body) {
    const v = cleanString(body.problem_solved);
    if (!v) return NextResponse.json({ error: "problem_solved cannot be empty" }, { status: 400 });
    patch.problem_solved = v;
  }

  if ("change_reason" in body) {
    const v = cleanString(body.change_reason);
    if (!v) return NextResponse.json({ error: "change_reason cannot be empty" }, { status: 400 });
    patch.change_reason = v;
  }

  if ("changed_at" in body) {
    const changedAt = parseChangedAt(body.changed_at);
    if (!changedAt) {
      return NextResponse.json({ error: "Invalid changed_at" }, { status: 400 });
    }
    patch.changed_at = changedAt;
  }

  if ("reference_urls" in body) {
    const { urls, error: urlError } = cleanHttpUrls(body.reference_urls);
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
    patch.reference_urls = urls;
  }

  if ("status" in body) {
    if (!isClosebotLogStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if ("outcome_notes" in body) {
    patch.outcome_notes =
      body.outcome_notes === null || body.outcome_notes === ""
        ? null
        : cleanString(body.outcome_notes);
  }

  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from("closebot_prompt_log")
    .update(patch)
    .eq("id", id)
    .select(LOG_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Log not found" }, { status: 404 });
  return NextResponse.json(data);
}
