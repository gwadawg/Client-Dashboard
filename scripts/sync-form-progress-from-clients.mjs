#!/usr/bin/env node
/**
 * Phase 3: Infer missing client_form_submissions for stage cards (Sign/OB/KO/Live).
 *
 *   node scripts/sync-form-progress-from-clients.mjs
 *   node scripts/sync-form-progress-from-clients.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServiceClient, fetchAllRows } from './lib/supabase-client.mjs';
import { clientsLikelySameClient } from './lib/roster-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_PATH = resolve(__dirname, '../data/import/form-sync-preview.json');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const PAST_NEW_ACCOUNT = new Set(['onboarding', 'active', 'paused', 'off_boarding', 'churned']);

function isoDate(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

function needsKickoff(client) {
  if (client.ghl_location_id) return true;
  if (!client.primary_contact_name) return false;
  return !clientsLikelySameClient(client.name, client.primary_contact_name);
}

function buildSubmission(client, formType) {
  const submittedAt =
    (formType === 'new_client' && (client.date_signed || client.created_at)) ||
    (formType === 'onboarding' && client.launch_date) ||
    (formType === 'launch' && client.launch_date) ||
    (formType === 'kickoff' && (client.launch_date || client.created_at)) ||
    client.created_at ||
    new Date().toISOString();

  const at = typeof submittedAt === 'string' && submittedAt.length === 10
    ? `${submittedAt}T12:00:00.000Z`
    : submittedAt;

  const responses = { backfill: true };

  if (formType === 'new_client') {
    responses.date_signed = isoDate(client.date_signed) || isoDate(client.created_at);
  }
  if (formType === 'onboarding') {
    responses.onboarding_complete_date = isoDate(client.launch_date);
    responses.launch_date = isoDate(client.launch_date);
  }
  if (formType === 'launch') {
    responses.launch_date = isoDate(client.launch_date);
  }
  if (formType === 'kickoff') {
    responses.ghl_location_id = client.ghl_location_id ?? null;
    responses.timezone = client.timezone ?? null;
    responses.states_licensed = client.states_licensed ?? null;
  }

  return {
    client_id: client.id,
    form_type: formType,
    status: 'applied',
    submitted_by: 'backfill',
    responses,
    applied_patch: { backfill: true },
    submitted_at: at,
  };
}

function inferMissingForms(client, progress) {
  const missing = [];
  const p = progress[client.id] ?? {};

  if (!p.new_client && (client.date_signed || client.created_at)) {
    missing.push('new_client');
  }
  if (!p.onboarding && (client.launch_date || PAST_NEW_ACCOUNT.has(client.lifecycle_status))) {
    missing.push('onboarding');
  }
  if (!p.kickoff && needsKickoff(client)) {
    missing.push('kickoff');
  }
  if (!p.launch && client.launch_date) {
    missing.push('launch');
  }
  return missing;
}

async function main() {
  const supa = createServiceClient();
  const clients = await fetchAllRows(supa, 'clients', {
    select:
      'id, name, primary_contact_name, lifecycle_status, date_signed, launch_date, created_at, ghl_location_id, timezone, states_licensed',
  });

  const subs = await fetchAllRows(supa, 'client_form_submissions', {
    select: 'client_id, form_type, status',
  });

  const progress = {};
  for (const row of subs) {
    if (!row.client_id) continue;
    if (!['applied', 'submitted'].includes(row.status)) continue;
    if (!progress[row.client_id]) progress[row.client_id] = {};
    if (progress[row.client_id][row.form_type] === undefined) {
      progress[row.client_id][row.form_type] = true;
    }
  }

  const planned = [];
  for (const client of clients) {
    const missing = inferMissingForms(client, progress);
    if (!missing.length) continue;
    planned.push({
      client_id: client.id,
      client_name: client.name,
      lifecycle_status: client.lifecycle_status,
      missing_forms: missing,
      submissions: missing.map(ft => buildSubmission(client, ft)),
    });
  }

  const preview = {
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    summary: {
      clients: clients.length,
      clients_needing_forms: planned.length,
      submissions_to_insert: planned.reduce((n, p) => n + p.submissions.length, 0),
    },
    planned,
  };

  writeFileSync(PREVIEW_PATH, JSON.stringify(preview, null, 2));
  console.log(`Preview written to ${PREVIEW_PATH}`);
  console.log(JSON.stringify(preview.summary, null, 2));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to insert submissions.');
    return;
  }

  let inserted = 0;
  for (const row of planned) {
    for (const sub of row.submissions) {
      const { error } = await supa.from('client_form_submissions').insert(sub);
      if (error) throw new Error(`${row.client_name} ${sub.form_type}: ${error.message}`);
      inserted++;
    }
    console.log(`Synced ${row.client_name}: ${row.missing_forms.join(', ')}`);
  }
  console.log(`\nInserted ${inserted} form submission(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
