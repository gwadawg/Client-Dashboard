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
  type ClosebotLogStatus,
} from "@/lib/closebot";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const LOG_SELECT =
  "id, agent_id, changed_at, prompt_body, problem_solved, change_reason, reference_urls, status, outcome_notes, created_by, updated_by, created_at, updated_at, agent:closebot_agents(id, name, slug, is_active)";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogView(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id");
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

  if (status && !isClosebotLogStatus(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  let query = ctx.service
    .from("closebot_prompt_log")
    .select(LOG_SELECT)
    .order("changed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentId) query = query.eq("agent_id", agentId);
  if (status) query = query.eq("status", status);
  if (from) {
    const fromIso = parseChangedAt(from);
    if (!fromIso) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    query = query.gte("changed_at", fromIso);
  }
  if (to) {
    // Inclusive end day: date-only means end of UTC day
    if (/^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
      query = query.lte("changed_at", `${to.trim()}T23:59:59.999Z`);
    } else {
      const toIso = parseChangedAt(to);
      if (!toIso) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
      query = query.lte("changed_at", toIso);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], offset, limit });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogWrite(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = cleanString(body.agent_id);
  if (!agentId) return NextResponse.json({ error: "agent_id is required" }, { status: 400 });

  const promptBody = cleanString(body.prompt_body);
  if (!promptBody) return NextResponse.json({ error: "prompt_body is required" }, { status: 400 });

  const problemSolved = cleanString(body.problem_solved);
  if (!problemSolved) {
    return NextResponse.json({ error: "problem_solved is required" }, { status: 400 });
  }

  const changeReason = cleanString(body.change_reason);
  if (!changeReason) {
    return NextResponse.json({ error: "change_reason is required" }, { status: 400 });
  }

  const changedAt = parseChangedAt(body.changed_at);
  if (!changedAt) {
    return NextResponse.json(
      { error: "changed_at is required (YYYY-MM-DD or ISO datetime)" },
      { status: 400 },
    );
  }

  const { urls, error: urlError } = cleanHttpUrls(body.reference_urls);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });

  let status: ClosebotLogStatus = "watching";
  if (body.status != null) {
    if (!isClosebotLogStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = body.status;
  }

  const outcomeNotes = cleanString(body.outcome_notes);

  const { data: agent, error: agentErr } = await ctx.service
    .from("closebot_agents")
    .select("id, is_active")
    .eq("id", agentId)
    .maybeSingle();

  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 400 });
  if (!agent.is_active) {
    return NextResponse.json({ error: "Cannot log against an archived agent" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from("closebot_prompt_log")
    .insert({
      agent_id: agentId,
      changed_at: changedAt,
      prompt_body: promptBody,
      problem_solved: problemSolved,
      change_reason: changeReason,
      reference_urls: urls,
      status,
      outcome_notes: outcomeNotes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      created_at: now,
      updated_at: now,
    })
    .select(LOG_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
