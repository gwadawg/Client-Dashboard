import { readFileSync } from 'fs';
import { parseCsv } from './csv.mjs';
import {
  buildLeadId,
  clientNameFromLocation,
  emptyEventRow,
  extractGhlContactId,
  extractGhlLocationId,
  isTruncatedContactId,
  normalizePhone,
  parseDateDMY,
  parseDateMDY,
} from './waiz-import-helpers.mjs';

export const PAY_PERIOD = { start: '2026-05-01', end: '2026-05-31' };
export const REPS = {
  luka: 'Luka Faccini',
  bernardo: 'Bernardo Fabris',
};

const BAD_AGENTS = new Set(['', '#N/A', '#n/a', null, undefined]);

export function inPayPeriod(dateStr) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= PAY_PERIOD.start && d <= PAY_PERIOD.end;
}

function dateOnly(iso) {
  return iso?.slice(0, 10) ?? null;
}

function showPayDate(event) {
  return dateOnly(event.scheduled_at) ?? dateOnly(event.raw?.recorded_at) ?? dateOnly(event.occurred_at);
}

function tableToObjects(table) {
  const [headers, ...rows] = table;
  return rows.map((row) => {
    const o = {};
    headers.forEach((h, i) => {
      o[h.trim()] = (row[i] ?? '').trim();
    });
    return o;
  });
}

export function loadLukaRows(csvPath) {
  const table = parseCsv(readFileSync(csvPath, 'utf-8'));
  return tableToObjects(table).map((r, i) => ({
    sheet: 'luka',
    row_num: i + 2,
    rep: REPS.luka,
    name: r.Name ?? '',
    phone: r.Phone ?? '',
    status: (r.Status ?? '').trim(),
    chargeback: (r.Chargeback ?? '').trim().toUpperCase() === 'YES',
    date_raw: (r['Appointment Date'] ?? '').trim(),
    link: r.Link ?? '',
    lo_agent: (r.Agent ?? '').trim(),
  }));
}

export function loadBernardoRows(csvPath) {
  const table = parseCsv(readFileSync(csvPath, 'utf-8'));
  return tableToObjects(table).map((r, i) => ({
    sheet: 'bernardo',
    row_num: i + 2,
    rep: REPS.bernardo,
    name: r.Name ?? '',
    phone: r.Phone ?? '',
    status: (r.Status ?? '').trim(),
    chargeback: false,
    date_raw: (r.Date ?? '').trim(),
    link: r.Link ?? '',
    source: (r.Source ?? '').trim(),
    on_waizboard: (r['On Waizboard'] ?? '').trim(),
  }));
}

/** @returns {{ bucket, payableTypes, eventTypes, sheetDateIso }} */
export function classifyRow(row) {
  const contactId = extractGhlContactId(row.link);
  if (isTruncatedContactId(contactId)) {
    return { bucket: 'truncated_link', payableTypes: [], eventTypes: [], sheetDateIso: null };
  }

  if (row.chargeback) {
    return { bucket: 'excluded', payableTypes: [], eventTypes: [], sheetDateIso: null, reason: 'chargeback' };
  }

  const status = row.status.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!status) {
    return { bucket: 'manual_review', payableTypes: [], eventTypes: [], sheetDateIso: null, reason: 'blank_status' };
  }

  const sheetDateIso =
    row.sheet === 'luka'
      ? parseDateMDY(row.date_raw)
      : parseDateDMY(row.date_raw) ?? parseDateMDY(row.date_raw);

  if (status === 'bailed') {
    return { bucket: 'excluded', payableTypes: [], eventTypes: [], sheetDateIso, reason: 'bailed' };
  }
  if (status === 'no show') {
    return { bucket: 'excluded', payableTypes: [], eventTypes: ['no_show'], sheetDateIso, reason: 'no_show' };
  }
  if (status === 'cancelled') {
    return {
      bucket: 'booking_only',
      payableTypes: ['booking'],
      eventTypes: ['appointment_booked'],
      sheetDateIso,
      reason: 'cancelled_may_still_owe_booking',
    };
  }
  if (status === 'showed') {
    return { bucket: 'payable', payableTypes: ['show'], eventTypes: ['show'], sheetDateIso };
  }
  if (status === 'booked') {
    return { bucket: 'payable', payableTypes: ['booking'], eventTypes: ['appointment_booked'], sheetDateIso };
  }
  if (status === 'livetransfer') {
    return { bucket: 'payable', payableTypes: ['live_transfer'], eventTypes: ['live_transfer'], sheetDateIso };
  }

  return { bucket: 'manual_review', payableTypes: [], eventTypes: [], sheetDateIso, reason: `unknown_status:${row.status}` };
}

function agentNeedsCredit(current, rep) {
  if (!current || BAD_AGENTS.has(current)) return true;
  return current !== rep;
}

function pickEventForType(events, eventType, sheetDateIso) {
  const typed = events.filter((e) => e.event_type === eventType);
  if (!typed.length) return null;

  if (eventType === 'show') {
    const inMay = typed.filter((e) => inPayPeriod(showPayDate(e)));
    if (sheetDateIso) {
      const want = sheetDateIso.slice(0, 10);
      const byDate = inMay.find((e) => showPayDate(e) === want);
      if (byDate) return byDate;
    }
    return inMay[0] ?? typed[0];
  }

  if (eventType === 'live_transfer') {
    const inMay = typed.filter((e) => inPayPeriod(e.occurred_at));
    return inMay[0] ?? typed[0];
  }

  if (eventType === 'appointment_booked') {
    const inMay = typed.filter((e) => inPayPeriod(e.occurred_at));
    if (sheetDateIso) {
      const want = sheetDateIso.slice(0, 10);
      const byDate = inMay.find((e) => dateOnly(e.occurred_at) === want);
      if (byDate) return byDate;
    }
    return inMay[0] ?? typed[0];
  }

  return typed[0];
}

function payDateForEvent(event, eventType) {
  if (eventType === 'show') return showPayDate(event);
  return event.occurred_at;
}

export function reconcileRow(row, eventsByContact) {
  const contactId = extractGhlContactId(row.link);
  const locationId = extractGhlLocationId(row.link);
  const classification = classifyRow(row);
  const base = {
    sheet: row.sheet,
    row_num: row.row_num,
    rep: row.rep,
    name: row.name,
    phone: row.phone,
    status: row.status,
    contact_id: contactId,
    location_id: locationId,
    classification: classification.bucket,
    reason: classification.reason ?? null,
    payable_types: classification.payableTypes,
  };

  if (classification.bucket === 'truncated_link') {
    return { ...base, actions: [], client_name: clientNameFromLocation(locationId) };
  }
  if (classification.bucket === 'excluded' || classification.bucket === 'manual_review') {
    return { ...base, actions: [], client_name: clientNameFromLocation(locationId) };
  }

  const events = eventsByContact.get(contactId) ?? [];
  const clientFromEvents = events[0]?.clients?.name ?? null;
  const client_name = clientFromEvents ?? clientNameFromLocation(locationId);

  const actions = [];
  const typesToProcess =
    classification.bucket === 'booking_only'
      ? ['appointment_booked']
      : classification.eventTypes;

  for (const eventType of typesToProcess) {
    const existing = pickEventForType(events, eventType, classification.sheetDateIso);
    if (existing) {
      const payDate = payDateForEvent(existing, eventType);
      if (!inPayPeriod(payDate)) {
        actions.push({
          action: 'out_of_period',
          event_type: eventType,
          event_id: existing.id,
          pay_date: payDate,
          current_agent: existing.agent_name,
        });
        continue;
      }
      if (agentNeedsCredit(existing.agent_name, row.rep)) {
        actions.push({
          action: 'credit_agent',
          event_type: eventType,
          event_id: existing.id,
          pay_date: payDate,
          current_agent: existing.agent_name,
          new_agent: row.rep,
        });
      } else {
        actions.push({
          action: 'ok',
          event_type: eventType,
          event_id: existing.id,
          pay_date: payDate,
          current_agent: existing.agent_name,
        });
      }
    } else {
      if (classification.bucket === 'booking_only') {
        actions.push({
          action: 'no_booking_found',
          event_type: eventType,
          pay_date: classification.sheetDateIso,
          client_name,
        });
        continue;
      }
      let occurredAt = classification.sheetDateIso;
      if (eventType === 'live_transfer' && !occurredAt) {
        occurredAt = null;
      }
      actions.push({
        action: 'insert_event',
        event_type: eventType,
        pay_date: occurredAt,
        client_name,
        new_agent: row.rep,
      });
    }
  }

  return { ...base, actions, client_name };
}

export function buildInsertRow(reconcileRow, action) {
  const ev = emptyEventRow();
  ev.event_type = action.event_type;
  ev.client_name = action.client_name ?? reconcileRow.client_name ?? '';
  ev.agent_name = reconcileRow.rep;
  ev.lead_name = reconcileRow.name;
  ev.lead_phone = normalizePhone(reconcileRow.phone) || reconcileRow.phone;
  ev.ghl_contact_id = reconcileRow.contact_id;
  const occurred = action.pay_date ?? `${PAY_PERIOD.start}T12:00:00.000Z`;
  ev.occurred_at = occurred;
  ev.lead_id = buildLeadId(ev.client_name, ev.lead_phone, ev.ghl_contact_id, ev.lead_name, occurred);
  if (action.event_type === 'show') {
    ev.scheduled_at = occurred;
  }
  ev.raw_json = JSON.stringify({
    source: 'payroll_backfill_may2026',
    sheet: reconcileRow.sheet,
    row_num: reconcileRow.row_num,
  });
  return ev;
}

export function summarizeResults(results) {
  const counts = {
    total_rows: results.length,
    truncated_link: 0,
    excluded: 0,
    manual_review: 0,
    credit_agent: 0,
    insert_event: 0,
    out_of_period: 0,
    ok: 0,
    payable_show: 0,
    payable_booking: 0,
    payable_live_transfer: 0,
  };

  for (const r of results) {
    if (r.classification === 'truncated_link') counts.truncated_link++;
    if (r.classification === 'excluded') counts.excluded++;
    if (r.classification === 'manual_review') counts.manual_review++;
    for (const a of r.actions) {
      counts[a.action] = (counts[a.action] ?? 0) + 1;
      if (a.action !== 'ok' && a.action !== 'out_of_period') {
        if (a.event_type === 'show') counts.payable_show++;
        if (a.event_type === 'appointment_booked') counts.payable_booking++;
        if (a.event_type === 'live_transfer') counts.payable_live_transfer++;
      }
      if (a.action === 'ok') {
        if (a.event_type === 'show') counts.payable_show++;
        if (a.event_type === 'appointment_booked') counts.payable_booking++;
        if (a.event_type === 'live_transfer') counts.payable_live_transfer++;
      }
    }
  }
  return counts;
}

export function formatReportText(results, counts) {
  const lines = [
    'May 2026 Payroll Reconciliation',
    `Period: ${PAY_PERIOD.start} → ${PAY_PERIOD.end}`,
    '',
    'Summary:',
    `  Total sheet rows: ${counts.total_rows}`,
    `  Truncated links (need full URL): ${counts.truncated_link}`,
    `  Excluded (chargeback/bailed/no-show): ${counts.excluded}`,
    `  Manual review: ${counts.manual_review}`,
    `  Credit agent (UPDATE): ${counts.credit_agent}`,
    `  Insert missing event: ${counts.insert_event}`,
    `  Out of period: ${counts.out_of_period}`,
    `  Already OK: ${counts.ok}`,
    '',
    'Payable event targets (ok + credit + insert):',
    `  Shows: ${counts.payable_show}`,
    `  Bookings: ${counts.payable_booking}`,
    `  Live transfers: ${counts.payable_live_transfer}`,
    '',
  ];

  for (const bucket of ['truncated_link', 'manual_review', 'excluded']) {
    const rows = results.filter((r) => r.classification === bucket);
    if (!rows.length) continue;
    lines.push(`--- ${bucket} (${rows.length}) ---`);
    for (const r of rows) {
      lines.push(`  [${r.sheet} row ${r.row_num}] ${r.name} | ${r.status} | ${r.reason ?? ''}`);
    }
    lines.push('');
  }

  const actionRows = results.filter((r) => r.actions.some((a) => a.action === 'credit_agent' || a.action === 'insert_event'));
  lines.push(`--- credit_agent + insert_event (${actionRows.length} rows) ---`);
  for (const r of actionRows.slice(0, 50)) {
    for (const a of r.actions) {
      if (a.action === 'credit_agent' || a.action === 'insert_event') {
        lines.push(
          `  [${r.sheet} row ${r.row_num}] ${r.name} → ${a.action} ${a.event_type} ${a.event_id ?? ''} agent→${r.rep}`,
        );
      }
    }
  }
  if (actionRows.length > 50) lines.push(`  ... and ${actionRows.length - 50} more rows`);

  return lines.join('\n');
}
