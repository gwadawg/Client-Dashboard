import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotAgentsRead,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  AGENT_LIST_SELECT,
  attachAssignedClients,
  attachPendingVersions,
  insertLiveVersion,
  parseAgentConfigFields,
  replaceAgentClients,
  resolvePersonaSnapshot,
} from "@/lib/closebot-store";
import {
  parseUuidList,
  slugifyClosebotName,
  uniqueClosebotSlug,
  type ClosebotAgent,
} from "@/lib/closebot";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotAgentsRead(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const activeOnly =
    url.searchParams.get("active") === "1" || url.searchParams.get("active") === "true";
  const withCounts =
    url.searchParams.get("counts") === "1" || url.searchParams.get("counts") === "true";

  let query = ctx.service
    .from("closebot_agents")
    .select(AGENT_LIST_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as unknown as ClosebotAgent[];

  const attached = await attachPendingVersions(ctx.service, rows);
  if (attached.error) return NextResponse.json({ error: attached.error }, { status: 500 });
  rows = attached.agents ?? rows;

  const withClients = await attachAssignedClients(ctx.service, rows);
  if (withClients.error) return NextResponse.json({ error: withClients.error }, { status: 500 });
  rows = withClients.agents ?? rows;

  if (withCounts && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: logRows, error: logErr } = await ctx.service
      .from("closebot_prompt_log")
      .select("agent_id")
      .in("agent_id", ids);
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });
    const counts = new Map<string, number>();
    for (const row of logRows ?? []) {
      const id = (row as { agent_id: string }).agent_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    rows = rows.map((r) => ({
      ...r,
      log_count: counts.get(r.id) ?? 0,
    }));

    const { data: ticketRows, error: ticketErr } = await ctx.service
      .from("closebot_tickets")
      .select("agent_id")
      .in("agent_id", ids)
      .in("status", ["new", "investigating", "ticket_open"]);
    if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });
    const ticketCounts = new Map<string, number>();
    for (const row of ticketRows ?? []) {
      const id = (row as { agent_id: string }).agent_id;
      ticketCounts.set(id, (ticketCounts.get(id) ?? 0) + 1);
    }
    rows = rows.map((r) => ({
      ...r,
      open_ticket_count: ticketCounts.get(r.id) ?? 0,
    }));
  }

  return NextResponse.json(rows);
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

  const parsed = parseAgentConfigFields(body, {
    name: "",
    description: null,
    job_information: null,
    persona_id: null,
    persona_snapshot: null,
    nodes: [],
    follow_ups: [],
  });
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const snapshot = parsed.snapshot!;
  if (!snapshot.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  if (snapshot.persona_id) {
    const resolved = await resolvePersonaSnapshot(ctx.service, snapshot.persona_id);
    if (resolved.error) {
      const status = resolved.error === "Persona not found" ? 400 : 500;
      return NextResponse.json({ error: resolved.error }, { status });
    }
    snapshot.persona_snapshot = resolved.snapshot;
  }

  const sortOrder =
    typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0;

  const baseSlug = slugifyClosebotName(
    typeof body.slug === "string" && body.slug.trim() ? body.slug : snapshot.name,
  );
  const slug = await uniqueClosebotSlug(async (candidate) => {
    const { data } = await ctx.service
      .from("closebot_agents")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    return Boolean(data);
  }, baseSlug);

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from("closebot_agents")
    .insert({
      name: snapshot.name,
      slug,
      description: snapshot.description,
      job_information: snapshot.job_information,
      persona_id: snapshot.persona_id,
      nodes: snapshot.nodes,
      follow_ups: snapshot.follow_ups,
      is_active: body.is_active === false ? false : true,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select(AGENT_LIST_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Could not create agent" }, { status: 500 });

  const live = await insertLiveVersion(ctx.service, data.id, snapshot, ctx.userId);
  if (live.error) return NextResponse.json({ error: live.error }, { status: 500 });

  if ("client_ids" in body) {
    const parsedIds = parseUuidList(body.client_ids);
    if (parsedIds.error || !parsedIds.ids) {
      return NextResponse.json({ error: parsedIds.error ?? "client_ids is invalid" }, { status: 400 });
    }
    const assigned = await replaceAgentClients(ctx.service, data.id, parsedIds.ids);
    if (assigned.error) {
      return NextResponse.json({ error: assigned.error }, { status: assigned.status ?? 500 });
    }
  }

  const withClients = await attachAssignedClients(ctx.service, [data as ClosebotAgent]);
  const agent = withClients.agents?.[0] ?? data;

  return NextResponse.json({ ...agent, pending_version: null }, { status: 201 });
}
