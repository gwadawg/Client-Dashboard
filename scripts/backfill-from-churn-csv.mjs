#!/usr/bin/env node
/**
 * Phase 2: Backfill churn from WM Ops cancellation CSV.
 * Sets lifecycle_status=churned, historical churned_at, churn form submission + status history.
 * No ClickUp / GHL / Slack side effects.
 *
 *   node scripts/backfill-from-churn-csv.mjs
 *   node scripts/backfill-from-churn-csv.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServiceClient, fetchAllRows } from './lib/supabase-client.mjs';
import {
  loadJson,
  loadCsvRows,
  parseFlexibleDate,
  matchRosterClient,
  dedupeChurnRows,
  buildChurnResponses,
  isBlank,
  formatChurnHistoryNote,
  normalizeReportingTypeForBackfill,
} from './lib/backfill-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_PATH = resolve(__dirname, '../data/import/churn-backfill-preview.json');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function parseChurnCsv(rows) {
  return rows.map(r => {
    const clientIdRaw = String(r['Client ID'] ?? '').trim();
    const clickup_task_id = clientIdRaw.startsWith('86') ? clientIdRaw : null;
    const churn_date = parseFlexibleDate(r['Date Churned']);
    const submitted = parseFlexibleDate(r['Date Submitted']);
    return {
      name: r.Name?.trim(),
      clickup_task_id,
      legacy_client_id: clickup_task_id ? null : clientIdRaw || null,
      phone: r.Phone?.trim() || null,
      email: r.Email?.trim() || null,
      offer: r.Offer?.trim().toUpperCase() || null,
      reason: r['Reason for Churnning']?.trim() || '',
      notes: r['Additional Notes']?.trim() || '',
      churn_date,
      submitted,
      bad_date: r['Date Churned']?.trim() && !churn_date,
    };
  });
}

async function main() {
  const aliases = loadJson('backfill-name-aliases.json');
  const reasonMap = loadJson('churn-reason-map.json');
  const rawRows = loadCsvRows('churn-cancellation.csv');
  const parsed = parseChurnCsv(rawRows);
  const rows = dedupeChurnRows(parsed, aliases);

  const supa = createServiceClient();
  const roster = await fetchAllRows(supa, 'clients', {
    select:
      'id, name, primary_contact_name, email, billing_email, phone, clickup_task_id, lifecycle_status, churned_at, reporting_type, mrr',
  });

  const existingChurnSubs = await fetchAllRows(supa, 'client_form_submissions', {
    select: 'client_id',
    filters: [['form_type', 'eq', 'churn']],
  });
  const hasChurnForm = new Set(existingChurnSubs.map(r => r.client_id));

  const matched = [];
  const ask_user = [];
  const bad_dates = [];
  const skipped = [];

  for (const row of rows) {
    if (row.bad_date) {
      bad_dates.push({ name: row.name, raw: row });
    }

    const match = matchRosterClient(roster, {
      clickup_task_id: row.clickup_task_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      aliases,
    });

    if (!match.client) {
      ask_user.push({
        churn_name: row.name,
        clickup_task_id: row.clickup_task_id,
        legacy_client_id: row.legacy_client_id,
        phone: row.phone,
        email: row.email,
        churn_date: row.churn_date,
        reason: row.reason,
        notes: row.notes,
        method: match.method,
        candidates: match.candidates ?? null,
      });
      continue;
    }

    const client = match.client;
    const responses = buildChurnResponses(row, reasonMap);
    const patch = {
      lifecycle_status: 'churned',
      is_live: false,
    };
    if (row.offer && ['HE', 'RM', 'DSCR', 'CALL_CENTER', 'CC'].includes(row.offer) && isBlank(client.reporting_type)) {
      patch.reporting_type = normalizeReportingTypeForBackfill(row.offer);
    }

    const actions = {
      update_client: patch,
      churned_at: row.churn_date ? `${row.churn_date}T12:00:00.000Z` : null,
      insert_churn_form: !hasChurnForm.has(client.id),
      enrich_status_history: true,
      responses,
    };

    if (client.lifecycle_status === 'churned' && hasChurnForm.has(client.id) && client.churned_at) {
      skipped.push({
        client_id: client.id,
        client_name: client.name,
        reason: 'already_churned_with_form',
      });
      continue;
    }

    matched.push({
      client_id: client.id,
      client_name: client.name,
      churn_name: row.name,
      match_method: match.method,
      current_lifecycle: client.lifecycle_status,
      actions,
    });
  }

  const preview = {
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    summary: {
      csv_rows: rawRows.length,
      deduped_rows: rows.length,
      matched: matched.length,
      ask_user: ask_user.length,
      bad_dates: bad_dates.length,
      skipped: skipped.length,
    },
    matched,
    ask_user,
    bad_dates,
    skipped,
  };

  writeFileSync(PREVIEW_PATH, JSON.stringify(preview, null, 2));
  console.log(`Preview written to ${PREVIEW_PATH}`);
  console.log(JSON.stringify(preview.summary, null, 2));

  if (ask_user.length) {
    console.log('\nUnmatched churn rows (ask_user):');
    for (const u of ask_user) console.log(`  - ${u.churn_name}`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to patch clients.');
    return;
  }

  let applied = 0;
  for (const row of matched) {
    const { client_id, client_name, actions } = row;
    const client = roster.find(c => c.id === client_id);
    const previousLifecycle = client?.lifecycle_status ?? null;

    const { error: updateErr } = await supa
      .from('clients')
      .update(actions.update_client)
      .eq('id', client_id);
    if (updateErr) throw new Error(`${client_name} lifecycle: ${updateErr.message}`);

    if (actions.churned_at) {
      const { error: churnErr } = await supa
        .from('clients')
        .update({ churned_at: actions.churned_at })
        .eq('id', client_id);
      if (churnErr) throw new Error(`${client_name} churned_at: ${churnErr.message}`);
    }

    if (actions.enrich_status_history) {
      const { data: historyRows } = await supa
        .from('client_status_history')
        .select('id')
        .eq('client_id', client_id)
        .eq('new_status', 'churned')
        .order('changed_at', { ascending: false })
        .limit(1);

      const historyId = historyRows?.[0]?.id;
      const note = formatChurnHistoryNote(actions.responses);

      if (historyId) {
        await supa
          .from('client_status_history')
          .update({
            source: 'manual',
            changed_by: null,
            reason_code: actions.responses.reason_code,
            note,
            previous_status: previousLifecycle,
          })
          .eq('id', historyId);
      } else {
        await supa.from('client_status_history').insert({
          client_id,
          previous_status: previousLifecycle,
          new_status: 'churned',
          source: 'manual',
          reason_code: actions.responses.reason_code,
          note,
          mrr_at_change: client?.mrr ?? null,
        });
      }
    }

    if (actions.insert_churn_form) {
      const { error: formErr } = await supa.from('client_form_submissions').insert({
        client_id,
        form_type: 'churn',
        status: 'applied',
        submitted_by: 'backfill',
        responses: actions.responses,
        applied_patch: {
          lifecycle_status: 'churned',
          effective_churn_date: actions.responses.effective_churn_date,
          reason_code: actions.responses.reason_code,
          backfill: true,
        },
        submitted_at: actions.churned_at ?? new Date().toISOString(),
      });
      if (formErr) throw new Error(`${client_name} form: ${formErr.message}`);
    }

    applied++;
    console.log(`Churned ${client_name}`);
  }
  console.log(`\nApplied churn backfill for ${applied} client(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
