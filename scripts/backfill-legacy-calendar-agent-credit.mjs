/**
 * Backfill agent_name on legacy calendar bookings from the last roster dial before the appointment.
 *
 * Targets Call Center Booking Calendar + AI Booking Calendar rows where agent is null/empty/#N/A
 * and a prior dial exists from a current agents-table roster member.
 *
 *   node scripts/backfill-legacy-calendar-agent-credit.mjs           # dry-run
 *   node scripts/backfill-legacy-calendar-agent-credit.mjs --apply   # write updates
 */

import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fetchAll, supabaseRequest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const OUT = resolve(__dirname, '../data/import/legacy-calendar-agent-credit-backfill.json');

const CALENDARS = ['Call Center Booking Calendar', 'AI Booking Calendar'];

async function loadRosterNames() {
  const agents = await fetchAll('/rest/v1/agents?select=name&order=name');
  const names = agents.map(a => a.name?.trim()).filter(Boolean);
  if (names.length === 0) throw new Error('No agents found in roster');
  return names;
}

async function loadCandidates(rosterNames) {
  const calendarFilter = CALENDARS.map(c => encodeURIComponent(`"${c}"`)).join(',');
  const rosterFilter = rosterNames.map(n => encodeURIComponent(`"${n}"`)).join(',');

  const path =
    `/rest/v1/events?select=id,client_id,event_type,calendar_name,lead_name,occurred_at,agent_name,ghl_contact_id,clients(name)` +
    `&event_type=eq.appointment_booked` +
    `&calendar_name=in.(${calendarFilter})` +
    `&or=(agent_name.is.null,agent_name.eq.,agent_name.eq.${encodeURIComponent('#N/A')})` +
    `&order=occurred_at.desc`;

  const appointments = await fetchAll(path);
  const updates = [];

  for (const appt of appointments) {
    if (!appt.ghl_contact_id) continue;

    const dialPath =
      `/rest/v1/events?select=agent_name,occurred_at` +
      `&event_type=eq.dial` +
      `&client_id=eq.${appt.client_id}` +
      `&ghl_contact_id=eq.${encodeURIComponent(appt.ghl_contact_id)}` +
      `&occurred_at=lte.${encodeURIComponent(appt.occurred_at)}` +
      `&agent_name=in.(${rosterFilter})` +
      `&order=occurred_at.desc` +
      `&limit=1`;

    const dials = await fetchAll(dialPath);
    const dial = dials[0];
    if (!dial?.agent_name) continue;

    updates.push({
      id: appt.id,
      lead_name: appt.lead_name,
      client_name: appt.clients?.name ?? null,
      calendar_name: appt.calendar_name,
      occurred_at: appt.occurred_at,
      previous_agent_name: appt.agent_name,
      agent_name: dial.agent_name,
      dial_at: dial.occurred_at,
    });
  }

  return updates;
}

async function applyUpdates(updates) {
  let applied = 0;
  for (const row of updates) {
    await supabaseRequest('PATCH', `/rest/v1/events?id=eq.${row.id}`, {
      agent_name: row.agent_name,
    });
    applied++;
  }
  return applied;
}

const rosterNames = await loadRosterNames();
const updates = await loadCandidates(rosterNames);

const summary = {
  generated_at: new Date().toISOString(),
  apply: APPLY,
  roster: rosterNames,
  calendars: CALENDARS,
  match_count: updates.length,
  updates,
};

writeFileSync(OUT, JSON.stringify(summary, null, 2));

console.log(`Roster: ${rosterNames.join(', ')}`);
console.log(`Matched ${updates.length} appointment(s) via last roster dial`);
console.log(`Preview written to ${OUT}`);

if (!APPLY) {
  console.log('Dry run only. Re-run with --apply to update agent_name in Supabase.');
  process.exit(0);
}

const applied = await applyUpdates(updates);
console.log(`Applied ${applied} update(s).`);
