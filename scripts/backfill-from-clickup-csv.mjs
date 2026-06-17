#!/usr/bin/env node
/**
 * Phase 1: Merge ClickUp Client Hub + Old Client Database CSVs and patch clients.
 *
 *   node scripts/backfill-from-clickup-csv.mjs
 *   node scripts/backfill-from-clickup-csv.mjs --apply
 *   node scripts/backfill-from-clickup-csv.mjs --apply --force-field launch_date
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServiceClient, fetchAllRows } from './lib/supabase-client.mjs';
import {
  loadJson,
  loadCsvRows,
  mergeClickUpSources,
  buildClickUpPatch,
  matchRosterClient,
  diffClientPatch,
} from './lib/backfill-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_PATH = resolve(__dirname, '../data/import/clickup-backfill-preview.json');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const forceFields = new Set(
  args.filter((a, i) => args[i - 1] === '--force-field'),
);

async function main() {
  const fieldMap = loadJson('clickup-field-map.json');
  const aliases = loadJson('backfill-name-aliases.json');

  const hubRows = loadCsvRows('clickup-client-hub.csv');
  const oldRows = loadCsvRows('clickup-client-database.csv');
  const merged = mergeClickUpSources(hubRows, oldRows, fieldMap, aliases);

  const supa = createServiceClient();
  const roster = await fetchAllRows(supa, 'clients', {
    select:
      'id, name, primary_contact_name, email, billing_email, phone, clickup_task_id, lifecycle_status, is_live, launch_date, date_signed, nmls, website, timezone, states_licensed, state, daily_adspend, ghl_location_id, reporting_type',
  });

  const matched = [];
  const unmatched = [];
  const conflicts = [];
  const taskIdConflicts = [];

  for (const entry of merged) {
    const { patch, meta } = buildClickUpPatch(entry, fieldMap);
    const phone = patch.phone ?? entry.old?.[fieldMap.old_database.phone];
    const match = matchRosterClient(roster, {
      clickup_task_id: entry.clickup_task_id,
      name: entry.displayName,
      phone,
      aliases,
    });

    if (!match.client) {
      unmatched.push({
        clickup_name: entry.displayName,
        clickup_task_id: entry.clickup_task_id,
        in_hub: entry.in_hub,
        in_old_db: entry.in_old_db,
        method: match.method,
        candidates: match.candidates ?? null,
        proposed_patch: patch,
        meta,
      });
      continue;
    }

    const client = match.client;
    const changes = diffClientPatch(client, patch, forceFields);

    if (
      client.clickup_task_id &&
      entry.clickup_task_id &&
      client.clickup_task_id !== entry.clickup_task_id &&
      !forceFields.has('clickup_task_id')
    ) {
      taskIdConflicts.push({
        client_id: client.id,
        client_name: client.name,
        roster_clickup_task_id: client.clickup_task_id,
        csv_clickup_task_id: entry.clickup_task_id,
        hub_task_id: entry.hub_task_id,
        old_task_id: entry.old_task_id,
      });
      delete changes.clickup_task_id;
    }

    const fieldDiffs = {};
    for (const [key, value] of Object.entries(patch)) {
      const current = client[key];
      if (current != null && current !== '' && !(Array.isArray(current) && !current.length)) {
        if (JSON.stringify(current) !== JSON.stringify(value) && !(key in changes)) {
          fieldDiffs[key] = { current, proposed: value };
        }
      }
    }

    if (Object.keys(fieldDiffs).length) {
      conflicts.push({
        client_id: client.id,
        client_name: client.name,
        match_method: match.method,
        field_diffs: fieldDiffs,
      });
    }

    matched.push({
      client_id: client.id,
      client_name: client.name,
      clickup_name: entry.displayName,
      match_method: match.method,
      changes,
      meta,
      skipped_fields: fieldDiffs,
    });
  }

  const preview = {
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    summary: {
      csv_merged: merged.length,
      matched: matched.length,
      unmatched: unmatched.length,
      conflicts: conflicts.length,
      task_id_conflicts: taskIdConflicts.length,
      would_patch: matched.filter(m => Object.keys(m.changes).length > 0).length,
    },
    matched,
    unmatched,
    conflicts,
    task_id_conflicts: taskIdConflicts,
  };

  writeFileSync(PREVIEW_PATH, JSON.stringify(preview, null, 2));
  console.log(`Preview written to ${PREVIEW_PATH}`);
  console.log(JSON.stringify(preview.summary, null, 2));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to patch clients.');
    return;
  }

  let patched = 0;
  for (const row of matched) {
    if (!Object.keys(row.changes).length) continue;
    const { error } = await supa.from('clients').update(row.changes).eq('id', row.client_id);
    if (error) throw new Error(`${row.client_name}: ${error.message}`);
    patched++;
    console.log(`Patched ${row.client_name}: ${Object.keys(row.changes).join(', ')}`);
  }
  console.log(`\nApplied ${patched} client patch(es).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
