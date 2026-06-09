/**
 * Verify May 2026 payroll counts vs spreadsheet expectations.
 *
 *   node scripts/verify-payroll-may2026.mjs
 */

import { fetchAll } from './lib/supabase-rest.mjs';

const START = '2026-05-01';
const END = '2026-05-31';
const REPS = ['Bernardo Fabris', 'Luka Faccini'];

function inMay(iso) {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= START && d <= END;
}

function showDate(e) {
  return (e.scheduled_at ?? e.occurred_at ?? '').slice(0, 10);
}

async function main() {
  const agents = await fetchAll(
    '/rest/v1/agents?select=name,base_salary,pay_per_booking,pay_per_show,pay_per_live_transfer',
  );
  const events = await fetchAll(
    `/rest/v1/events?select=agent_name,event_type,occurred_at,scheduled_at` +
      `&agent_name=in.(${REPS.map(encodeURIComponent).join(',')})`,
  );

  const counts = {};
  for (const name of REPS) counts[name] = { bookings: 0, shows: 0, live_transfers: 0 };

  for (const e of events) {
    if (!REPS.includes(e.agent_name)) continue;
    if (e.event_type === 'appointment_booked' && inMay(e.occurred_at)) {
      counts[e.agent_name].bookings++;
    }
    if (e.event_type === 'live_transfer' && inMay(e.occurred_at)) {
      counts[e.agent_name].live_transfers++;
    }
    if (e.event_type === 'show' && inMay(showDate(e))) {
      counts[e.agent_name].shows++;
    }
  }

  const targets = {
    'Luka Faccini': { bookings: '1 booked + up to 3 cancelled w/ booking in DB', shows: 25, transfers: 0 },
    'Bernardo Fabris': { bookings: '3 cancelled booking credits', shows: 22, transfers: 54 },
  };

  console.log('May 2026 Agent Payroll verification\n');
  for (const name of REPS) {
    const c = counts[name];
    const rates = agents.find((a) => a.name === name);
    const total =
      Number(rates?.base_salary ?? 0) +
      c.bookings * Number(rates?.pay_per_booking ?? 0) +
      c.shows * Number(rates?.pay_per_show ?? 0) +
      c.live_transfers * Number(rates?.pay_per_live_transfer ?? 0);
    const t = targets[name];
    console.log(name);
    console.log(`  Bookings:     ${c.bookings}  (sheet: ${t.bookings})`);
    console.log(`  Shows:        ${c.shows}  (sheet: ${t.shows}; Luka missing 4 until truncated links fixed)`);
    console.log(`  Live xfer:    ${c.live_transfers}  (sheet: ${t.transfers})`);
    console.log(`  Total pay @ current rates: $${total.toFixed(2)}`);
    console.log('');
  }

  console.log('Open Admin → Agent Payroll, range May 2026, to review line items.');
  console.log('See data/import/payroll-user-inputs.md for pay rates and blocked rows.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
