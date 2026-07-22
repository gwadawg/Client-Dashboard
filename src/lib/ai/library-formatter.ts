import Anthropic from "@anthropic-ai/sdk";
import type {
  LibraryArtifactType,
  LibraryDepartment,
  LibraryOwner,
  RelatedDoc,
} from "../library-manifest";

/**
 * Structured result of running raw pasted copy through the AI formatter.
 * Every metadata field is a *suggestion* the editor can accept or override.
 * `body` is the restructured markdown — formatting only, wording preserved.
 */
export type FormattedLibraryDoc = {
  title: string;
  description: string;
  body: string;
  artifact_type: LibraryArtifactType;
  owner: LibraryOwner;
  department: LibraryDepartment | null;
  review_cycle: string | null;
  script_version: string | null;
  tags: string[];
  related_docs: RelatedDoc[];
};

export type LibraryDocCatalogEntry = {
  slug: string;
  title: string;
  artifact_type?: string;
};

const ARTIFACT_TYPES: LibraryArtifactType[] = [
  "script", "sop", "checklist", "reference", "framework", "doctrine", "prompt", "hub", "document",
];
const OWNERS: LibraryOwner[] = ["setter", "closer", "sales-leadership", "operations"];
const DEPARTMENTS: LibraryDepartment[] = ["sales", "call-center", "media-buying", "client-success", "operations"];

const MAX_INPUT_CHARS = 30000;
const MAX_CATALOG = 80;

const SYSTEM_PROMPT = `You format raw text into clean documents for the Mr. Waiz Resource Library. The library renders GitHub-flavored Markdown with a few extra conventions.

## YOUR JOB: FORMAT ONLY — DO NOT REWRITE

The single most important rule: preserve the author's wording verbatim. You are a formatter, not an editor.

- DO: add structure — headings, lists, callouts, dialogue blocks, tables, spacing, and cross-links.
- DO: fix formatting artifacts introduced by copy/paste (stray line breaks mid-sentence, doubled spaces, smart quotes, bullet characters like "•" or "*" turned into proper "-" list items).
- DO NOT: change, paraphrase, summarize, shorten, expand, "improve", or correct the grammar/spelling of the actual sentences. Keep every word the author wrote.
- DO NOT: invent new content, sections, examples, or facts that are not present in the source text.
- If a section's intent is ambiguous, keep the text as a plain paragraph rather than guessing.

## CHAPTER / SECTION STRUCTURE (CRITICAL)

The left sidebar ("Sections" / "Stages") is built from \`##\` H2 headings. A flat wall of text with no H2s will have an empty chapter nav.

- Always break the body into multiple \`##\` chapters when the source has distinct topics, steps, or phases.
- Prefer 3–10 H2 sections for a typical SOP/script. Avoid a single giant H2.
- For call scripts or numbered step flows, name them \`## Stage 1: …\`, \`## Stage 2: …\` (these become sticky stage nav).
- For SOPs / playbooks / FAQs, use clear chapter titles drawn from the source (e.g. Purpose, When to use, Procedure, Escalation, Related). Do not invent chapter titles that aren't supported by the source — but DO promote existing section labels into H2s.
- Use \`###\` for sub-steps inside a chapter.
- Start with \`## Purpose\` ONLY IF the source has an intro/summary sentence you can use verbatim.

## MARKDOWN CONVENTIONS

- \`> line\` — a blockquote renders as a copyable script/dialogue line. Use for word-for-word talk tracks.
- \`📋 text\` — blue operator/instruction callout ("do this").
- \`🔴 text\` — red critical-action callout (warnings / must-dos).
- \`[NAME]\`, \`[LO NAME]\`, \`[CLIENT]\` — placeholder chips. Only convert placeholders the author already indicated.
- \`- [ ] item\` — interactive checklist tasks.
- Standard Markdown tables for tabular/routing data.

## CROSS-LINKS TO OTHER LIBRARY DOCS

When the source mentions another playbook/SOP by name (or clearly refers to one in the catalog below), turn that mention into a markdown link:

\`[Exact Title](/library/slug)\`

Rules:
- ONLY link to slugs from the provided catalog. Never invent slugs.
- Keep the author's surrounding sentence wording; only wrap the doc name as a link.
- Also list those docs in \`related_docs\` so they appear in the Related sidebar.
- If the source doesn't mention other docs, leave related_docs empty — do not invent links.

## METADATA (suggested, author will confirm)

- title: concise document title (verbatim from source if present).
- description: one sentence from the author's own words.
- artifact_type: script | sop | checklist | reference | framework | doctrine | prompt | hub | document.
- owner: setter | closer | sales-leadership | operations.
- department: sales | call-center | media-buying | client-success | operations, or null.
- review_cycle / script_version: only if stated in source, else empty.
- tags: 2–5 short lowercase keywords.
- related_docs: array of { slug, label, relation } for catalog docs you linked. relation is usually "reference".

Return your result by calling the emit_document tool exactly once.`;

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_document",
  description: "Return the formatted library document and its suggested metadata.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise document title." },
      description: { type: "string", description: "One-sentence summary from the author's own words." },
      body: {
        type: "string",
        description:
          "The full restructured Markdown body with multiple ## chapters. Wording preserved verbatim; formatting only.",
      },
      artifact_type: { type: "string", enum: ARTIFACT_TYPES },
      owner: { type: "string", enum: OWNERS },
      department: { type: "string", enum: [...DEPARTMENTS, "unknown"] },
      review_cycle: { type: "string", description: "weekly | monthly | quarterly, or empty if not stated." },
      script_version: { type: "string", description: "Version string for scripts, or empty." },
      tags: { type: "array", items: { type: "string" }, description: "2-5 short lowercase keywords." },
      related_docs: {
        type: "array",
        description: "Library docs linked from the body (must match catalog slugs).",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" },
            label: { type: "string" },
            relation: { type: "string" },
          },
          required: ["slug", "label"],
        },
      },
    },
    required: ["title", "body", "artifact_type", "owner"],
  },
};

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function coerceOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s && s.toLowerCase() !== "unknown" ? s : null;
}

function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of value) {
    if (typeof t !== "string") continue;
    const tag = t.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
    if (out.length >= 8) break;
  }
  return out;
}

function coerceRelatedDocs(value: unknown, catalog: LibraryDocCatalogEntry[]): RelatedDoc[] {
  const bySlug = new Map(catalog.map((d) => [d.slug, d]));
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RelatedDoc[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const slug = typeof r.slug === "string" ? r.slug.trim().toLowerCase() : "";
    if (!slug || seen.has(slug) || !bySlug.has(slug)) continue;
    const catalogHit = bySlug.get(slug)!;
    const label =
      (typeof r.label === "string" && r.label.trim()) || catalogHit.title || slug;
    const relation = typeof r.relation === "string" && r.relation.trim() ? r.relation.trim() : "reference";
    seen.add(slug);
    out.push({ slug, label, relation });
  }
  return out;
}

function formatCatalogBlock(catalog: LibraryDocCatalogEntry[]): string {
  if (!catalog.length) {
    return "(No other library docs available yet — skip cross-links.)";
  }
  return catalog
    .slice(0, MAX_CATALOG)
    .map((d) => `- ${d.title} → /library/${d.slug}${d.artifact_type ? ` (${d.artifact_type})` : ""}`)
    .join("\n");
}

/**
 * Send raw pasted text to Claude and get back clean, library-standard markdown
 * plus suggested metadata. Formatting only — the author's wording is preserved.
 */
export async function formatLibraryDoc(
  rawText: string,
  catalog: LibraryDocCatalogEntry[] = [],
): Promise<FormattedLibraryDoc> {
  const text = rawText.trim();
  if (!text) throw new Error("No text provided to format.");
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`Text is too long (max ${MAX_INPUT_CHARS.toLocaleString()} characters). Split it into smaller docs.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to enable AI formatting.");
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const catalogBlock = formatCatalogBlock(catalog);

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [EMIT_TOOL],
    tool_choice: { type: "tool", name: "emit_document" },
    messages: [
      {
        role: "user",
        content: `Format the following raw text into a clean library document.

Remember:
1. Preserve wording verbatim — structure only.
2. Use multiple ## chapter headings so the Sections sidebar populates.
3. Link to catalog docs when the source mentions them: [Title](/library/slug).

## Library catalog (only link these)
${catalogBlock}

<raw_text>
${text}
</raw_text>`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_document",
  );
  if (!toolUse) {
    throw new Error("The formatter did not return a structured document. Try again.");
  }

  const out = (toolUse.input ?? {}) as Record<string, unknown>;
  const title = typeof out.title === "string" ? out.title.trim() : "";
  const body = typeof out.body === "string" ? out.body.trim() : "";
  if (!body) throw new Error("The formatter returned an empty document. Try again.");

  const deptRaw = coerceOptional(out.department);
  const department =
    deptRaw && (DEPARTMENTS as readonly string[]).includes(deptRaw)
      ? (deptRaw as LibraryDepartment)
      : null;

  return {
    title,
    description: typeof out.description === "string" ? out.description.trim() : "",
    body,
    artifact_type: coerceEnum(out.artifact_type, ARTIFACT_TYPES, "document"),
    owner: coerceEnum(out.owner, OWNERS, "operations"),
    department,
    review_cycle: coerceOptional(out.review_cycle),
    script_version: coerceOptional(out.script_version),
    tags: coerceTags(out.tags),
    related_docs: coerceRelatedDocs(out.related_docs, catalog),
  };
}
