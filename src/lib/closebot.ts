/** Closebot prompt log — types, statuses, validation helpers. */

export const CLOSEBOT_LOG_STATUSES = [
  "open",
  "watching",
  "worked",
  "did_not_work",
  "reverted",
] as const;

export type ClosebotLogStatus = (typeof CLOSEBOT_LOG_STATUSES)[number];

export const CLOSEBOT_STATUS_META: Record<
  ClosebotLogStatus,
  { label: string; color: string; help: string }
> = {
  open: { label: "Open", color: "#94a3b8", help: "Logged; not yet watching outcomes" },
  watching: { label: "Watching", color: "#60a5fa", help: "Live — watching for tickets / results" },
  worked: { label: "Worked", color: "#34d399", help: "Change resolved the issue" },
  did_not_work: { label: "Didn't work", color: "#f87171", help: "Issue still happened or failed" },
  reverted: { label: "Reverted", color: "#64748b", help: "Prompt rolled back" },
};

export const CLOSEBOT_NODE_TYPES = [
  "agent_node",
  "custom_scenario",
  "stop_responding",
  "branch",
  "objective",
] as const;

export type ClosebotNodeType = (typeof CLOSEBOT_NODE_TYPES)[number];

export const CLOSEBOT_NODE_TYPE_META: Record<ClosebotNodeType, { label: string }> = {
  agent_node: { label: "Agent Node" },
  custom_scenario: { label: "Custom scenario" },
  stop_responding: { label: "Stop Responding" },
  branch: { label: "Branch" },
  objective: { label: "Objective" },
};

export const CLOSEBOT_VERSION_STATUSES = [
  "pending",
  "live",
  "superseded",
  "rejected",
] as const;

export type ClosebotVersionStatus = (typeof CLOSEBOT_VERSION_STATUSES)[number];

export type ClosebotAgentNode = {
  type: ClosebotNodeType;
  name: string;
  description: string;
  prompt: string;
};

export const CLOSEBOT_FOLLOWUP_UNITS = ["minutes", "hours", "days"] as const;

export type ClosebotFollowUpUnit = (typeof CLOSEBOT_FOLLOWUP_UNITS)[number];

export const CLOSEBOT_FOLLOWUP_UNIT_META: Record<ClosebotFollowUpUnit, { label: string }> = {
  minutes: { label: "Minutes" },
  hours: { label: "Hours" },
  days: { label: "Days" },
};

export type ClosebotFollowUpTypeRow = {
  after: number;
  unit: ClosebotFollowUpUnit;
};

export type ClosebotFollowUp = {
  name: string;
  prompt: string;
  types: ClosebotFollowUpTypeRow[];
};

export type ClosebotPersonaSnapshot = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  how_to_respond: string | null;
  tone: string[];
  custom_delay_enabled: boolean;
  typo_frequency: number | null;
  custom_delay_seconds: number | null;
};

export type ClosebotPersona = ClosebotPersonaSnapshot & {
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ClosebotAgentVersion = {
  id: string;
  agent_id: string;
  status: ClosebotVersionStatus;
  name: string;
  description: string | null;
  job_information: string | null;
  persona_id: string | null;
  persona_snapshot: ClosebotPersonaSnapshot | null;
  nodes: ClosebotAgentNode[];
  follow_ups: ClosebotFollowUp[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  went_live_at: string | null;
  superseded_at: string | null;
  open_ticket_count?: number;
  resolved_ticket_count?: number;
};

export type ClosebotAgent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  job_information: string | null;
  persona_id: string | null;
  nodes: ClosebotAgentNode[];
  follow_ups: ClosebotFollowUp[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  log_count?: number;
  persona?: Pick<ClosebotPersona, "id" | "name" | "slug" | "is_active"> | Pick<ClosebotPersona, "id" | "name" | "slug" | "is_active">[] | null;
  pending_version?: ClosebotAgentVersion | null;
};

export type ClosebotPromptLog = {
  id: string;
  agent_id: string;
  agent_version_id: string | null;
  changed_at: string;
  prompt_body: string;
  problem_solved: string;
  change_reason: string;
  reference_urls: string[];
  status: ClosebotLogStatus;
  outcome_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  agent?: Pick<ClosebotAgent, "id" | "name" | "slug" | "is_active"> | null;
};

export function isClosebotLogStatus(v: unknown): v is ClosebotLogStatus {
  return typeof v === "string" && (CLOSEBOT_LOG_STATUSES as readonly string[]).includes(v);
}

export function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

export function slugifyClosebotName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "agent";
}

/** Date-only (YYYY-MM-DD) → start of that day UTC ISO string. */
export function changedAtFromDateInput(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

export function parseChangedAt(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return changedAtFromDateInput(trimmed);
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function cleanHttpUrls(v: unknown): { urls: string[]; error?: string } {
  if (v == null) return { urls: [] };
  let raw: string[] = [];
  if (Array.isArray(v)) {
    raw = v.filter((u): u is string => typeof u === "string");
  } else if (typeof v === "string") {
    raw = v.split(/[\n,]+/);
  } else {
    return { urls: [], error: "reference_urls must be an array of URLs" };
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = item.trim();
    if (!t) continue;
    let normalized = t;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    try {
      const u = new URL(normalized);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { urls: [], error: `Invalid URL: ${t}` };
      }
      const href = u.toString();
      if (!seen.has(href)) {
        seen.add(href);
        urls.push(href);
      }
    } catch {
      return { urls: [], error: `Invalid URL: ${t}` };
    }
  }
  return { urls };
}

export function formatLogDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function dateInputFromIso(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function isClosebotNodeType(v: unknown): v is ClosebotNodeType {
  return typeof v === "string" && (CLOSEBOT_NODE_TYPES as readonly string[]).includes(v);
}

export function isClosebotVersionStatus(v: unknown): v is ClosebotVersionStatus {
  return typeof v === "string" && (CLOSEBOT_VERSION_STATUSES as readonly string[]).includes(v);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cleanUuid(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

export function parseToneChips(v: unknown): { tone: string[]; error?: string } {
  if (v == null) return { tone: [] };
  let raw: string[] = [];
  if (Array.isArray(v)) {
    raw = v.filter((t): t is string => typeof t === "string");
  } else if (typeof v === "string") {
    raw = v.split(/[,;\n]+/);
  } else {
    return { tone: [], error: "tone must be an array of labels" };
  }
  const tone: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tone.push(t.slice(0, 80));
  }
  return { tone };
}

export function parseTypoFrequency(v: unknown): { value: number | null; error?: string } {
  if (v == null || v === "") return { value: null };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return { value: null, error: "typo_frequency must be a number" };
  if (n < 0 || n > 100) return { value: null, error: "typo_frequency must be between 0 and 100" };
  return { value: n };
}

export function parseDelaySeconds(v: unknown): { value: number | null; error?: string } {
  if (v == null || v === "") return { value: null };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return { value: null, error: "custom_delay_seconds must be a number" };
  if (n < 0) return { value: null, error: "custom_delay_seconds cannot be negative" };
  return { value: Math.trunc(n) };
}

export function parseAgentNodes(v: unknown): { nodes: ClosebotAgentNode[]; error?: string } {
  if (v == null) return { nodes: [] };
  if (!Array.isArray(v)) return { nodes: [], error: "nodes must be an array" };
  const nodes: ClosebotAgentNode[] = [];
  for (let i = 0; i < v.length; i++) {
    const row = v[i];
    if (!row || typeof row !== "object") {
      return { nodes: [], error: `nodes[${i}] must be an object` };
    }
    const rec = row as Record<string, unknown>;
    if (!isClosebotNodeType(rec.type)) {
      return { nodes: [], error: `nodes[${i}].type is invalid` };
    }
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) return { nodes: [], error: `nodes[${i}].name is required` };
    const description = typeof rec.description === "string" ? rec.description.trim() : "";
    const prompt = typeof rec.prompt === "string" ? rec.prompt.trim() : "";
    nodes.push({ type: rec.type, name, description, prompt });
  }
  return { nodes };
}

export function parseFollowUps(v: unknown): { followUps: ClosebotFollowUp[]; error?: string } {
  if (v == null) return { followUps: [] };
  if (!Array.isArray(v)) return { followUps: [], error: "follow_ups must be an array" };
  const followUps: ClosebotFollowUp[] = [];
  for (let i = 0; i < v.length; i++) {
    const row = v[i];
    if (!row || typeof row !== "object") {
      return { followUps: [], error: `follow_ups[${i}] must be an object` };
    }
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) return { followUps: [], error: `follow_ups[${i}].name is required` };
    const prompt = typeof rec.prompt === "string" ? rec.prompt.trim() : "";
    const typesRaw = rec.types;
    if (typesRaw != null && !Array.isArray(typesRaw)) {
      return { followUps: [], error: `follow_ups[${i}].types must be an array` };
    }
    const types: ClosebotFollowUpTypeRow[] = [];
    for (let j = 0; j < (typesRaw ?? []).length; j++) {
      const t = (typesRaw as unknown[])[j];
      if (!t || typeof t !== "object") {
        return { followUps: [], error: `follow_ups[${i}].types[${j}] must be an object` };
      }
      const tr = t as Record<string, unknown>;
      const afterRaw = typeof tr.after === "number" ? tr.after : Number(tr.after);
      if (!Number.isFinite(afterRaw) || afterRaw <= 0) {
        return { followUps: [], error: `follow_ups[${i}].types[${j}].after must be a positive number` };
      }
      const unit = typeof tr.unit === "string" ? tr.unit.trim().toLowerCase() : "";
      if (!(CLOSEBOT_FOLLOWUP_UNITS as readonly string[]).includes(unit)) {
        return { followUps: [], error: `follow_ups[${i}].types[${j}].unit is invalid` };
      }
      types.push({ after: afterRaw, unit: unit as ClosebotFollowUpUnit });
    }
    followUps.push({ name, prompt, types });
  }
  return { followUps };
}

export function emptyAgentNode(): ClosebotAgentNode {
  return { type: "agent_node", name: "", description: "", prompt: "" };
}

export function emptyFollowUp(): ClosebotFollowUp {
  return { name: "", prompt: "", types: [] };
}

export function emptyFollowUpType(): ClosebotFollowUpTypeRow {
  return { after: 6, unit: "hours" };
}

export function personaToSnapshot(p: ClosebotPersonaSnapshot): ClosebotPersonaSnapshot {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    how_to_respond: p.how_to_respond ?? null,
    tone: Array.isArray(p.tone) ? p.tone : [],
    custom_delay_enabled: Boolean(p.custom_delay_enabled),
    typo_frequency: p.typo_frequency ?? null,
    custom_delay_seconds: p.custom_delay_seconds ?? null,
  };
}

export type AgentConfigSnapshot = {
  name: string;
  description: string | null;
  job_information: string | null;
  persona_id: string | null;
  persona_snapshot: ClosebotPersonaSnapshot | null;
  nodes: ClosebotAgentNode[];
  follow_ups: ClosebotFollowUp[];
};

export function snapshotFromAgent(
  agent: Pick<
    ClosebotAgent,
    "name" | "description" | "job_information" | "persona_id" | "nodes" | "follow_ups"
  >,
  personaSnapshot: ClosebotPersonaSnapshot | null,
): AgentConfigSnapshot {
  return {
    name: agent.name,
    description: agent.description ?? null,
    job_information: agent.job_information ?? null,
    persona_id: agent.persona_id ?? null,
    persona_snapshot: personaSnapshot,
    nodes: Array.isArray(agent.nodes) ? agent.nodes : [],
    follow_ups: Array.isArray(agent.follow_ups) ? agent.follow_ups : [],
  };
}

export function parsePersonaBody(
  body: Record<string, unknown>,
  requireName: boolean,
): { fields?: Record<string, unknown>; error?: string } {
  const fields: Record<string, unknown> = {};

  if ("name" in body || requireName) {
    const name = cleanString(body.name);
    if (!name) return { error: requireName ? "name is required" : "name cannot be empty" };
    fields.name = name;
  }

  if ("description" in body || requireName) {
    fields.description =
      body.description === null || body.description === ""
        ? null
        : cleanString(body.description);
  }

  if ("how_to_respond" in body || requireName) {
    fields.how_to_respond =
      body.how_to_respond === null || body.how_to_respond === ""
        ? null
        : cleanString(body.how_to_respond);
  }

  if ("tone" in body || requireName) {
    const { tone, error } = parseToneChips(body.tone);
    if (error) return { error };
    fields.tone = tone;
  }

  if ("custom_delay_enabled" in body || requireName) {
    if ("custom_delay_enabled" in body && typeof body.custom_delay_enabled !== "boolean") {
      return { error: "custom_delay_enabled must be a boolean" };
    }
    fields.custom_delay_enabled = body.custom_delay_enabled === true;
  }

  if ("typo_frequency" in body || requireName) {
    const freq = parseTypoFrequency(body.typo_frequency);
    if (freq.error) return { error: freq.error };
    fields.typo_frequency = freq.value;
  }

  if ("custom_delay_seconds" in body || requireName) {
    const delay = parseDelaySeconds(body.custom_delay_seconds);
    if (delay.error) return { error: delay.error };
    fields.custom_delay_seconds = delay.value;
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return { error: "is_active must be a boolean" };
    fields.is_active = body.is_active;
  } else if (requireName) {
    fields.is_active = true;
  }

  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return { error: "sort_order must be a number" };
    }
    fields.sort_order = Math.trunc(body.sort_order);
  } else if (requireName) {
    fields.sort_order = 0;
  }

  return { fields };
}

export async function uniqueClosebotSlug(
  exists: (slug: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    if (!(await exists(candidate))) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}
