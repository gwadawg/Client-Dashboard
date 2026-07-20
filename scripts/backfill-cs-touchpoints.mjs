#!/usr/bin/env node
/**
 * Backfill cs_touchpoints for Client Success Follow-ups.
 *
 * Rules:
 * - Month 1 (days 0–29 from launch_date ?? date_signed): upsert missing
 *   first_lead / first_booking / first_show from earliest matching events.
 * - Month 2+ (day 30+): do NOT create first_* ; skip any open first_* leftovers;
 *   ensure one open m2_biweekly pulse (same cadence as runCsTouchpointSchedule).
 * - No tenure anchor: skip schedule; no first_* backfill.
 *
 * Usage:
 *   node scripts/backfill-cs-touchpoints.mjs --dry-run
 *   node scripts/backfill-cs-touchpoints.mjs --apply
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchAll, supabaseRequest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--apply');
const M1_DURATION_DAYS = 30;
const M2_INTERVAL_DAYS = 14;

function nextM2BiweeklyDueIso(anchorYmd, now = new Date()) {
  const anchor = String(anchorYmd).slice(0, 10);
  let due = new Date(`${anchor}T12:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + M1_DURATION_DAYS);
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  while (due.getTime() < todayStart) {
    due = new Date(due.getTime() + M2_INTERVAL_DAYS * 86_400_000);
  }
  return due.toISOString();
}

const EVENT_TO_TP = {
  lead: 'first_lead',
  appointment_booked: 'first_booking',
  show: 'first_show',
};

function tenureAnchor(c) {
  const launch = c.launch_date?.trim?.() || c.launch_date;
  if (launch) return String(launch).slice(0, 10);
  const signed = c.date_signed?.trim?.() || c.date_signed;
  if (signed) return String(signed).slice(0, 10);
  return null;
}

function daysSinceAnchor(anchor, now = new Date()) {
  const day = anchor.slice(0, 10);
  const anchorUtc = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowUtc - anchorUtc) / 86_400_000);
}

function addDaysIso(base, days) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function cycleKeyFromDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function cycleKeyBiweekly(dueAt) {
  return `m2:${cycleKeyFromDate(dueAt)}`;
}

async function upsertTouchpoint(row) {
  if (DRY_RUN) return { created: true, dry: true };
  const { status, data } = await supabaseRequest(
    'POST',
    '/rest/v1/cs_touchpoints?on_conflict=client_id,touchpoint_type,cycle_key',
    row,
    { Prefer: 'resolution=ignore-duplicates,return=representation' },
  );
  if (status !== 200 && status !== 201) {
    if (String(data).includes('23505')) return { created: false };
    throw new Error(`upsert failed ${status}: ${data}`);
  }
  const arr = data ? JSON.parse(data) : [];
  return { created: Array.isArray(arr) && arr.length > 0, id: arr[0]?.id ?? null };
}

async function skipOpenFirstStar(clientId, nowIso) {
  if (DRY_RUN) {
    // Count would need a fetch; approximate as 1 if any exist later in summary from pre-scan
    return 0;
  }
  const path =
    `/rest/v1/cs_touchpoints?client_id=eq.${clientId}` +
    `&touchpoint_type=in.(first_lead,first_qc,first_booking,first_show)` +
    `&status=in.(open,snoozed)`;
  const { status, data } = await supabaseRequest(
    'PATCH',
    path,
    {
      status: 'skipped',
      completed_at: nowIso,
      updated_at: nowIso,
      completion_note: 'Backfill: Month 1 event touchpoints not used after day 30',
    },
    { Prefer: 'return=representation' },
  );
  if (status !== 200 && status !== 204) {
    throw new Error(`skip failed ${status}: ${data}`);
  }
  if (!data) return 0;
  const arr = JSON.parse(data);
  return Array.isArray(arr) ? arr.length : 0;
}

async function firstEvent(clientId, eventType) {
  const path =
    `/rest/v1/events?select=id,occurred_at` +
    `&client_id=eq.${clientId}&event_type=eq.${eventType}` +
    `&order=occurred_at.asc.nullsfirst&limit=1`;
  const { status, data } = await supabaseRequest('GET', path, null, {
    Range: '0-0',
  });
  if (status !== 200 && status !== 206) {
    throw new Error(`events GET failed ${status}: ${data}`);
  }
  const rows = JSON.parse(data);
  return rows[0] ?? null;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (pass --apply to write) ===' : '=== APPLY ===');

  const clients = await fetchAll(
    '/rest/v1/clients?select=id,name,lifecycle_status,launch_date,date_signed&lifecycle_status=in.(active,onboarding)&order=name',
  );
  console.log(`Clients scanned: ${clients.length}`);

  const existing = await fetchAll(
    '/rest/v1/cs_touchpoints?select=id,client_id,touchpoint_type,cycle_key,status',
  );
  const existingKeys = new Set(
    existing.map((t) => `${t.client_id}|${t.touchpoint_type}|${t.cycle_key}`),
  );
  const hasType = (clientId, type) =>
    existing.some((t) => t.client_id === clientId && t.touchpoint_type === type);

  const now = new Date();
  const nowIso = now.toISOString();

  const summary = {
    m1Clients: 0,
    m2Clients: 0,
    noAnchor: 0,
    firstCreated: 0,
    firstSkippedStale: 0,
    biweeklyCreated: 0,
    m1AlreadyCovered: [],
    m1Backfilled: [],
    m2Scheduled: [],
  };

  for (const c of clients) {
    const anchor = tenureAnchor(c);
    if (!anchor) {
      summary.noAnchor += 1;
      continue;
    }
    const days = daysSinceAnchor(anchor, now);
    const cycle = cycleKeyFromDate(anchor);

    if (days < M1_DURATION_DAYS) {
      summary.m1Clients += 1;
      const createdTypes = [];

      for (const [eventType, tpType] of Object.entries(EVENT_TO_TP)) {
        if (hasType(c.id, tpType)) continue;

        const ev = await firstEvent(c.id, eventType);
        if (!ev) continue;

        const dueAt = ev.occurred_at || nowIso;
        const key = `${c.id}|${tpType}|${cycle}`;
        if (existingKeys.has(key)) continue;

        const row = {
          client_id: c.id,
          touchpoint_type: tpType,
          cycle_key: cycle,
          status: 'open',
          due_at: dueAt,
          triggered_at: nowIso,
          trigger_source: 'event',
          source_ref: ev.id,
          playbook_stage: tpType,
          updated_at: nowIso,
        };
        const r = await upsertTouchpoint(row);
        if (r.created) {
          summary.firstCreated += 1;
          createdTypes.push(tpType);
          existingKeys.add(key);
          existing.push({ client_id: c.id, touchpoint_type: tpType, cycle_key: cycle, status: 'open' });
        }
      }

      if (createdTypes.length) {
        summary.m1Backfilled.push({ name: c.name, days, types: createdTypes });
      } else {
        const existingTypes = existing
          .filter((t) => t.client_id === c.id && t.touchpoint_type.startsWith('first_'))
          .map((t) => t.touchpoint_type);
        summary.m1AlreadyCovered.push({ name: c.name, days, existingTypes });
      }
      continue;
    }

    // Month 2+
    summary.m2Clients += 1;
    const staleOpen = existing.filter(
      (t) =>
        t.client_id === c.id &&
        ['first_lead', 'first_qc', 'first_booking', 'first_show'].includes(t.touchpoint_type) &&
        (t.status === 'open' || t.status === 'snoozed'),
    );
    if (staleOpen.length) {
      const skipped = DRY_RUN ? staleOpen.length : await skipOpenFirstStar(c.id, nowIso);
      summary.firstSkippedStale += skipped;
    }

    const openPulse = existing.find(
      (t) =>
        t.client_id === c.id &&
        t.touchpoint_type === 'm2_biweekly' &&
        (t.status === 'open' || t.status === 'snoozed'),
    );
    if (openPulse) {
      summary.m2Scheduled.push({ name: c.name, days, action: 'already_open' });
      continue;
    }

    const dueIso = nextM2BiweeklyDueIso(anchor, now);
    const biCycle = cycleKeyBiweekly(dueIso);
    const key = `${c.id}|m2_biweekly|${biCycle}`;
    if (existingKeys.has(key)) {
      summary.m2Scheduled.push({ name: c.name, days, action: 'cycle_exists', due: dueIso.slice(0, 10) });
      continue;
    }

    const row = {
      client_id: c.id,
      touchpoint_type: 'm2_biweekly',
      cycle_key: biCycle,
      status: 'open',
      due_at: dueIso,
      triggered_at: nowIso,
      trigger_source: 'schedule',
      source_ref: 'backfill-cs-touchpoints',
      playbook_stage: 'm2_biweekly',
      updated_at: nowIso,
    };
    const r = await upsertTouchpoint(row);
    if (r.created) {
      summary.biweeklyCreated += 1;
      existingKeys.add(key);
      summary.m2Scheduled.push({ name: c.name, days, action: 'created', due: dueIso.slice(0, 10) });
    } else {
      summary.m2Scheduled.push({ name: c.name, days, action: 'exists' });
    }
  }

  console.log('\n--- Summary ---');
  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    m1Clients: summary.m1Clients,
    m2Clients: summary.m2Clients,
    noAnchor: summary.noAnchor,
    firstCreated: summary.firstCreated,
    firstSkippedStale: summary.firstSkippedStale,
    biweeklyCreated: summary.biweeklyCreated,
  }, null, 2));

  console.log('\nM1 backfilled:');
  for (const row of summary.m1Backfilled) {
    console.log(`  ${row.name} (day ${row.days}): ${row.types.join(', ')}`);
  }
  console.log('\nM1 no new first_* (already covered or no events):');
  for (const row of summary.m1AlreadyCovered) {
    console.log(`  ${row.name} (day ${row.days}): ${row.existingTypes.join(', ') || 'none'}`);
  }
  console.log('\nM2 schedule:');
  for (const row of summary.m2Scheduled) {
    console.log(`  ${row.name} (day ${row.days}): ${row.action}${row.due ? ` due ${row.due}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
