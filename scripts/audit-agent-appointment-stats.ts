/**
 * Stress-test + reconcile agent appointment stats (booking-outcome model).
 *
 *   npx tsx scripts/audit-agent-appointment-stats.ts
 *   npx tsx scripts/audit-agent-appointment-stats.ts --start 2026-06-01 --end 2026-06-18
 *
 * Validates:
 * - Pure-function unit cases (outcome matching, count invariants)
 * - Live DB: booking-linked shows vs legacy raw show events per agent
 * - KPI ↔ activity-log parity for each agent (same shared module)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  countsAreConsistent,
  countLegacyOutcomeEvents,
  enrichBookingsWithOutcomes,
  emptyOutcomeCounts,
  fetchEnrichedBookingsInRange,
  grossShowRate,
  incrementOutcomeCount,
  outcomeSummaryFromRows,
  summarizeOutcomesByAgent,
  type AgentAppointmentOutcomeCounts,
} from '../src/lib/agent-appointment-stats';
import { buildRosterMatcher } from '../src/lib/agent-roster';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '../.env.local');
  try {
    return readFileSync(envPath, 'utf-8')
      .split('\n')
      .filter(line => line && !line.trim().startsWith('#'))
      .reduce<Record<string, string>>((acc, line) => {
        const i = line.indexOf('=');
        if (i < 0) return acc;
        acc[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        return acc;
      }, {});
  } catch {
    return {};
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const startIdx = args.indexOf('--start');
  const endIdx = args.indexOf('--end');
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultEnd = now.toISOString().slice(0, 10);
  return {
    startDate: startIdx >= 0 ? args[startIdx + 1] : defaultStart,
    endDate: endIdx >= 0 ? args[endIdx + 1] : defaultEnd,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function runUnitTests() {
  console.log('\n── Unit tests (in-memory) ──');

  const bookings = [
    {
      id: 'b1',
      external_id: 'appt-1',
      ghl_contact_id: 'contact-1',
      scheduled_at: '2026-06-10T15:00:00.000Z',
      agent_name: 'Alice Setter',
      occurred_at: '2026-06-01T12:00:00.000Z',
      calendar_name: null,
      lead_name: 'Lead One',
      lead_phone: null,
      lead_email: null,
    },
    {
      id: 'b2',
      external_id: 'appt-2',
      ghl_contact_id: 'contact-2',
      scheduled_at: '2026-06-12T15:00:00.000Z',
      agent_name: 'Alice Setter',
      occurred_at: '2026-06-02T12:00:00.000Z',
      calendar_name: null,
      lead_name: 'Lead Two',
      lead_phone: null,
      lead_email: null,
    },
    {
      id: 'b3',
      external_id: null,
      ghl_contact_id: 'contact-3',
      scheduled_at: '2026-06-14T15:00:00.000Z',
      agent_name: 'Bob Setter',
      occurred_at: '2026-06-03T12:00:00.000Z',
      calendar_name: null,
      lead_name: 'Lead Three',
      lead_phone: null,
      lead_email: null,
    },
  ] satisfies Parameters<typeof enrichBookingsWithOutcomes>[0];

  const outcomes = [
    {
      id: 'o1',
      event_type: 'show',
      external_id: 'appt-1',
      ghl_contact_id: 'contact-1',
      scheduled_at: '2026-06-10T15:00:00.000Z',
      raw: { appointment_event_id: 'b1' },
    },
    {
      id: 'o2',
      event_type: 'no_show',
      external_id: 'appt-2',
      ghl_contact_id: 'contact-2',
      scheduled_at: '2026-06-12T15:00:00.000Z',
      raw: null,
    },
  ];

  const enriched = enrichBookingsWithOutcomes(bookings, outcomes);
  assert(enriched[0]?.status === 'show', 'external_id show match');
  assert(enriched[1]?.status === 'no_show', 'no_show match');
  assert(enriched[2]?.status === 'pending', 'missing outcome = pending');

  const resolveAgent = buildRosterMatcher([
    { name: 'Alice Setter', phone: '111' },
    { name: 'Bob Setter', phone: '222' },
  ]);
  const byAgent = summarizeOutcomesByAgent(enriched, resolveAgent);
  const alice = byAgent.get('Alice Setter')!;
  assert(alice.appointments === 2, 'alice appointment count');
  assert(alice.shows === 1 && alice.no_shows === 1, 'alice show/no_show');
  assert(countsAreConsistent(alice), 'alice counts consistent');
  assert(grossShowRate(alice) === 50, 'alice gross show rate');

  const summary = outcomeSummaryFromRows(enriched.filter(r => resolveAgent(r.agent_name) === 'Alice Setter'));
  assert(summary.shows === alice.shows && summary.appointments === alice.appointments, 'summary parity');

  const manual = emptyOutcomeCounts();
  for (const row of enriched.filter(r => resolveAgent(r.agent_name) === 'Alice Setter')) {
    incrementOutcomeCount(manual, row.status);
  }
  assert(manual.shows === alice.shows, 'incrementOutcomeCount parity');

  console.log('  ✓ outcome enrichment + agent aggregation + invariants');
}

async function runLiveAudit(startDate: string, endDate: string) {
  console.log(`\n── Live audit (${startDate} → ${endDate}) ──`);

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('  ⚠ Skipping live audit — no .env.local with Supabase credentials');
    return;
  }

  const service = createClient(url, key, { auth: { persistSession: false } });
  const t0 = performance.now();

  const [{ data: roster }, enriched] = await Promise.all([
    service.from('agents').select('name, phone').order('name'),
    fetchEnrichedBookingsInRange(service, startDate, endDate),
  ]);

  const resolveAgent = buildRosterMatcher(roster ?? []);
  const outcomeByAgent = summarizeOutcomesByAgent(enriched, resolveAgent);

  let eventsQuery = service
    .from('events')
    .select('event_type, agent_name')
    .in('event_type', ['show', 'no_show']);
  eventsQuery = eventsQuery.gte('occurred_at', `${startDate}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${endDate}T23:59:59.999Z`);
  const { data: legacyEvents, error } = await eventsQuery;
  if (error) throw new Error(error.message);

  const legacyByAgent = countLegacyOutcomeEvents(legacyEvents ?? [], resolveAgent);

  const agents = (roster ?? []).map(a => a.name);
  let inconsistentAgents = 0;
  let legacyMismatchAgents = 0;
  let maxLegacyGap = { agent: '', shows: 0, legacy: 0, bookingLinked: 0 };

  console.log('\n  Agent                    Booked  Show  NoShow  Pend  LegacyShow  Δ(show)');
  console.log('  ' + '-'.repeat(72));

  for (const name of agents) {
    const counts: AgentAppointmentOutcomeCounts = outcomeByAgent.get(name) ?? emptyOutcomeCounts();
    if (counts.appointments === 0 && !legacyByAgent.has(name)) continue;

    if (!countsAreConsistent(counts)) {
      inconsistentAgents++;
      console.log(`  ⚠ INCONSISTENT buckets: ${name}`);
    }

    const legacy = legacyByAgent.get(name) ?? { shows: 0, no_shows: 0 };
    const showDelta = counts.shows - legacy.shows;
    if (showDelta !== 0) {
      legacyMismatchAgents++;
      if (Math.abs(showDelta) > Math.abs(maxLegacyGap.shows - maxLegacyGap.bookingLinked)) {
        maxLegacyGap = { agent: name, shows: showDelta, legacy: legacy.shows, bookingLinked: counts.shows };
      }
    }

    console.log(
      `  ${name.padEnd(24)} ${String(counts.appointments).padStart(5)}  ${String(counts.shows).padStart(4)}  ${String(counts.no_shows).padStart(6)}  ${String(counts.pending).padStart(4)}  ${String(legacy.shows).padStart(10)}  ${String(showDelta).padStart(6)}`,
    );
  }

  const elapsed = Math.round(performance.now() - t0);
  console.log(`\n  Loaded ${enriched.length} bookings in ${elapsed}ms`);
  console.log(`  Agents with legacy show Δ ≠ 0: ${legacyMismatchAgents} (expected — legacy counts outcome event dates)`);
  console.log(`  Agents with inconsistent buckets: ${inconsistentAgents}`);

  if (inconsistentAgents > 0) {
    throw new Error(`${inconsistentAgents} agent(s) failed count invariant — booking buckets must sum to appointments`);
  }

  if (legacyMismatchAgents > 0) {
    console.log(
      `  Largest show gap: ${maxLegacyGap.agent} — booking-linked=${maxLegacyGap.bookingLinked}, legacy raw=${maxLegacyGap.legacy} (Δ=${maxLegacyGap.shows})`,
    );
    console.log('  ✓ Booking-outcome model is internally consistent; legacy raw-event counts intentionally differ.');
  } else {
    console.log('  ✓ Legacy and booking-linked show counts align for this range (unusual but OK).');
  }
}

async function main() {
  const { startDate, endDate } = parseArgs();
  console.log('Agent appointment stats audit');
  runUnitTests();
  await runLiveAudit(startDate, endDate);
  console.log('\nAudit passed.\n');
}

main().catch(err => {
  console.error('\nAudit FAILED:', err.message ?? err);
  process.exit(1);
});
