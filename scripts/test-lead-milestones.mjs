/**
 * Dry-run add_lead_milestones.sql against production inside a transaction that
 * always aborts, with test leads covering the 15-day trailing rules.
 *
 *   node scripts/test-lead-milestones.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSql } from './lib/supabase-sql.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, '../supabase/migrations/add_lead_milestones.sql'),
  'utf8',
);

const tests = String.raw`
do $test$
declare
  c uuid;
  a uuid; b uuid; cl uuid; d uuid; e uuid;
  la leads; lb leads; lc leads; ld leads; le leads;
  conv_id uuid;
begin
  select id into c from clients order by created_at nulls last limit 1;

  -- A: GHL lead Jun 1, funded Aug 1 through the loan log with same-day fillers
  insert into events (client_id, event_type, occurred_at, ghl_contact_id, lead_phone)
  values (c, 'lead', '2026-06-01T15:00:00Z', 'TEST-MA', '5550200001') returning lead_id into a;
  insert into events (client_id, event_type, occurred_at, ghl_contact_id) values
    (c, 'dial', '2026-06-01T15:10:00Z', 'TEST-MA');
  insert into events (client_id, event_type, occurred_at, ghl_contact_id, raw) values
    (c, 'claimed', '2026-08-01T12:00:00Z', 'TEST-MA', '{"source":"loan_log_form"}'),
    (c, 'proposal_made', '2026-08-01T12:00:00Z', 'TEST-MA', '{"source":"loan_log_form"}'),
    (c, 'submission_made', '2026-08-01T12:00:00Z', 'TEST-MA', '{"source":"loan_log_form","loan_size":300000}');
  insert into events (client_id, event_type, occurred_at, ghl_contact_id, raw)
  values (c, 'loan_funded', '2026-08-01T12:00:00Z', 'TEST-MA', '{"source":"loan_log_form","loan_size":300000}')
  returning id into conv_id;
  insert into loan_deals (client_id, ghl_contact_id, stage, submitted_at, funded_at, loan_size, conversion_event_id)
  values (c, 'TEST-MA', 'funded', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z', 300000, conv_id);

  -- B: lead Jul 25, funded Aug 1 (fill dates clamp to Jul 25)
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'lead', '2026-07-25T15:00:00Z', 'TEST-MB') returning lead_id into b;
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'loan_funded', '2026-08-01T12:00:00Z', 'TEST-MB');

  -- C: appointment Jun 20 with no outcome, real proposal Jul 1
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'lead', '2026-06-01T15:00:00Z', 'TEST-MC') returning lead_id into cl;
  insert into events (client_id, event_type, occurred_at, scheduled_at, external_id, ghl_contact_id)
  values (c, 'appointment_booked', '2026-06-15T12:00:00Z', '2026-06-20T16:00:00Z', 'TEST-APPT-C', 'TEST-MC');
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'proposal_made', '2026-07-01T12:00:00Z', 'TEST-MC');

  -- D: same, but that appointment was a no-show
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'lead', '2026-06-01T15:00:00Z', 'TEST-MD') returning lead_id into d;
  insert into events (client_id, event_type, occurred_at, scheduled_at, external_id, ghl_contact_id) values
    (c, 'appointment_booked', '2026-06-15T12:00:00Z', '2026-06-20T16:00:00Z', 'TEST-APPT-D', 'TEST-MD');
  insert into events (client_id, event_type, occurred_at, external_id, ghl_contact_id) values
    (c, 'no_show', '2026-06-20T17:00:00Z', 'TEST-APPT-D', 'TEST-MD');
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'proposal_made', '2026-07-01T12:00:00Z', 'TEST-MD');

  -- E: real show
  insert into events (client_id, event_type, occurred_at, ghl_contact_id)
  values (c, 'lead', '2026-06-01T15:00:00Z', 'TEST-ME') returning lead_id into e;
  insert into events (client_id, event_type, occurred_at, ghl_contact_id) values
    (c, 'show', '2026-06-10T16:00:00Z', 'TEST-ME'),
    (c, 'submission_made', '2026-07-10T12:00:00Z', 'TEST-ME');

  select * into la from leads where id = a;
  select * into lb from leads where id = b;
  select * into lc from leads where id = cl;
  select * into ld from leads where id = d;
  select * into le from leads where id = e;

  raise exception 'TEST_RESULT %', jsonb_build_object(
    'A_funded', la.funded_at, 'A_submission', la.submission_at, 'A_sub_implied', la.submission_implied,
    'A_proposal', la.proposal_at, 'A_conversation', la.conversation_at, 'A_conv_source', la.conversation_source,
    'B_submission', lb.submission_at, 'B_proposal', lb.proposal_at, 'B_conversation', lb.conversation_at,
    'C_conversation', lc.conversation_at, 'C_conv_source', lc.conversation_source, 'C_prop_implied', lc.proposal_implied,
    'D_conversation', ld.conversation_at, 'D_conv_source', ld.conversation_source,
    'E_conversation', le.conversation_at, 'E_conv_source', le.conversation_source,
    'E_proposal', le.proposal_at, 'E_prop_implied', le.proposal_implied
  );
end
$test$;
`;

try {
  await runSql(`begin;\n${migration}\n${tests}\nrollback;`);
  console.log('Unexpected: transaction did not raise.');
  process.exit(1);
} catch (err) {
  const msg = String(err.message);
  const m = msg.match(/TEST_RESULT (\{.*?\})(?:\\n|"|$)/s);
  if (!m) {
    console.error('Migration or test failed:\n', msg);
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(m[1].replace(/\\"/g, '"')), null, 2));
  const [{ col }] = await runSql(
    "select exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'conversation_at') as col",
  );
  console.log('milestone columns persisted after test:', col);
}
