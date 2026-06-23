#!/usr/bin/env node
/**
 * Apply pre-generated acquisition meta backfill SQL batches via Supabase
 * Management API. Requires SUPABASE_ACCESS_TOKEN in env (sbp_...).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-acquisition-meta-backfill.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-acquisition-meta-backfill.mjs --sql path/to/file.sql
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROJECT_REF = 'fszmndldcvrrmitfbwde';
const BATCH_DIR = resolve(ROOT, 'data/import/acquisition-meta-backfill-batches');

async function runQuery(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN (sbp_...)');

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text;
}

async function main() {
  const sqlArg = process.argv.indexOf('--sql');
  const singleFile = sqlArg !== -1 ? process.argv[sqlArg + 1] : null;

  if (singleFile) {
    const sql = readFileSync(resolve(singleFile), 'utf8').trim();
    process.stdout.write(`${singleFile}… `);
    await runQuery(sql);
    console.log('ok');
    return;
  }

  const files = readdirSync(BATCH_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) throw new Error(`No SQL batches in ${BATCH_DIR}`);
  console.log(`Applying ${files.length} SQL batches…`);
  for (const f of files) {
    const sql = readFileSync(resolve(BATCH_DIR, f), 'utf8').trim();
    process.stdout.write(`${f}… `);
    await runQuery(sql);
    console.log('ok');
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
