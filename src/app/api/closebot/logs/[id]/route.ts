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
  parseBugTypeSlugs,
  parseChangedAt,
} from "@/lib/closebot";
import {
  applyLogStatusToVersion,
  hydratePromptLog,
  LOG_SELECT,
  reclassifyOpenTicketsForAgent,
  replaceLogBugTypes,
  resolveVersionForLog,
} from "@/lib/closebot-store";

type Params = { params: Promise<{ id: string }> };

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
  return NextResponse.json(hydratePromptLog(data));
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
    .from("closebot_prompt_log")
    .select("id, agent_id, agent_version_id, status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Log not found" }, { status: 404 });

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

  const agentIdForVersion = (typeof patch.agent_id === "string" ? patch.agent_id : existing.agent_id) as string;
  if ("agent_version_id" in body || "attach_pending_version" in body) {
    const versionRes = await resolveVersionForLog(ctx.service, agentIdForVersion, body);
    if (versionRes.error) return NextResponse.json({ error: versionRes.error }, { status: 400 });
    patch.agent_version_id = versionRes.versionId;
  }

  let fixesBugTypes: string[] | null = null;
  if ("fixes_bug_types" in body) {
    const parsed = parseBugTypeSlugs(body.fixes_bug_types);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    fixesBugTypes = parsed.slugs ?? [];
  }

  if (Object.keys(patch).length <= 2 && fixesBugTypes == null) {
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

  if (fixesBugTypes) {
    const replaced = await replaceLogBugTypes(ctx.service, id, fixesBugTypes);
    if (replaced.error) {
      return NextResponse.json({ error: replaced.error }, { status: replaced.status ?? 500 });
    }
  }

  const versionId = (data.agent_version_id as string | null) ?? null;
  if ("status" in body && isClosebotLogStatus(data.status)) {
    const applied = await applyLogStatusToVersion(ctx.service, versionId, data.status);
    if (applied.error) return NextResponse.json({ error: applied.error }, { status: 500 });
  }

  const shouldReclassify =
    fixesBugTypes != null ||
    "status" in body ||
    "changed_at" in body ||
    "agent_id" in body;
  if (shouldReclassify) {
    const agentId = (typeof patch.agent_id === "string" ? patch.agent_id : existing.agent_id) as string;
    const reclass = await reclassifyOpenTicketsForAgent(ctx.service, agentId);
    if (reclass.error) return NextResponse.json({ error: reclass.error }, { status: 500 });
    if (typeof patch.agent_id === "string" && patch.agent_id !== existing.agent_id) {
      const previous = await reclassifyOpenTicketsForAgent(ctx.service, existing.agent_id);
      if (previous.error) return NextResponse.json({ error: previous.error }, { status: 500 });
    }
  }

  const { data: hydrated, error: reloadErr } = await ctx.service
    .from("closebot_prompt_log")
    .select(LOG_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (reloadErr) return NextResponse.json({ error: reloadErr.message }, { status: 500 });
  if (!hydrated) return NextResponse.json({ error: "Log not found" }, { status: 404 });
  return NextResponse.json(hydratePromptLog(hydrated));
}
