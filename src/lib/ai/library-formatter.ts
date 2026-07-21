import Anthropic from "@anthropic-ai/sdk";
import type {
  LibraryArtifactType,
  LibraryDepartment,
  LibraryOwner,
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
};

const ARTIFACT_TYPES: LibraryArtifactType[] = [
  "script", "sop", "checklist", "reference", "framework", "doctrine", "prompt", "hub", "document",
];
const OWNERS: LibraryOwner[] = ["setter", "closer", "sales-leadership", "operations"];
const DEPARTMENTS: LibraryDepartment[] = ["sales", "call-center", "media-buying", "client-success", "operations"];

const MAX_INPUT_CHARS = 30000;

const SYSTEM_PROMPT = `You format raw text into clean documents for the Mr. Waiz Resource Library. The library renders GitHub-flavored Markdown with a few extra conventions.

## YOUR JOB: FORMAT ONLY — DO NOT REWRITE

The single most important rule: preserve the author's wording verbatim. You are a formatter, not an editor.

- DO: add structure — headings, lists, callouts, dialogue blocks, tables, spacing.
- DO: fix formatting artifacts introduced by copy/paste (stray line breaks mid-sentence, doubled spaces, smart quotes, bullet characters like "•" or "*" turned into proper "-" list items).
- DO NOT: change, paraphrase, summarize, shorten, expand, "improve", or correct the grammar/spelling of the actual sentences. Keep every word the author wrote.
- DO NOT: invent new content, sections, examples, or facts that are not present in the source text.
- If a section's intent is ambiguous, keep the text as a plain paragraph rather than guessing.

## MARKDOWN CONVENTIONS

Apply these when the source clearly calls for them:

- \`## Purpose\` — start the body with a short H2 "Purpose" section ONLY IF the source contains an intro/summary sentence you can use verbatim. Do not fabricate one.
- \`## Heading\` / \`### Subheading\` — turn section titles into H2/H4. If the doc has a sequence of stages/steps, name them \`## Stage 1: ...\`, \`## Stage 2: ...\` (these become sticky nav anchors).
- \`> line\` — a blockquote renders as a copyable script/dialogue line. Use this for things the rep is meant to SAY (word-for-word talk tracks, phone lines).
- \`📋 text\` — a paragraph starting with 📋 renders as a blue operator/instruction callout. Use for "do this" operator notes.
- \`🔴 text\` — a paragraph starting with 🔴 renders as a red critical-action callout. Use for warnings / must-dos.
- \`[NAME]\`, \`[LO NAME]\`, \`[CLIENT]\` — wrap fill-in-the-blank placeholders in square brackets so they render as chips. Only convert placeholders the author already indicated (e.g. blanks, "name here", ALL-CAPS tokens).
- \`- [ ] item\` — checklist tasks become interactive checkboxes.
- Standard Markdown tables for any tabular/routing data.

## METADATA (suggested, author will confirm)

Infer these from the content. When unsure, choose the most conservative option and leave optional fields empty.

- title: a concise document title. If the source has an obvious title line, use it verbatim.
- description: one sentence describing what the doc covers, taken/condensed from the author's own words (no new claims).
- artifact_type: one of script | sop | checklist | reference | framework | doctrine | prompt | hub | document.
- owner: one of setter | closer | sales-leadership | operations — the role that executes this doc.
- department: one of sales | call-center | media-buying | client-success | operations, or null if unclear.
- review_cycle: e.g. "weekly" | "monthly" | "quarterly" only if the source states one, else null.
- script_version: only for scripts that state a version, else null.
- tags: 2-5 short lowercase keyword tags.

Return your result by calling the emit_document tool exactly once.`;

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_document",
  description: "Return the formatted library document and its suggested metadata.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise document title." },
      description: { type: "string", description: "One-sentence summary from the author's own words." },
      body: { type: "string", description: "The full restructured Markdown body. Wording preserved verbatim; formatting only." },
      artifact_type: { type: "string", enum: ARTIFACT_TYPES },
      owner: { type: "string", enum: OWNERS },
      department: { type: "string", enum: [...DEPARTMENTS, "unknown"] },
      review_cycle: { type: "string", description: "weekly | monthly | quarterly, or empty if not stated." },
      script_version: { type: "string", description: "Version string for scripts, or empty." },
      tags: { type: "array", items: { type: "string" }, description: "2-5 short lowercase keywords." },
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

/**
 * Send raw pasted text to Claude and get back clean, library-standard markdown
 * plus suggested metadata. Formatting only — the author's wording is preserved.
 */
export async function formatLibraryDoc(rawText: string): Promise<FormattedLibraryDoc> {
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

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [EMIT_TOOL],
    tool_choice: { type: "tool", name: "emit_document" },
    messages: [
      {
        role: "user",
        content: `Format the following raw text into a clean library document. Remember: preserve the wording verbatim, only add structure.\n\n<raw_text>\n${text}\n</raw_text>`,
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
  };
}
