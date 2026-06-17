#!/usr/bin/env node
/**
 * Backfill acquisition_calls from appointments, dials, and offer recordings.
 *
 * Usage:
 *   node scripts/backfill-acquisition-calls.mjs --dry-run
 *   node scripts/backfill-acquisition-calls.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

const CALL_TYPES = new Set(['intro', 'demo', 'followup', 'bamfam', 'organic', 'other']);

function apptToCallStatus(status) {
  if (status === 'showed') return 'showed';
  if (status === 'no_show') return 'no_show';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'team_no_show') return 'team_no_show';
  return 'pending';
}

function dialToCallStatus(outcome) {
  const s = (outcome ?? '').toLowerCase();
  if (s.includes('voicemail')) return 'voicemail';
  if (s.includes('no answer') || s.includes('no_answer')) return 'no_answer';
  if (s.includes('connect')) return 'connected';
  return 'connected';
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    appointments: 0,
    dials: 0,
    offer_recordings: 0,
    skipped: 0,
    warnings: [],
  };

  const appointments = await fetchAll('/rest/v1/acquisition_appointments?select=id,lead_id,appointment_type,status,booked_at,scheduled_at,setter_name,call_taken_by,qualified,raw');
  const existingCalls = await fetchAll('/rest/v1/acquisition_calls?select=id,appointment_id,dial_id,call_type');
  const byAppt = new Map(existingCalls.filter((c) => c.appointment_id).map((c) => [c.appointment_id, c]));
  const byDial = new Map(existingCalls.filter((c) => c.dial_id).map((c) => [c.dial_id, c]));

  for (const appt of appointments) {
    if (!appt.lead_id) {
      report.skipped++;
      continue;
    }
    const callType = CALL_TYPES.has(appt.appointment_type) ? appt.appointment_type : 'other';
    if (byAppt.has(appt.id)) continue;

    const calledAt = appt.scheduled_at ?? appt.booked_at ?? new Date().toISOString();
    const row = {
      lead_id: appt.lead_id,
      appointment_id: appt.id,
      call_type: callType,
      called_at: calledAt,
      status: apptToCallStatus(appt.status),
      handled_by: appt.setter_name ?? appt.call_taken_by,
      co_handler: appt.call_taken_by && appt.setter_name ? appt.call_taken_by : null,
      source: 'sheet_backfill',
      details: { qualified: appt.qualified },
      raw: { backfill: 'appointment', appointment_id: appt.id },
    };

    if (!DRY_RUN) {
      const res = await supabaseRequest('POST', '/rest/v1/acquisition_calls', row);
      if (res.status >= 300) {
        report.warnings.push(`appointment ${appt.id}: HTTP ${res.status}`);
        continue;
      }
    }
    report.appointments++;
  }

  const dials = await fetchAll('/rest/v1/acquisition_dials?select=id,lead_id,occurred_at,agent_name,duration_seconds,outcome,phone');
  for (const dial of dials) {
    if (!dial.lead_id || byDial.has(dial.id)) continue;
    const row = {
      lead_id: dial.lead_id,
      dial_id: dial.id,
      call_type: 'dial',
      called_at: dial.occurred_at,
      status: dialToCallStatus(dial.outcome),
      handled_by: dial.agent_name,
      duration_seconds: dial.duration_seconds,
      disposition: dial.outcome,
      source: 'dial_ingest',
      details: { outcome: dial.outcome, phone: dial.phone },
      raw: { backfill: 'dial', dial_id: dial.id },
    };
    if (!DRY_RUN) {
      const res = await supabaseRequest('POST', '/rest/v1/acquisition_calls', row);
      if (res.status >= 300) {
        report.warnings.push(`dial ${dial.id}: HTTP ${res.status}`);
        continue;
      }
    }
    report.dials++;
  }

  const offers = await fetchAll(
    '/rest/v1/acquisition_offers?select=id,lead_id,appointment_id,offered_at,recording_link&recording_link=not.is.null',
  );
  const demoCalls = await fetchAll(
    "/rest/v1/acquisition_calls?select=id,lead_id,called_at,recording_url&call_type=eq.demo",
  );

  for (const offer of offers) {
    if (!offer.recording_link || !offer.lead_id) continue;
    const candidates = demoCalls.filter((c) => c.lead_id === offer.lead_id);
    if (!candidates.length) continue;
    const nearest = candidates.reduce((best, c) => {
      const d = Math.abs(new Date(c.called_at).getTime() - new Date(offer.offered_at).getTime());
      const bd = best
        ? Math.abs(new Date(best.called_at).getTime() - new Date(offer.offered_at).getTime())
        : Infinity;
      return d < bd ? c : best;
    }, null);
    if (!nearest || nearest.recording_url) continue;
    if (!DRY_RUN) {
      await supabaseRequest('PATCH', `/rest/v1/acquisition_calls?id=eq.${nearest.id}`, {
        recording_url: offer.recording_link,
        offer_id: offer.id,
        updated_at: new Date().toISOString(),
      });
    }
    report.offer_recordings++;
  }

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/acquisition-calls-backfill-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
