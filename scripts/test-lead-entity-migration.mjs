/**
 * Dry-run add_lead_entity.sql against production inside a transaction that is
 * always rolled back, then exercise resolve_lead + triggers with test rows.
 * Nothing persists: the DO block raises at the end to abort the transaction.
 *
 *   node scripts/test-lead-entity-migration.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSql } from './lib/supabase-sql.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, '../supabase/migrations/add_lead_entity.sql'),
  'utf8',
);

const tests = String.raw`
do $test$
declare
  c uuid;
  l1 uuid; l2 uuid; l3 uuid; lx uuid;
  e_dial uuid; e_ldr uuid; e_prop uuid; e_g2 uuid; e_claim uuid; e_move uuid; e_conv uuid;
  d_lead uuid;
  out jsonb := '{}';
  lead_row leads;
begin
  select id into c from clients order by created_at nulls last limit 1;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id, lead_phone, lead_name, utm_content, ad_name)
  values (c, 'lead', '2026-06-10T15:00:00Z', 'TEST-G1', '+1 (555) 010-0001', 'Test One', 'ad-A1', 'ad-A1')
  returning lead_id into l1;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'dial', '2026-06-10T15:05:00Z', 'TEST-G1') returning id into e_dial;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id, lead_phone, raw)
  values (c, 'proposal_made', '2026-07-01T12:00:00Z', 'ldr:' || c || ':5550100001', '5550100001', '{"source":"loan_log_form"}')
  returning id into e_ldr;

  insert into events (client_id, event_type, occurred_at, lead_phone)
  values (c, 'submission_made', '2026-07-05T12:00:00Z', '555-010-0001') returning id into e_prop;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id, lead_phone, utm_content)
  values (c, 'lead', '2026-06-12T15:00:00Z', 'TEST-G2', '5550100001', 'ad-B') returning lead_id into l2;

  insert into events (client_id, event_type, occurred_at, lead_phone)
  values (c, 'claimed', '2026-07-06T12:00:00Z', '5550100001') returning lead_id into l3;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id, utm_content)
  values (c, 'show', '2026-07-08T12:00:00Z', 'TEST-G1', 'ad-OTHER');

  insert into events (client_id, event_type, occurred_at, ghl_contact_id, utm_content)
  values (c, 'lead', '2026-05-01T12:00:00Z', 'TEST-G1', 'ad-A0');

  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'loan_funded', '2026-08-01T12:00:00Z', 'TEST-G1') returning id into e_conv;
  insert into loan_deals (client_id, ghl_contact_id, stage, submitted_at, funded_at, loan_size, conversion_event_id)
  values (c, null, 'funded', '2026-07-20T12:00:00Z', '2026-08-01T12:00:00Z', 250000, e_conv)
  returning lead_id into d_lead;

  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'dial', '2026-06-11T12:00:00Z', 'TEST-G1') returning id into e_move;
  update events set ghl_contact_id = 'TEST-G3' where id = e_move;

  select * into lead_row from leads where id = l1;

  out := jsonb_build_object(
    'lead_created', l1 is not null,
    'dial_same_lead', (select lead_id from events where id = e_dial) = l1,
    'ldr_key_same_lead', (select lead_id from events where id = e_ldr) = l1,
    'phone_only_same_lead', (select lead_id from events where id = e_prop) = l1,
    'second_real_ghl_on_shared_phone_is_new_lead', l2 is distinct from l1,
    'shared_phone_review_opened', exists (
      select 1 from lead_identity_reviews where client_id = c and review_key = '5550100001' and reason = 'shared_phone'),
    'ambiguous_phone_only_is_new_lead', l3 is distinct from l1 and l3 is distinct from l2,
    'first_touch_ad_is_earliest_lead_event', lead_row.utm_content = 'ad-A0',
    'lead_created_at_is_earliest_lead', lead_row.lead_created_at = '2026-05-01T12:00:00Z'::timestamptz,
    'first_seen_at', lead_row.first_seen_at,
    'synthetic_identity_attached', exists (
      select 1 from lead_identities where lead_id = l1 and kind = 'synthetic'),
    'loan_deal_inherits_event_lead', d_lead = l1,
    'identity_change_moves_event', (select lead_id from events where id = e_move) is distinct from l1,
    'unknown_ldr_not_identity', clean_lead_contact_id('ldr:x:unknown') is null,
    'phone_norm', normalize_lead_phone('+1 (555) 010-0001'),
    'short_phone_rejected', normalize_lead_phone('12345') is null
  );

  raise exception 'TEST_RESULT %', out;
end
$test$;
`;

const sql = `begin;\n${migration}\n${tests}\nrollback;`;

try {
  await runSql(sql);
  console.log('Unexpected: transaction did not raise.');
  process.exit(1);
} catch (err) {
  const msg = String(err.message);
  const m = msg.match(/TEST_RESULT (\{.*?\})(?:\\n|"|$)/s);
  if (!m) {
    console.error('Migration or test failed:\n', msg);
    process.exit(1);
  }
  const result = JSON.parse(m[1].replace(/\\"/g, '"'));
  console.log(JSON.stringify(result, null, 2));
  const persisted = await runSql("select to_regclass('public.leads') as leads");
  console.log('leads table persisted after test:', persisted[0].leads !== null);
}
