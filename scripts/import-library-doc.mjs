#!/usr/bin/env node
/**
 * Import markdown docs from Wm-os into content/library/.
 * Usage:
 *   node scripts/import-library-doc.mjs <source-path>
 *   node scripts/import-library-doc.mjs --bundle setter-playbooks
 *   node scripts/import-library-doc.mjs --bundle call-center-dscr
 *   node scripts/import-library-doc.mjs --bundle setter-playbooks --dry-run
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "content", "library");
const WM_OS_ROOT = path.resolve(REPO_ROOT, "..", "Wm-os");
const WM_OS_SALES = path.join(WM_OS_ROOT, "docs/acquisition/sales");
const WM_OS_DSCR = path.join(WM_OS_ROOT, "docs/client-fulfillment/dscr-dna");
const WM_OS_PEOPLE = path.join(WM_OS_ROOT, "docs/operations/people");

const SETTER_PLAYBOOKS_BUNDLE = [
  { rel: "script-intro-call-basic.md", slug: "intro-call-script", sourceRoot: WM_OS_SALES },
  { rel: "intro-call-qualification-framework.md", slug: "intro-qualification-framework", sourceRoot: WM_OS_SALES },
  { rel: "script-factory/flip-the-frame-company-description.md", slug: "flip-the-frame", sourceRoot: WM_OS_SALES },
  { rel: "script-factory/intro-icp-tracks.md", slug: "intro-icp-tracks", sourceRoot: WM_OS_SALES },
  { rel: "disqualifying-financial-qualification.md", slug: "financial-qualification", sourceRoot: WM_OS_SALES },
  { rel: "sop-watchshift.md", slug: "watchshift", sourceRoot: WM_OS_SALES },
  { rel: "no-shows-maximizing-show-rates-setter-levers.md", slug: "show-rate-levers", sourceRoot: WM_OS_SALES },
  { rel: "objection-handling-hub.md", slug: "objection-handling-hub", sourceRoot: WM_OS_SALES },
  { rel: "setter-daily-checklist.md", slug: "setter-daily-checklist", sourceRoot: WM_OS_SALES },
];

const CALL_CENTER_DSCR_BUNDLE = [
  { rel: "dscr-team-product-faq.md", slug: "dscr-team-product-faq", sourceRoot: WM_OS_DSCR },
  { rel: "dscr-setter-appointment-script.md", slug: "dscr-setter-appointment-script", sourceRoot: WM_OS_DSCR },
];

const TEAM_MEETINGS_KPI_BUNDLE = [
  { rel: "kpi-review-meeting-sop.md", slug: "kpi-review-meeting-sop", sourceRoot: WM_OS_PEOPLE },
  { rel: "under-kpi-diagnosis-ladder.md", slug: "under-kpi-diagnosis-ladder", sourceRoot: WM_OS_PEOPLE },
];

const BUNDLE_CONFIG = {
  "setter-playbooks": {
    entries: SETTER_PLAYBOOKS_BUNDLE,
    department: "sales",
    outputSubdir: "acquisition/sales",
    featuredSlug: "intro-call-script",
  },
  "call-center-dscr": {
    entries: CALL_CENTER_DSCR_BUNDLE,
    department: "call-center",
    outputSubdir: "client-fulfillment/call-center",
    featuredSlug: null,
  },
  "team-meetings-kpi": {
    entries: TEAM_MEETINGS_KPI_BUNDLE,
    department: "operations",
    outputSubdir: "operations/people",
    featuredSlug: "kpi-review-meeting-sop",
  },
};

const RELATED_DOCS_OVERRIDES = {
  "intro-call-script": [
    { slug: "intro-qualification-framework", label: "FUN Qualification", relation: "implements" },
    { slug: "flip-the-frame", label: "Flip the Frame", relation: "reference" },
    { slug: "intro-icp-tracks", label: "ICP Tracks", relation: "reference" },
    { slug: "financial-qualification", label: "Financial Qualification", relation: "reference" },
    { slug: "watchshift", label: "Watchshift SOP", relation: "reference" },
    { slug: "show-rate-levers", label: "Show Rate Levers", relation: "reference" },
    { slug: "objection-handling-hub", label: "Objection Handling", relation: "reference" },
    { slug: "setter-daily-checklist", label: "Daily Checklist", relation: "reference" },
  ],
  "dscr-setter-appointment-script": [
    { slug: "dscr-team-product-faq", label: "DSCR Team Product FAQ", relation: "prerequisite" },
    { slug: "intro-call-script", label: "RM Intro Script (acquisition)", relation: "reference" },
  ],
  "dscr-team-product-faq": [
    { slug: "dscr-setter-appointment-script", label: "DSCR Appointment Script", relation: "next-step" },
    { slug: "intro-qualification-framework", label: "FUN Qualification (RM acquisition)", relation: "reference" },
  ],
  "kpi-review-meeting-sop": [
    { slug: "under-kpi-diagnosis-ladder", label: "Under-KPI Diagnosis Ladder", relation: "next-step" },
  ],
  "under-kpi-diagnosis-ladder": [
    { slug: "kpi-review-meeting-sop", label: "KPI Review Meeting SOP", relation: "prerequisite" },
  ],
};

function slugFromFilename(relPath) {
  const base = path.basename(relPath, ".md");
  return base
    .replace(/^script-/, "")
    .replace(/^sop-/, "")
    .replace(/-basic$/, "")
    .replace(/-framework$/, "-framework")
    .replace(/-company-description$/, "")
    .replace(/-and-/g, "-")
    .replace(/--+/g, "-");
}

function deriveSlug(relPath, explicit) {
  if (explicit) return explicit;
  return slugFromFilename(relPath);
}

function resolveMdPath(fromFile, linkPath) {
  if (linkPath.startsWith("http://") || linkPath.startsWith("https://")) return null;
  const [filePart] = linkPath.split("#");
  if (!filePart.endsWith(".md")) return null;
  const fromDir = path.dirname(fromFile);
  return path.normalize(path.join(fromDir, filePart)).replace(/\\/g, "/");
}

function buildPathToSlugMap(entries) {
  const map = new Map();
  for (const { rel, slug, sourceRoot } of entries) {
    const normalized = rel.replace(/\\/g, "/");
    const abs = path.join(sourceRoot, normalized).replace(/\\/g, "/");
    map.set(normalized, slug);
    map.set(path.basename(normalized), slug);
    map.set(abs, slug);
    if (normalized.includes("/")) {
      map.set(path.basename(normalized, ".md") + ".md", slug);
    }
  }
  return map;
}

function rewriteLinks(body, fromRel, pathToSlug, sourceRoot) {
  const fromAbs = path.join(sourceRoot, fromRel).replace(/\\/g, "/");
  return body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, href) => {
    const [filePart, anchor = ""] = href.split("#");
    if (!filePart.endsWith(".md")) return match;

    const resolved = resolveMdPath(fromAbs, filePart);
    if (!resolved) return match;

    const basename = path.basename(resolved);
    const slug =
      pathToSlug.get(resolved) ??
      pathToSlug.get(basename) ??
      pathToSlug.get(filePart.replace(/^\.\//, ""));

    if (!slug) return match;

    const hash = anchor ? `#${anchor}` : "";
    return `[${text}](/library/${slug}${hash})`;
  });
}

function extractHeadings(body) {
  const headings = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const title = m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    const id = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    headings.push({ level, title, id });
  }
  return headings;
}

function extractStageHeadings(headings) {
  const h2 = headings.filter(
    (h) =>
      h.level === 2 &&
      (/^stage\s+1/i.test(h.title) ||
        /stages\s+2/i.test(h.title) ||
        /call checklist/i.test(h.title) ||
        /north star/i.test(h.title) ||
        /setter boundaries/i.test(h.title) ||
        /^icp tracks/i.test(h.title) ||
        /^core operating frames/i.test(h.title) ||
        /^quality bar/i.test(h.title)),
  );
  const h3Stages = headings.filter((h) => h.level === 3 && /^stage\s+[2-7]/i.test(h.title));
  return [...h2, ...h3Stages];
}

function findHeadingId(headings, pattern) {
  const hit = headings.find((h) => pattern.test(h.title));
  return hit?.id ?? null;
}

function extractOpeningPills(headings) {
  const defs = [
    { id: "opening-1-booked-call", label: "Booked", pattern: /opening\s*1/i },
    { id: "opening-2-appointment-confirmation-early-intro", label: "Confirm", pattern: /opening\s*2/i },
    { id: "opening-3-dialer-impromptu", label: "Dialer", pattern: /opening\s*3/i },
    { id: "opening-4-intro-no-show-recovery", label: "No-show", pattern: /opening\s*4/i },
  ];
  return defs
    .map((d) => {
      const resolved = findHeadingId(headings, d.pattern);
      return resolved ? { id: resolved, label: d.label } : null;
    })
    .filter(Boolean);
}

function extractIcpPills(headings) {
  const defs = [
    { label: "Referral LO", pattern: /track\s*1|referral/i },
    { label: "Marketing", pattern: /track\s*2|marketing/i },
    { label: "Forward→Reverse", pattern: /track\s*3|forward/i },
  ];
  return defs
    .map((d) => {
      const hit = headings.find((h) => d.pattern.test(h.title));
      return hit ? { id: hit.id, label: d.label } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeOwner(raw) {
  const valid = new Set(["setter", "closer", "sales-leadership", "operations"]);
  if (raw && valid.has(raw)) return raw;
  // Wm-os role owners that map to library "operations"
  if (raw === "client-success" || raw === "ceo" || raw === "ccm" || raw === "media-buyer") {
    return "operations";
  }
  return "setter";
}

function importDoc(sourcePath, relPath, slug, pathToSlug, dryRun, bundleName, department, outputSubdir, featuredSlug, sourceRoot) {
  const raw = fs.readFileSync(sourcePath, "utf8");
  const { data: frontmatter, content: body } = matter(raw);

  const finalSlug = frontmatter.slug ?? slug;
  const rewritten = rewriteLinks(body, relPath, pathToSlug, sourceRoot);

  const outDir = path.join(LIBRARY_ROOT, outputSubdir);
  const outPath = path.join(outDir, `${finalSlug}.md`);

  const updatedFrontmatter = {
    ...frontmatter,
    slug: finalSlug,
    title: frontmatter.title ?? finalSlug,
    department: frontmatter.department ?? department,
    owner: normalizeOwner(frontmatter.owner),
  };

  const output = matter.stringify(rewritten, updatedFrontmatter);
  const headings = extractHeadings(rewritten);

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
  }

  return {
    slug: finalSlug,
    title: updatedFrontmatter.title,
    description: extractDescription(rewritten),
    domain: updatedFrontmatter.domain ?? "acquisition",
    owner: updatedFrontmatter.owner,
    status: updatedFrontmatter.status ?? "draft",
    artifact_type: updatedFrontmatter.artifact_type ?? "document",
    last_updated: updatedFrontmatter.last_updated ?? null,
    review_cycle: updatedFrontmatter.review_cycle ?? null,
    script_version: updatedFrontmatter.script_version ?? null,
    path: `${outputSubdir}/${finalSlug}.md`,
    headings,
    stage_nav: extractStageHeadings(headings),
    opening_pills: extractOpeningPills(headings),
    icp_pills: extractIcpPills(headings),
    related_docs:
      RELATED_DOCS_OVERRIDES[finalSlug] ??
      frontmatter.related_docs ??
      [],
    featured: featuredSlug ? finalSlug === featuredSlug : false,
    bundle: bundleName,
    department: updatedFrontmatter.department ?? department,
  };
}

function extractDescription(body) {
  const purpose = body.match(/## Purpose\s*\n+([^\n#]+)/);
  if (purpose) return purpose[1].trim().slice(0, 200);
  const first = body.replace(/^#.+$/m, "").trim().split("\n").find((l) => l.trim());
  return first?.trim().slice(0, 200) ?? "";
}

function loadExistingManifest() {
  const manifestPath = path.join(LIBRARY_ROOT, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { version: 1, docs: [], bundles: {} };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function mergeManifest(existing, imported, bundleName) {
  const bySlug = new Map((existing.docs ?? []).map((d) => [d.slug, d]));
  for (const doc of imported) bySlug.set(doc.slug, doc);
  const docs = Array.from(bySlug.values()).sort((a, b) => a.title.localeCompare(b.title));
  const bundles = { ...(existing.bundles ?? {}), [bundleName]: imported.map((d) => d.slug) };
  return { version: 1, updated_at: new Date().toISOString().slice(0, 10), docs, bundles };
}

function importBundle(bundleName, dryRun) {
  const config = BUNDLE_CONFIG[bundleName];
  if (!config) {
    console.error(`Unknown bundle: ${bundleName}`);
    process.exit(1);
  }

  const { entries, department, outputSubdir, featuredSlug } = config;
  const pathToSlug = buildPathToSlugMap(entries);
  const imported = [];

  for (const { rel, slug, sourceRoot } of entries) {
    const sourcePath = path.join(sourceRoot, rel);
    if (!fs.existsSync(sourcePath)) {
      console.error(`Missing source: ${sourcePath}`);
      process.exit(1);
    }
    const doc = importDoc(
      sourcePath,
      rel,
      slug,
      pathToSlug,
      dryRun,
      bundleName,
      department,
      outputSubdir,
      featuredSlug,
      sourceRoot,
    );
    imported.push(doc);
    console.log(`${dryRun ? "[dry-run] " : ""}Imported: ${doc.slug} ← ${rel}`);
  }

  const existing = loadExistingManifest();
  const manifest = mergeManifest(existing, imported, bundleName);

  if (!dryRun) {
    fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
    fs.writeFileSync(
      path.join(LIBRARY_ROOT, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    );
    console.log(`\nWrote manifest with ${manifest.docs.length} docs.`);
  } else {
    console.log(`\n[dry-run] Would write manifest with ${manifest.docs.length} docs.`);
  }
}

function importSingle(sourcePath, dryRun) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }
  const rel = path.basename(resolved);
  const slug = deriveSlug(rel);
  const pathToSlug = new Map([[rel, slug]]);
  const sourceRoot = path.dirname(resolved);
  const doc = importDoc(
    resolved,
    rel,
    slug,
    pathToSlug,
    dryRun,
    "custom",
    "sales",
    "acquisition/sales",
    null,
    sourceRoot,
  );
  const existing = loadExistingManifest();
  const manifest = mergeManifest(existing, [doc], "custom");
  if (!dryRun) {
    fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
    fs.writeFileSync(
      path.join(LIBRARY_ROOT, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    );
  }
  console.log(`${dryRun ? "[dry-run] " : ""}Imported: ${doc.slug}`);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bundleIdx = args.indexOf("--bundle");
const bundleName = bundleIdx >= 0 ? args[bundleIdx + 1] : null;
const fileArg = args.find((a) => !a.startsWith("--") && a !== bundleName);

if (bundleName && BUNDLE_CONFIG[bundleName]) {
  importBundle(bundleName, dryRun);
} else if (fileArg) {
  importSingle(fileArg, dryRun);
} else {
  console.log(`Usage:
  node scripts/import-library-doc.mjs --bundle setter-playbooks [--dry-run]
  node scripts/import-library-doc.mjs --bundle call-center-dscr [--dry-run]
  node scripts/import-library-doc.mjs --bundle team-meetings-kpi [--dry-run]
  node scripts/import-library-doc.mjs <path-to-doc.md> [--dry-run]`);
  process.exit(1);
}
