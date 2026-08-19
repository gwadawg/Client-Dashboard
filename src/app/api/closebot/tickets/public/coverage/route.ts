import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isClosebotBugTypeSlug, parseChangedAt } from "@/lib/closebot";
import { classifyTicketCoverage, resolveAgentForClient } from "@/lib/closebot-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id")?.trim() || "";
  const bugType = url.searchParams.get("bug_type")?.trim() || "";
  const occurredRaw = url.searchParams.get("occurred_at")?.trim() || "";

  if (!clientId) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  if (!bugType || !isClosebotBugTypeSlug(bugType)) {
    return NextResponse.json({ coverage: "actionable", covering_fix: null });
  }
  const occurredAt = parseChangedAt(occurredRaw);
  if (!occurredAt) return NextResponse.json({ error: "occurred_at is required" }, { status: 400 });

  const db = createServiceClient();
  const mapped = await resolveAgentForClient(db, clientId);
  if (mapped.error || !mapped.agentId) {
    return NextResponse.json({ error: mapped.error ?? "Could not resolve agent" }, { status: mapped.status ?? 400 });
  }

  const classified = await classifyTicketCoverage(db, {
    agentId: mapped.agentId,
    bugType,
    occurredAt,
  });
  if (classified.error) return NextResponse.json({ error: classified.error }, { status: 500 });

  if (classified.coverage !== "pre_fix" || !classified.coveredByLogId) {
    return NextResponse.json({ coverage: "actionable", covering_fix: null });
  }

  const { data: log, error } = await db
    .from("closebot_prompt_log")
    .select("id, changed_at, problem_solved")
    .eq("id", classified.coveredByLogId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    coverage: "pre_fix",
    covering_fix: log
      ? { id: log.id, changed_at: log.changed_at, problem_solved: log.problem_solved }
      : null,
  });
}
