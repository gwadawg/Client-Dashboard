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

export type ClosebotAgent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  log_count?: number;
};

export type ClosebotPromptLog = {
  id: string;
  agent_id: string;
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
