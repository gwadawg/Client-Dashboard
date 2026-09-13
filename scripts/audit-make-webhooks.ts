/**
 * Make → Supabase webhook audit (debug session 717c22).
 * Hits local instrumented server + production for comparison.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LOG_PATH = resolve(ROOT, '.cursor/debug-717c22.log');
const INGEST = 'http://127.0.0.1:7536/ingest/7e0bc9ea-19d3-426a-b894-38657722fc0f';

mkdirSync(dirname(LOG_PATH), { recursive: true });

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const secret = env.ADMIN_WEBHOOK_SECRET!;
const stamp = Date.now();
const CLIENT = 'Community First National Bank';

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const row = {
    sessionId: '717c22',
    runId: 'make-audit',
    hypothesisId,
    location: 'scripts/audit-make-webhooks.ts',
    message,
    data,
    timestamp: Date.now(),
  };
  appendFileSync(LOG_PATH, JSON.stringify(row) + '\n');
  fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '717c22' },
    body: JSON.stringify(row),
  }).catch(() => {});
}

async function post(target: 'local' | 'prod', path: string, body: Record<string, unknown>) {
  const base =
    target === 'local' ? 'http://127.0.0.1:3001' : 'https://wm-os-production.up.railway.app';
  const t0 = Date.now();
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { target, path, status: res.status, ms: Date.now() - t0, json };
}

type Case = {
  id: string;
  hypothesisId: string;
  path?: string;
  body: Record<string, unknown>;
  expectMakeGreen: (r: { status: number; json: unknown }) => boolean;
};

const contact = (suffix: string) => `audit-${stamp}-${suffix}`;

const cases: Case[] = [
  {
    id: 'lead',
    hypothesisId: 'E',
    body: {
      event_type: 'lead',
      client_name: CLIENT,
      ghl_contact_id: contact('lead'),
      lead_name: 'Audit Lead',
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'manual_dq',
    hypothesisId: 'A',
    body: {
      event_type: 'manual_dq',
      client_name: CLIENT,
      ghl_contact_id: contact('dq'),
      dq_reason: 'FICO',
      lead_name: 'Audit DQ',
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'dial',
    hypothesisId: 'D',
    body: {
      event_type: 'dial',
      client_name: CLIENT,
      ghl_contact_id: contact('dial'),
      occurred_at: new Date().toISOString(),
      duration_seconds: 45,
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'appointment_booked',
    hypothesisId: 'E',
    body: {
      event_type: 'appointment_booked',
      client_name: CLIENT,
      ghl_contact_id: contact('book'),
      external_id: `ext-${stamp}-book`,
      occurred_at: new Date().toISOString(),
      scheduled_at: new Date(Date.now() + 864e5).toISOString(),
      lead_name: 'Audit Book',
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'show',
    hypothesisId: 'E',
    body: {
      event_type: 'show',
      client_name: CLIENT,
      ghl_contact_id: contact('show'),
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'no_show',
    hypothesisId: 'E',
    body: {
      event_type: 'no_show',
      client_name: CLIENT,
      ghl_contact_id: contact('noshow'),
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'callback_booked',
    hypothesisId: 'E',
    body: {
      event_type: 'callback_booked',
      client_name: CLIENT,
      ghl_contact_id: contact('cb'),
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'claimed',
    hypothesisId: 'E',
    body: {
      event_type: 'claimed',
      client_name: CLIENT,
      ghl_contact_id: contact('claim'),
      occurred_at: new Date().toISOString(),
      lead_name: 'Audit Claim',
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'proposal_made',
    hypothesisId: 'E',
    body: {
      event_type: 'proposal_made',
      client_name: CLIENT,
      ghl_contact_id: contact('prop'),
      occurred_at: new Date().toISOString(),
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'flags_missing_lead',
    hypothesisId: 'B',
    body: {
      event_type: 'lead',
      client_name: CLIENT,
      ghl_contact_id: contact('flags-missing'),
      update_flags_only: true,
      is_qualified: true,
    },
    // Make-green means 2xx (queued pending is OK)
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'appt_cancel_missing',
    hypothesisId: 'C',
    path: '/api/webhooks/appointment-status',
    body: {
      status: 'cancelled',
      external_id: `missing-${stamp}`,
    },
    expectMakeGreen: r => r.status === 200,
  },
  {
    id: 'not_synced_dial',
    hypothesisId: 'E',
    body: {
      event_type: 'dial',
      client_name: 'Not Synced',
      ghl_contact_id: contact('nosync'),
      occurred_at: new Date().toISOString(),
      duration_seconds: 10,
    },
    expectMakeGreen: r => r.status === 200,
  },
];

async function main() {
  const summary: Record<string, unknown>[] = [];

  for (const target of ['local', 'prod'] as const) {
    for (const c of cases) {
      const path = c.path ?? '/api/webhooks';
      let result: Awaited<ReturnType<typeof post>>;
      try {
        result = await post(target, path, c.body);
      } catch (e) {
        result = {
          target,
          path,
          status: 0,
          ms: 0,
          json: { error: String(e) },
        };
      }
      const green = c.expectMakeGreen(result);
      const row = {
        case: c.id,
        target,
        status: result.status,
        ms: result.ms,
        green,
        body:
          typeof result.json === 'object' && result.json
            ? {
                error: (result.json as { error?: string }).error ?? null,
                pending: (result.json as { pending?: boolean }).pending ?? null,
                skipped: (result.json as { skipped?: boolean }).skipped ?? null,
                got: (result.json as { got?: string }).got ?? null,
                success: (result.json as { success?: boolean }).success ?? null,
              }
            : { raw: String(result.json).slice(0, 120) },
      };
      summary.push(row);
      log(c.hypothesisId, `case_${c.id}_${target}`, row);
      console.log(
        `${target.padEnd(5)} ${c.id.padEnd(22)} status=${result.status} ms=${result.ms} green=${green}`,
      );
    }
  }

  const localFails = summary.filter(s => s.target === 'local' && !s.green);
  const prodFails = summary.filter(s => s.target === 'prod' && !s.green);
  log('SUMMARY', 'audit_complete', {
    local_fail_count: localFails.length,
    prod_fail_count: prodFails.length,
    local_fails: localFails.map(s => s.case),
    prod_fails: prodFails.map(s => s.case),
  });
  console.log('\nLOCAL FAILS', localFails.map(s => s.case));
  console.log('PROD FAILS', prodFails.map(s => s.case));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
