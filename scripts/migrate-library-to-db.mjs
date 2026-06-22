#!/usr/bin/env node
/**
 * One-time seed: upsert filesystem playbooks from content/library into Supabase.
 * Usage: node scripts/migrate-library-to-db.mjs [--dry-run]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "content", "library");

function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function extractHeadings(body) {
  const headings = [];
  for (const line of body.split("\n")) {
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
        /^icp tracks/i.test(h.title)),
  );
  const h3Stages = headings.filter((h) => h.level === 3 && /^stage\s+[2-7]/i.test(h.title));
  return [...h2, ...h3Stages];
}

function extractDescription(body) {
  const purpose = body.match(/## Purpose\s*\n+([^\n#]+)/);
  if (purpose) return purpose[1].trim().slice(0, 200);
  const first = body.replace(/^#.+$/m, "").trim().split("\n").find((l) => l.trim());
  return first?.trim().slice(0, 200) ?? "";
}

const dryRun = process.argv.includes("--dry-run");
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const manifestPath = path.join(LIBRARY_ROOT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

async function main() {
  let upserted = 0;
  for (const doc of manifest.docs) {
    const filePath = path.join(LIBRARY_ROOT, doc.path);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skip missing file: ${doc.path}`);
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const { content: body } = matter(raw);

    const row = {
      slug: doc.slug,
      title: doc.title,
      description: doc.description || extractDescription(body),
      body,
      domain: doc.domain,
      owner: doc.owner,
      status: doc.status,
      artifact_type: doc.artifact_type,
      department: doc.department ?? "sales",
      review_cycle: doc.review_cycle,
      script_version: doc.script_version,
      related_docs: doc.related_docs ?? [],
      headings: doc.headings ?? extractHeadings(body),
      stage_nav: doc.stage_nav ?? extractStageHeadings(doc.headings ?? extractHeadings(body)),
      opening_pills: doc.opening_pills ?? [],
      icp_pills: doc.icp_pills ?? [],
      featured: doc.featured ?? false,
      bundle: doc.bundle ?? null,
      tags: [doc.owner, doc.artifact_type, doc.domain, doc.department ?? "sales"].filter(Boolean),
      updated_at: new Date().toISOString(),
    };

    if (dryRun) {
      console.log(`[dry-run] Would upsert: ${doc.slug}`);
      upserted++;
      continue;
    }

    const { error } = await supabase.from("library_documents").upsert(row, { onConflict: "slug" });
    if (error) {
      console.error(`Failed ${doc.slug}:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted: ${doc.slug}`);
    upserted++;
  }

  // Seed built-in forms into form_registry if empty
  const { count } = await supabase.from("form_registry").select("*", { count: "exact", head: true });
  if (!count && !dryRun) {
    const forms = [
      {
        slug: "acquisition-demo-booked",
        title: "Demo Booking Credit",
        description:
          "Setter magic link after booking a demo — logs credit in Mr. Waiz and syncs Agent, booking source, and pipeline stage to GHL.",
        href: "/forms/acquisition/demo-booked",
        audience: "Acquisition setters",
        tags: ["acquisition", "setter", "demo"],
        sort_order: 0,
      },
      {
        slug: "churn",
        title: "Churn Offboarding",
        description:
          "When a client is leaving: capture exit feedback, complete the offboarding checklist, and sync churn to Mr. Waiz, ClickUp, and GHL.",
        href: "/forms/churn",
        audience: "Client Success",
        tags: ["churn", "offboarding", "cs"],
        sort_order: 1,
      },
      {
        slug: "onboard",
        title: "Client Onboarding",
        description: "Public form for new clients to submit onboarding details after sign-up.",
        href: "/onboard",
        audience: "Clients",
        tags: ["onboarding", "client-facing"],
        sort_order: 2,
      },
    ];
    const { error } = await supabase.from("form_registry").insert(forms);
    if (error) console.warn("Form registry seed warning:", error.message);
    else console.log(`Seeded ${forms.length} form registry entries.`);
  }

  console.log(`\nDone. ${upserted} playbook(s) ${dryRun ? "would be " : ""}migrated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
