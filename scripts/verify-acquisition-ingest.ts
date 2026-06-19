/**
 * Stress-test acquisition webhook payload shapes + KPI date logic.
 * Run: npx tsx scripts/verify-acquisition-ingest.ts
 * Live DB round-trip (creates + deletes test rows): npx tsx scripts/verify-acquisition-ingest.ts --live
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  calendarToAppointmentType,
  GHL_ACQUISITION_LOCATION_ID,
  normalizeApptStatus,
} from '../src/lib/acquisition-config';
import {
  upsertAcquisitionAppointment,
  upsertAcquisitionDial,
  upsertAcquisitionLead,
} from '../src/lib/acquisition-ingest';
import { calculateAcquisitionMetrics } from '../src/lib/acquisition-metrics';

const LIVE = process.argv.includes('--live');
const TEST_CONTACT = `stress-test-${Date.now()}`;
const TEST_APPT = `stress-appt-${Date.now()}`;

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local');
  const fromFile =
    existsSync(envPath)
      ? readFileSync(envPath, 'utf-8')
          .split('\n')
          .filter((line) => line && !line.startsWith('#'))
          .reduce<Record<string, string>>((acc, line) => {
            const [key, ...val] = line.split('=');
            if (key && val.length) acc[key.trim()] = val.join('=').trim();
            return acc;
          }, {})
      : {};
  return { ...fromFile, ...process.env } as Record<string, string>;
}

function testCalendarMapping() {
  assert.equal(calendarToAppointmentType('0ovb9efYBrznUlzxwehn'), 'intro');
  assert.equal(calendarToAppointmentType('71fF0PpCgY8Qv1PqeMFa'), 'demo');
  assert.equal(calendarToAppointmentType(null), 'other');
}

function testStatusNormalization() {
  assert.equal(normalizeApptStatus('Y'), 'showed');
  assert.equal(normalizeApptStatus('showed'), 'showed');
  assert.equal(normalizeApptStatus('N'), 'no_show');
  assert.equal(normalizeApptStatus('noshow'), 'no_show');
  assert.equal(normalizeApptStatus('no-show'), 'no_show');
  assert.equal(normalizeApptStatus('cancelled'), 'cancelled');
  assert.equal(normalizeApptStatus('confirmed'), 'pending');
}

function testKpiDateSplit() {
  const leadId = 'lead-1';
  const metrics = calculateAcquisitionMetrics({
    leads: [{ id: leadId, source: 'Meta', created_at: '2026-06-01T10:00:00Z', qualified: null }],
    appointments: [
      {
        id: 'a1',
        lead_id: leadId,
        appointment_type: 'intro',
        booked_at: '2026-06-02T14:00:00Z',
        scheduled_at: '2026-06-05T18:00:00Z',
        status: 'showed',
        qualified: true,
        setter_name: 'Alex',
      },
      {
        id: 'a2',
        lead_id: leadId,
        appointment_type: 'intro',
        booked_at: '2026-06-03T09:00:00Z',
        scheduled_at: '2026-06-04T18:00:00Z',
        status: 'no_show',
        qualified: null,
        setter_name: 'Alex',
      },
    ],
    offers: [],
    closes: [],
    adSpend: [{ insight_date: '2026-06-01', amount_spent: 500 }],
    from: '2026-06-01',
    to: '2026-06-30',
  });

  assert.equal(metrics.intros_booked, 2, 'booked_at drives booking counts');
  assert.equal(metrics.intros_showed, 1, 'scheduled_at + showed drives show count');
  assert.equal(metrics.intro_show_rate, 50, '1 show / 2 taken place');
}

function samplePayloads() {
  return {
    lead: {
      location_id: GHL_ACQUISITION_LOCATION_ID,
      ghl_contact_id: TEST_CONTACT,
      lead_name: 'Stress Test Lead',
      lead_email: 'stress@example.com',
      lead_phone: '+15551234567',
      source: 'Meta',
      occurred_at: '2026-06-10T12:00:00Z',
      ad_name: 'Test Ad',
      ad_set: 'Test Adset',
    },
    appointmentBooked: {
      location_id: GHL_ACQUISITION_LOCATION_ID,
      external_id: TEST_APPT,
      ghl_contact_id: TEST_CONTACT,
      calendar_id: '0ovb9efYBrznUlzxwehn',
      occurred_at: '2026-06-11T09:00:00Z',
      scheduled_at: '2026-06-15T17:00:00Z',
      agent_name: 'Alex',
      lead_name: 'Stress Test Lead',
      lead_phone: '+15551234567',
    },
    appointmentShowed: {
      location_id: GHL_ACQUISITION_LOCATION_ID,
      external_id: TEST_APPT,
      ghl_contact_id: TEST_CONTACT,
      status: 'showed',
    },
    dial: {
      location_id: GHL_ACQUISITION_LOCATION_ID,
      ghl_contact_id: TEST_CONTACT,
      occurred_at: '2026-06-10T13:00:00Z',
      phone: '+15551234567',
      duration_seconds: 180,
      agent_name: 'Alex',
      outcome: 'completed',
    },
  };
}

async function runLiveRoundTrip() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('Skipping --live: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const service = createClient(url, key);
  const p = samplePayloads();

  const lead = await upsertAcquisitionLead(service, p.lead);
  assert.ok(!('error' in lead), `lead ingest: ${'error' in lead ? lead.error : ''}`);
  assert.ok(!('skipped' in lead), 'lead ingest skipped unexpectedly');

  const booked = await upsertAcquisitionAppointment(service, p.appointmentBooked);
  assert.ok(!('error' in booked), `appt booked: ${'error' in booked ? booked.error : ''}`);

  const { data: afterBooked } = await service
    .from('acquisition_appointments')
    .select('lead_id, appointment_type, booked_at, scheduled_at, status')
    .eq('id', booked.id)
    .single();

  assert.equal(afterBooked?.lead_id, lead.id, 'appointment links to lead via ghl_contact_id');
  assert.equal(afterBooked?.appointment_type, 'intro');
  assert.ok(afterBooked?.booked_at?.startsWith('2026-06-11'), 'booked_at stored');
  assert.ok(afterBooked?.scheduled_at?.startsWith('2026-06-15'), 'scheduled_at stored');

  const showed = await upsertAcquisitionAppointment(service, p.appointmentShowed);
  assert.ok(!('error' in showed), `appt status: ${'error' in showed ? showed.error : ''}`);
  assert.equal(showed.id, booked.id, 'status update upserts same row by ghl_appointment_id');

  const { data: afterShowed } = await service
    .from('acquisition_appointments')
    .select('lead_id, appointment_type, booked_at, scheduled_at, status')
    .eq('id', booked.id)
    .single();

  assert.equal(afterShowed?.status, 'showed');
  assert.ok(afterShowed?.booked_at?.startsWith('2026-06-11'), 'booked_at preserved after status webhook');
  assert.ok(afterShowed?.scheduled_at?.startsWith('2026-06-15'), 'scheduled_at preserved after status webhook');
  assert.equal(afterShowed?.appointment_type, 'intro', 'type preserved when calendar_id omitted');

  const dial = await upsertAcquisitionDial(service, p.dial);
  assert.ok(!('error' in dial), `dial: ${'error' in dial ? dial.error : ''}`);

  const { data: dialRow } = await service
    .from('acquisition_dials')
    .select('lead_id')
    .eq('id', dial.id)
    .single();
  assert.equal(dialRow?.lead_id, lead.id, 'dial links to same lead');

  const { data: leadRow } = await service
    .from('acquisition_leads')
    .select('ad_name, ad_set')
    .eq('id', lead.id)
    .single();
  assert.equal(leadRow?.ad_name, 'Test Ad');
  assert.equal(leadRow?.ad_set, 'Test Adset');

  await service.from('acquisition_calls').delete().eq('lead_id', lead.id);
  await service.from('acquisition_dials').delete().eq('lead_id', lead.id);
  await service.from('acquisition_appointments').delete().eq('id', booked.id);
  await service.from('acquisition_leads').delete().eq('id', lead.id);

  console.log('Live round-trip: lead -> appt booked -> appt showed -> dial (cleaned up)');
}

async function main() {
  testCalendarMapping();
  testStatusNormalization();
  testKpiDateSplit();

  if (LIVE) {
    await runLiveRoundTrip();
  } else {
    console.log('Unit checks passed. Run with --live to round-trip against Supabase.');
  }

  console.log('verify-acquisition-ingest: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
