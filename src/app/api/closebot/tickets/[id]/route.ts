import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotLogView,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  cleanHttpUrl,
  cleanString,
  cleanUuid,
  isClosebotTicketCoverage,
  isClosebotTicketStatus,
  parseChangedAt,
} from "@/lib/closebot";
import {
  addLogBugType,
  assertBugTypeSlug,
  assertVersionBelongsToAgent,
  classifyTicketCoverage,
  reclassifyOpenTicketsForAgent,
  resolveAgentForClient,
  resolveVersionAt,
  TICKET_SELECT,
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
    .from("closebot_tickets")
    .select(TICKET_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
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

  const { data: existing, error: loadErr } = await ctx.service
    .from("closebot_tickets")
    .select("id, agent_id, occurred_at, agent_version_id, bug_type, prompt_log_id, status, coverage, coverage_manual")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("reporter_name" in body) {
    const name = cleanString(body.reporter_name);
    if (!name) return NextResponse.json({ error: "reporter_name cannot be empty" }, { status: 400 });
    patch.reporter_name = name;
  }

  if ("description" in body) {
    const description = cleanString(body.description);
    if (!description) {
      return NextResponse.json({ error: "description cannot be empty" }, { status: 400 });
    }
    patch.description = description;
  }

  if ("bug_type" in body) {
    if (body.bug_type === null || body.bug_type === "") {
      patch.bug_type = null;
    } else {
      const slug = typeof body.bug_type === "string" ? body.bug_type.trim() : "";
      const checked = await assertBugTypeSlug(ctx.service, slug);
      if (checked.error) {
        return NextResponse.json({ error: checked.error }, { status: checked.status ?? 400 });
      }
      patch.bug_type = slug;
    }
  }

  if ("contact_url" in body) {
    const contact = cleanHttpUrl(body.contact_url);
    if (contact.error || !contact.url) {
      return NextResponse.json({ error: contact.error ?? "contact_url is required" }, { status: 400 });
    }
    patch.contact_url = contact.url;
  }

  if ("status" in body) {
    if (!isClosebotTicketStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if ("coverage" in body) {
    if (!isClosebotTicketCoverage(body.coverage)) {
      return NextResponse.json({ error: "Invalid coverage" }, { status: 400 });
    }
    patch.coverage = body.coverage;
    patch.coverage_manual = true;
    if (body.coverage === "actionable") {
      patch.covered_by_log_id = null;
    }
  }

  if ("covered_by_log_id" in body && !("coverage" in body && body.coverage === "actionable")) {
    if (body.covered_by_log_id === null || body.covered_by_log_id === "") {
      patch.covered_by_log_id = null;
    } else {
      const logId = cleanUuid(body.covered_by_log_id);
      if (!logId) {
        return NextResponse.json({ error: "covered_by_log_id must be a valid id" }, { status: 400 });
      }
      patch.covered_by_log_id = logId;
    }
  }

  if ("status_notes" in body) {
    patch.status_notes =
      body.status_notes === null || body.status_notes === ""
        ? null
        : cleanString(body.status_notes);
  }

  if ("client_id" in body) {
    const clientId = cleanUuid(body.client_id);
    if (!clientId) return NextResponse.json({ error: "client_id cannot be empty" }, { status: 400 });
    const { data: client, error: clientErr } = await ctx.service
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 400 });
    patch.client_id = clientId;
    const mapped = await resolveAgentForClient(ctx.service, clientId);
    if (mapped.error || !mapped.agentId) {
      return NextResponse.json({ error: mapped.error ?? "Could not resolve agent" }, { status: mapped.status ?? 400 });
    }
    patch.agent_id = mapped.agentId;
  }

  if ("agent_id" in body) {
    const agentId = cleanUuid(body.agent_id);
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

  if ("occurred_at" in body) {
    const occurredAt = parseChangedAt(body.occurred_at);
    if (!occurredAt) return NextResponse.json({ error: "Invalid occurred_at" }, { status: 400 });
    patch.occurred_at = occurredAt;
  }

  if ("prompt_log_id" in body) {
    if (body.prompt_log_id === null || body.prompt_log_id === "") {
      patch.prompt_log_id = null;
    } else {
      const logId = cleanUuid(body.prompt_log_id);
      if (!logId) {
        return NextResponse.json({ error: "prompt_log_id must be a valid id" }, { status: 400 });
      }
      const agentId = (typeof patch.agent_id === "string" ? patch.agent_id : existing.agent_id) as string;
      const { data: log, error: logErr } = await ctx.service
        .from("closebot_prompt_log")
        .select("id, agent_id")
        .eq("id", logId)
        .maybeSingle();
      if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });
      if (!log) return NextResponse.json({ error: "Prompt log not found" }, { status: 400 });
      if (log.agent_id !== agentId) {
        return NextResponse.json(
          { error: "Prompt log does not belong to this agent" },
          { status: 400 },
        );
      }
      patch.prompt_log_id = logId;
    }
  }

  const agentId = (typeof patch.agent_id === "string" ? patch.agent_id : existing.agent_id) as string;
  const occurredAt = (typeof patch.occurred_at === "string" ? patch.occurred_at : existing.occurred_at) as string;

  if ("agent_version_id" in body) {
    if (body.agent_version_id === null || body.agent_version_id === "") {
      patch.agent_version_id = null;
    } else {
      const versionId = cleanUuid(body.agent_version_id);
      if (!versionId) {
        return NextResponse.json({ error: "agent_version_id must be a valid id" }, { status: 400 });
      }
      const owned = await assertVersionBelongsToAgent(ctx.service, agentId, versionId);
      if (owned.error) return NextResponse.json({ error: owned.error }, { status: 400 });
      patch.agent_version_id = versionId;
    }
  } else if ("agent_id" in body || "occurred_at" in body || "client_id" in body) {
    const resolved = await resolveVersionAt(ctx.service, agentId, occurredAt);
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: 500 });
    patch.agent_version_id = resolved.versionId;
  }

  const nextBugType = (
    "bug_type" in patch ? (patch.bug_type as string | null) : existing.bug_type
  ) as string | null;
  const shouldReclassify =
    !("coverage" in patch) &&
    ("occurred_at" in patch || "bug_type" in patch || "agent_id" in patch || "client_id" in patch);

  if (shouldReclassify && !existing.coverage_manual) {
    const classified = await classifyTicketCoverage(ctx.service, {
      agentId,
      bugType: nextBugType,
      occurredAt,
    });
    if (classified.error) return NextResponse.json({ error: classified.error }, { status: 500 });
    patch.coverage = classified.coverage;
    patch.covered_by_log_id = classified.coveredByLogId;
  }

  const nextPromptLogId = (
    "prompt_log_id" in patch ? (patch.prompt_log_id as string | null) : existing.prompt_log_id
  ) as string | null;
  const nextStatus = ("status" in patch ? patch.status : existing.status) as string;
  if (
    nextPromptLogId &&
    nextBugType &&
    nextStatus === "resolved_updated_agent"
  ) {
    const added = await addLogBugType(ctx.service, nextPromptLogId, nextBugType);
    if (added.error) {
      return NextResponse.json({ error: added.error }, { status: added.status ?? 500 });
    }
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from("closebot_tickets")
    .update(patch)
    .eq("id", id)
    .select(TICKET_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (nextPromptLogId && nextBugType && nextStatus === "resolved_updated_agent") {
    const reclass = await reclassifyOpenTicketsForAgent(ctx.service, agentId);
    if (reclass.error) return NextResponse.json({ error: reclass.error }, { status: 500 });
  }

  return NextResponse.json(data);
}
