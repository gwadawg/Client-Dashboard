/**
 * Waiz **Appt1** CSV → `07_events_appts.csv`
 *
 * Showed?: Y → show, N → no_show, X → lo_bailed (partner LO did not show; not lead no-show).
 *
 *   node scripts/transform-appts-csv.mjs "/path/to/Appt1.csv"
 */

import { mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';
import {
  buildLeadId,
  colIndex,
  combineApptDateTime,
  emptyEventRow,
  extractGhlContactId,
  EVENT_IMPORT_HEADERS,
  getCell,
  normalizePhone,
  parseDateMDY,
  parseDateTimeFlexible,
} from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
mkdirSync(OUT_DIR, { recursive: true });

const argvRest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INPUT =
  argvRest[0] ??
  resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Appt1.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  dateBooked: colIndex(headers, 'Date Appointment Created', 'date_appointment_created'),
  dateAppt: colIndex(headers, 'Date of Appointment', 'date_of_appointment'),
  requestedTime: colIndex(headers, 'Requested Time', 'requested_time'),
  project: colIndex(headers, 'Project Name', 'project_name'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  leadEmail: colIndex(headers, 'Lead Email', 'lead_email'),
  leadPhone: colIndex(headers, 'Lead Phone Number', 'lead_phone_number', 'Phone Number'),
  calendar: colIndex(headers, 'Calendar Name', 'calendar_name'),
  stage: colIndex(headers, 'Stage Booked', 'stage_booked'),
  showed: colIndex(headers, 'Showed?', 'showed'),
  agent: colIndex(headers, 'Agent', 'agent'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
  adSet: colIndex(headers, 'Ad Set Name', 'ad_set_name'),
  adName: colIndex(headers, 'Ad Name', 'ad_name'),
  externalId: colIndex(headers, 'Appointment Id', 'external_id', 'GHL Appointment ID'),
};

const events = [];

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.project);
  if (!client_name) continue;

  const lead_name = get(C.leadName);
  const lead_phone_raw = get(C.leadPhone);
  const lead_phone = normalizePhone(lead_phone_raw) || lead_phone_raw;
  const lead_email = get(C.leadEmail);
  const ghl = extractGhlContactId(get(C.link));
  const bookedAt =
    parseDateTimeFlexible(get(C.dateBooked)) ?? parseDateMDY(get(C.dateBooked));
  if (!bookedAt) continue;

  const scheduled_at =
    combineApptDateTime(get(C.dateAppt), get(C.requestedTime)) ??
    parseDateTimeFlexible(get(C.requestedTime));
  const lead_id = buildLeadId(client_name, lead_phone_raw, ghl, lead_name, bookedAt);

  const baseRaw = {
    source: 'appt1',
    ad_name: get(C.adName),
    ad_set_name: get(C.adSet),
    calendar_name: get(C.calendar),
    stage_booked: get(C.stage),
  };

  const ext = get(C.externalId);

  const booked = emptyEventRow();
  booked.event_type = 'appointment_booked';
  booked.client_name = client_name;
  booked.occurred_at = bookedAt;
  booked.ghl_contact_id = ghl || lead_id;
  booked.lead_id = lead_id;
  booked.lead_name = lead_name;
  booked.lead_phone = lead_phone;
  booked.lead_email = lead_email;
  booked.scheduled_at = scheduled_at ?? '';
  booked.external_id = ext;
  booked.calendar_name = get(C.calendar);
  booked.stage_booked = get(C.stage);
  booked.agent_name = get(C.agent);
  booked.raw_json = JSON.stringify(baseRaw);
  events.push(booked);

  const showedRaw = get(C.showed).toUpperCase();
  if (showedRaw === '') continue;

  const outcomeAt = scheduled_at ?? parseDateMDY(get(C.dateAppt)) ?? bookedAt;
  let outcomeType = '';
  if (showedRaw === 'Y') outcomeType = 'show';
  else if (showedRaw === 'N') outcomeType = 'no_show';
  else if (showedRaw === 'X') outcomeType = 'lo_bailed';

  if (!outcomeType) continue;

  const ev = emptyEventRow();
  ev.event_type = outcomeType;
  ev.client_name = client_name;
  ev.occurred_at = outcomeAt;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name;
  ev.lead_phone = lead_phone;
  ev.lead_email = lead_email;
  ev.scheduled_at = scheduled_at ?? '';
  ev.external_id = ext;
  ev.calendar_name = get(C.calendar);
  ev.stage_booked = get(C.stage);
  ev.agent_name = get(C.agent);
  ev.raw_json = JSON.stringify({ ...baseRaw, showed: get(C.showed) });
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '07_events_appts.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`Appt1 rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/07_events_appts.csv`);
