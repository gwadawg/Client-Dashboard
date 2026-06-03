/**
 * Backfill appointment outcomes (show / no_show / cancelled / lo_bailed) for
 * appointments that were booked while the Make "appointment status" scenario was
 * sending the wrong external_id and therefore never matched.
 *
 * It simply replays each outcome through the SAME production webhook the live
 * automation uses, so the result is identical to a real-time update:
 *   - the outcome row is dated to when the appointment was BOOKED (not now)
 *   - it is idempotent (re-running is safe; one outcome per appointment)
 *
 * 1. Fill in the `status` column of data/import/appointment-outcomes.csv
 *    (one of: show | no_show | cancelled | lo_bailed). Leave blank to skip a row.
 * 2. Dry run first:   node scripts/backfill-appointment-outcomes.mjs --dry-run
 * 3. Apply:           node scripts/backfill-appointment-outcomes.mjs
 *
 * Optional: override the target with --url=https://your-app/api/webhooks/appointment-status
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const CSV_PATH =
  process.argv.find((a) => a.endsWith('.csv')) ??
  resolve(__dirname, '../data/import/appointment-outcomes.csv');

const envPath = resolve(__dirname, '../.env.local');
const envVars = readFileSync(envPath, 'utf-8')
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val.length) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {});

const SECRET = envVars['ADMIN_WEBHOOK_SECRET'];
const URL_ARG = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
const ENDPOINT =
  URL_ARG ?? 'https://wm-os-production.up.railway.app/api/webhooks/appointment-status';

const VALID_STATUS = new Set(['show', 'no_show', 'cancelled', 'lo_bailed']);

if (!SECRET) {
  console.error('Missing ADMIN_WEBHOOK_SECRET in .env.local');
  process.exit(1);
}
if (!existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

// Minimal CSV read: external_id is column 0, status is column 1. Any extra
// reference columns (client, lead name, etc.) after that are ignored, so commas
// in names are harmless.
const lines = readFileSync(CSV_PATH, 'utf-8').split(/\r?\n/).filter((l) => l.trim());
const header = lines.shift();
if (!header || !/external_id/i.test(header)) {
  console.error('First line must be a header containing "external_id,status,...".');
  process.exit(1);
}

const rows = [];
const skipped = [];
for (const line of lines) {
  const parts = line.split(',');
  const external_id = (parts[0] ?? '').trim();
  const status = (parts[1] ?? '').trim().toLowerCase();
  if (!external_id) continue;
  if (!status) {
    skipped.push({ external_id, reason: 'blank status' });
    continue;
  }
  if (!VALID_STATUS.has(status)) {
    skipped.push({ external_id, reason: `invalid status "${status}"` });
    continue;
  }
  rows.push({ external_id, status });
}

console.log(`Endpoint:  ${ENDPOINT}`);
console.log(`To apply:  ${rows.length}   Skipped: ${skipped.length}   ${DRY_RUN ? '(DRY RUN)' : ''}`);
if (skipped.length) {
  for (const s of skipped) console.log(`  skip ${s.external_id}  (${s.reason})`);
}

let ok = 0;
let fail = 0;

for (const { external_id, status } of rows) {
  if (DRY_RUN) {
    console.log(`  would send  ${external_id}  -> ${status}`);
    continue;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ external_id, status }),
    });
    const text = await res.text();
    if (res.ok) {
      ok++;
      console.log(`  ${res.status}  ${external_id} -> ${status}  ${text}`);
    } else {
      fail++;
      console.log(`  FAIL ${res.status}  ${external_id} -> ${status}  ${text}`);
    }
  } catch (e) {
    fail++;
    console.log(`  ERROR ${external_id} -> ${status}  ${e instanceof Error ? e.message : e}`);
  }
}

if (!DRY_RUN) {
  console.log(`\nDone. Applied ${ok}, failed ${fail}.`);
}
