import {
  cleanHttpUrl,
  cleanString,
  cleanUuid,
  isClosebotBugType,
  isClosebotTicketStatus,
  parseAgentNodes,
  parseChangedAt,
  parseFollowUps,
  personaToSnapshot,
  type AgentConfigSnapshot,
  type ClosebotAgent,
  type ClosebotAgentVersion,
  type ClosebotLogStatus,
  type ClosebotPersona,
  type ClosebotPersonaSnapshot,
  type ClosebotTicketStatus,
  pickVersionAt,
} from "@/lib/closebot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClosebotDb = { from: (t: string) => any };

export const AGENT_LIST_SELECT =
  "id, name, slug, description, job_information, persona_id, nodes, follow_ups, is_active, sort_order, created_at, updated_at, persona:closebot_personas(id, name, slug, is_active)";

export const LOG_SELECT =
  "id, agent_id, agent_version_id, changed_at, prompt_body, problem_solved, change_reason, reference_urls, status, outcome_notes, created_by, updated_by, created_at, updated_at, agent:closebot_agents(id, name, slug, is_active)";

export const TICKET_SELECT =
  "id, occurred_at, bug_type, description, contact_url, client_id, agent_id, agent_version_id, status, reporter_name, prompt_log_id, status_notes, created_at, updated_at, client:clients(id, name), agent:closebot_agents(id, name, slug, is_active), agent_version:closebot_agent_versions(id, status, name, went_live_at, superseded_at)";

const PERSONA_SELECT =
  "id, name, slug, description, how_to_respond, tone, custom_delay_enabled, typo_frequency, custom_delay_seconds, is_active, sort_order, created_at, updated_at";

export function parseAgentConfigFields(
  body: Record<string, unknown>,
  base: AgentConfigSnapshot,
): { snapshot?: AgentConfigSnapshot; error?: string } {
  const next: AgentConfigSnapshot = { ...base };

  if ("name" in body) {
    const name = cleanString(body.name);
    if (!name) return { error: "name cannot be empty" };
    next.name = name;
  }

  if ("description" in body) {
    next.description =
      body.description === null || body.description === ""
        ? null
        : cleanString(body.description);
  }

  if ("job_information" in body) {
    next.job_information =
      body.job_information === null || body.job_information === ""
        ? null
        : cleanString(body.job_information);
  }

  if ("persona_id" in body) {
    if (body.persona_id === null || body.persona_id === "") {
      next.persona_id = null;
      next.persona_snapshot = null;
    } else {
      const id = cleanUuid(body.persona_id);
      if (!id) return { error: "persona_id must be a valid id" };
      next.persona_id = id;
    }
  }

  if ("nodes" in body) {
    const parsed = parseAgentNodes(body.nodes);
    if (parsed.error) return { error: parsed.error };
    next.nodes = parsed.nodes;
  }

  if ("follow_ups" in body) {
    const parsed = parseFollowUps(body.follow_ups);
    if (parsed.error) return { error: parsed.error };
    next.follow_ups = parsed.followUps;
  }

  return { snapshot: next };
}

export function agentConfigKeysPresent(body: Record<string, unknown>): boolean {
  return (
    "name" in body ||
    "description" in body ||
    "job_information" in body ||
    "persona_id" in body ||
    "nodes" in body ||
    "follow_ups" in body
  );
}

export async function fetchPersona(
  db: ClosebotDb,
  id: string,
): Promise<{ persona: ClosebotPersona | null; error?: string }> {
  const { data, error } = await db
    .from("closebot_personas")
    .select(PERSONA_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return { persona: null, error: error.message };
  return { persona: (data as ClosebotPersona | null) ?? null };
}

export async function resolvePersonaSnapshot(
  db: ClosebotDb,
  personaId: string | null,
): Promise<{ snapshot: ClosebotPersonaSnapshot | null; error?: string }> {
  if (!personaId) return { snapshot: null };
  const { persona, error } = await fetchPersona(db, personaId);
  if (error) return { snapshot: null, error };
  if (!persona) return { snapshot: null, error: "Persona not found" };
  return { snapshot: personaToSnapshot(persona) };
}

export function versionRowFromSnapshot(
  agentId: string,
  status: "pending" | "live",
  snapshot: AgentConfigSnapshot,
  userId: string | null,
  now: string,
): Record<string, unknown> {
  return {
    agent_id: agentId,
    status,
    name: snapshot.name,
    description: snapshot.description,
    job_information: snapshot.job_information,
    persona_id: snapshot.persona_id,
    persona_snapshot: snapshot.persona_snapshot,
    nodes: snapshot.nodes,
    follow_ups: snapshot.follow_ups,
    created_by: userId,
    updated_at: now,
    went_live_at: status === "live" ? now : null,
    superseded_at: null,
  };
}

export async function insertLiveVersion(
  db: ClosebotDb,
  agentId: string,
  snapshot: AgentConfigSnapshot,
  userId: string | null,
): Promise<{ version?: ClosebotAgentVersion; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("closebot_agent_versions")
    .insert({
      ...versionRowFromSnapshot(agentId, "live", snapshot, userId, now),
      created_at: now,
    })
    .select("*")
    .maybeSingle();
  if (error) return { error: error.message };
  return { version: data as ClosebotAgentVersion };
}

export async function upsertPendingVersion(
  db: ClosebotDb,
  agentId: string,
  snapshot: AgentConfigSnapshot,
  userId: string | null,
): Promise<{ version?: ClosebotAgentVersion; error?: string }> {
  const now = new Date().toISOString();
  const { data: existing, error: findErr } = await db
    .from("closebot_agent_versions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .maybeSingle();
  if (findErr) return { error: findErr.message };

  if (existing?.id) {
    const { data, error } = await db
      .from("closebot_agent_versions")
      .update({
        name: snapshot.name,
        description: snapshot.description,
        job_information: snapshot.job_information,
        persona_id: snapshot.persona_id,
        persona_snapshot: snapshot.persona_snapshot,
        nodes: snapshot.nodes,
        follow_ups: snapshot.follow_ups,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) return { error: error.message };
    return { version: data as ClosebotAgentVersion };
  }

  const { data, error } = await db
    .from("closebot_agent_versions")
    .insert({
      ...versionRowFromSnapshot(agentId, "pending", snapshot, userId, now),
      created_at: now,
    })
    .select("*")
    .maybeSingle();
  if (error) return { error: error.message };
  return { version: data as ClosebotAgentVersion };
}

export async function fetchPendingVersion(
  db: ClosebotDb,
  agentId: string,
): Promise<{ version: ClosebotAgentVersion | null; error?: string }> {
  const { data, error } = await db
    .from("closebot_agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { version: null, error: error.message };
  return { version: (data as ClosebotAgentVersion | null) ?? null };
}

export async function attachPendingVersions(
  db: ClosebotDb,
  agents: ClosebotAgent[],
): Promise<{ agents?: ClosebotAgent[]; error?: string }> {
  if (agents.length === 0) return { agents };
  const ids = agents.map((a) => a.id);
  const { data, error } = await db
    .from("closebot_agent_versions")
    .select("*")
    .eq("status", "pending")
    .in("agent_id", ids);
  if (error) return { error: error.message };
  const byAgent = new Map<string, ClosebotAgentVersion>();
  for (const row of (data ?? []) as ClosebotAgentVersion[]) {
    byAgent.set(row.agent_id, row);
  }
  return {
    agents: agents.map((a) => ({
      ...a,
      pending_version: byAgent.get(a.id) ?? null,
    })),
  };
}

export async function applyLogStatusToVersion(
  db: ClosebotDb,
  versionId: string | null,
  status: ClosebotLogStatus,
): Promise<{ error?: string }> {
  if (!versionId) return {};

  const { data: version, error: vErr } = await db
    .from("closebot_agent_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (vErr) return { error: vErr.message };
  if (!version) return { error: "Agent version not found" };

  const now = new Date().toISOString();

  if (status === "worked") {
    if (version.status === "live" || version.status === "superseded") return {};
    if (version.status === "rejected") {
      return { error: "Cannot promote a rejected agent version" };
    }

    const { error: superErr } = await db
      .from("closebot_agent_versions")
      .update({ status: "superseded", superseded_at: now, updated_at: now })
      .eq("agent_id", version.agent_id)
      .eq("status", "live")
      .neq("id", version.id);
    if (superErr) return { error: superErr.message };

    const { error: agentErr } = await db
      .from("closebot_agents")
      .update({
        name: version.name,
        description: version.description,
        job_information: version.job_information,
        persona_id: version.persona_id,
        nodes: version.nodes,
        follow_ups: version.follow_ups,
        updated_at: now,
      })
      .eq("id", version.agent_id);
    if (agentErr) return { error: agentErr.message };

    const { error: liveErr } = await db
      .from("closebot_agent_versions")
      .update({
        status: "live",
        went_live_at: version.went_live_at ?? now,
        superseded_at: null,
        updated_at: now,
      })
      .eq("id", version.id);
    if (liveErr) return { error: liveErr.message };
    return {};
  }

  if (status === "did_not_work" || status === "reverted") {
    if (version.status !== "pending") return {};
    const { error } = await db
      .from("closebot_agent_versions")
      .update({ status: "rejected", updated_at: now })
      .eq("id", version.id);
    if (error) return { error: error.message };
  }

  return {};
}

export async function resolveVersionForLog(
  db: ClosebotDb,
  agentId: string,
  body: Record<string, unknown>,
): Promise<{ versionId: string | null; error?: string }> {
  if ("agent_version_id" in body) {
    if (body.agent_version_id === null || body.agent_version_id === "") {
      return { versionId: null };
    }
    const id = cleanUuid(body.agent_version_id);
    if (!id) return { versionId: null, error: "agent_version_id must be a valid id" };
    const { data, error } = await db
      .from("closebot_agent_versions")
      .select("id, agent_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { versionId: null, error: error.message };
    if (!data) return { versionId: null, error: "Agent version not found" };
    if (data.agent_id !== agentId) {
      return { versionId: null, error: "Agent version does not belong to this agent" };
    }
    return { versionId: id };
  }

  const attach = body.attach_pending_version;
  if (attach === false) return { versionId: null };
  if (attach === true || attach == null) {
    const { version, error } = await fetchPendingVersion(db, agentId);
    if (error) return { versionId: null, error };
    if (attach === true && !version) {
      return { versionId: null, error: "No pending agent config to attach" };
    }
    return { versionId: version?.id ?? null };
  }
  return { versionId: null };
}

export async function resolveVersionAt(
  db: ClosebotDb,
  agentId: string,
  occurredAt: string,
): Promise<{ versionId: string | null; error?: string }> {
  const { data, error } = await db
    .from("closebot_agent_versions")
    .select("id, status, went_live_at, superseded_at")
    .eq("agent_id", agentId)
    .in("status", ["live", "superseded"]);
  if (error) return { versionId: null, error: error.message };
  return {
    versionId: pickVersionAt(
      (data ?? []) as { id: string; status: string; went_live_at: string | null; superseded_at: string | null }[],
      occurredAt,
    ),
  };
}

export async function assertVersionBelongsToAgent(
  db: ClosebotDb,
  agentId: string,
  versionId: string,
): Promise<{ error?: string }> {
  const { data, error } = await db
    .from("closebot_agent_versions")
    .select("id, agent_id")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Agent version not found" };
  if (data.agent_id !== agentId) {
    return { error: "Agent version does not belong to this agent" };
  }
  return {};
}

export async function createClosebotTicket(
  db: ClosebotDb,
  body: Record<string, unknown>,
  opts: { defaultStatus: ClosebotTicketStatus; allowStatus: boolean },
): Promise<{ ticket?: unknown; error?: string; status: number }> {
  const reporterName = cleanString(body.reporter_name);
  if (!reporterName) return { error: "reporter_name is required", status: 400 };

  const agentId = cleanUuid(body.agent_id);
  if (!agentId) return { error: "agent_id is required", status: 400 };

  const clientId = cleanUuid(body.client_id);
  if (!clientId) return { error: "client_id is required", status: 400 };

  if (!isClosebotBugType(body.bug_type)) {
    return { error: "bug_type is invalid", status: 400 };
  }

  const description = cleanString(body.description);
  if (!description) return { error: "description is required", status: 400 };

  const contact = cleanHttpUrl(body.contact_url);
  if (contact.error || !contact.url) {
    return { error: contact.error ?? "contact_url is required", status: 400 };
  }

  const occurredAt = parseChangedAt(body.occurred_at);
  if (!occurredAt) {
    return { error: "occurred_at is required (YYYY-MM-DD or ISO datetime)", status: 400 };
  }

  let status: ClosebotTicketStatus = opts.defaultStatus;
  if (opts.allowStatus && body.status != null) {
    if (!isClosebotTicketStatus(body.status)) {
      return { error: "Invalid status", status: 400 };
    }
    status = body.status;
  }

  const { data: agent, error: agentErr } = await db
    .from("closebot_agents")
    .select("id, is_active")
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr) return { error: agentErr.message, status: 500 };
  if (!agent) return { error: "Agent not found", status: 400 };
  if (!agent.is_active) {
    return { error: "Cannot file a ticket against an archived agent", status: 400 };
  }

  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) return { error: clientErr.message, status: 500 };
  if (!client) return { error: "Client not found", status: 400 };

  let versionId: string | null = null;
  if ("agent_version_id" in body && body.agent_version_id != null && body.agent_version_id !== "") {
    const id = cleanUuid(body.agent_version_id);
    if (!id) return { error: "agent_version_id must be a valid id", status: 400 };
    const owned = await assertVersionBelongsToAgent(db, agentId, id);
    if (owned.error) return { error: owned.error, status: 400 };
    versionId = id;
  } else {
    const resolved = await resolveVersionAt(db, agentId, occurredAt);
    if (resolved.error) return { error: resolved.error, status: 500 };
    versionId = resolved.versionId;
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("closebot_tickets")
    .insert({
      occurred_at: occurredAt,
      bug_type: body.bug_type,
      description,
      contact_url: contact.url,
      client_id: clientId,
      agent_id: agentId,
      agent_version_id: versionId,
      status,
      reporter_name: reporterName,
      status_notes: cleanString(body.status_notes),
      created_at: now,
      updated_at: now,
    })
    .select(TICKET_SELECT)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  return { ticket: data, status: 201 };
}
