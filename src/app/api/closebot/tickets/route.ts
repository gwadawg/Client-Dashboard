import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotLogView,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  CLOSEBOT_OPEN_TICKET_STATUSES,
  isClosebotBugTypeSlug,
  isClosebotTicketStatus,
  parseChangedAt,
} from "@/lib/closebot";
import { createClosebotTicket, TICKET_SELECT } from "@/lib/closebot-store";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogView(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id");
  const clientId = url.searchParams.get("client_id");
  const versionId = url.searchParams.get("agent_version_id");
  const status = url.searchParams.get("status");
  const openOnly = url.searchParams.get("open") === "1";
  const bugType = url.searchParams.get("bug_type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

  if (status && !isClosebotTicketStatus(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  if (bugType && bugType !== "none" && !isClosebotBugTypeSlug(bugType)) {
    return NextResponse.json({ error: "Invalid bug_type filter" }, { status: 400 });
  }

  let query = ctx.service
    .from("closebot_tickets")
    .select(TICKET_SELECT)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentId) query = query.eq("agent_id", agentId);
  if (clientId) query = query.eq("client_id", clientId);
  if (versionId === "none") query = query.is("agent_version_id", null);
  else if (versionId) query = query.eq("agent_version_id", versionId);
  if (status) query = query.eq("status", status);
  else if (openOnly) query = query.in("status", [...CLOSEBOT_OPEN_TICKET_STATUSES]);
  if (bugType === "none") query = query.is("bug_type", null);
  else if (bugType) query = query.eq("bug_type", bugType);
  if (from) {
    const fromIso = parseChangedAt(from);
    if (!fromIso) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    query = query.gte("occurred_at", fromIso);
  }
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
      query = query.lte("occurred_at", `${to.trim()}T23:59:59.999Z`);
    } else {
      const toIso = parseChangedAt(to);
      if (!toIso) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
      query = query.lte("occurred_at", toIso);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tickets: data ?? [], offset, limit });
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

  const created = await createClosebotTicket(ctx.service, body, {
    defaultStatus: "new",
    allowStatus: true,
  });
  if (created.error) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }
  return NextResponse.json(created.ticket, { status: 201 });
}
