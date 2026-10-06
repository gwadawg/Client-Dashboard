/**
 * Apply the lead entity to production and backfill lead_id.
 *
 *   node scripts/apply-lead-entity.mjs snapshot   # fingerprint every events / loan_deals row
 *   node scripts/apply-lead-entity.mjs migrate    # add_lead_entity.sql + concurrent indexes
 *   node scripts/apply-lead-entity.mjs backfill   # link all unlinked events + loan_deals (re-runnable)
 *   node scripts/apply-lead-entity.mjs verify     # prove history unchanged except lead_id
 *
 * Rollback (if ever needed): drop the triggers, `update events set lead_id = null`,
 * drop column lead_id on events / loan_deals, drop the lead tables.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSql } from './lib/supabase-sql.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '../supabase/migrations');
const SNAPSHOT = 'lead_backfill_snapshot_20261002';

async function snapshot() {
  const [{ exists }] = await runSql(`select to_regclass('public.${SNAPSHOT}') is not null as exists`);
  if (exists) {
    console.log(`${SNAPSHOT} already exists — keeping the original fingerprint.`);
    return;
  }
  await runSql(`
    create table ${SNAPSHOT} as
      select 'events'::text as tbl, e.id, md5((to_jsonb(e) - 'lead_id')::text) as h
      from events e
      union all
      select 'loan_deals', d.id, md5((to_jsonb(d) - 'lead_id')::text)
      from loan_deals d;
    alter table ${SNAPSHOT} add primary key (tbl, id);
    alter table ${SNAPSHOT} enable row level security;
  `);
  const rows = await runSql(`select tbl, count(*)::int as n from ${SNAPSHOT} group by tbl order by tbl`);
  console.log('Snapshot rows:', JSON.stringify(rows));
}

async function migrate() {
  const sql = readFileSync(resolve(migrationsDir, 'add_lead_entity.sql'), 'utf8');
  await runSql(`begin;\n${sql}\ncommit;`);
  console.log('add_lead_entity.sql applied');

  const idx = readFileSync(resolve(migrationsDir, 'add_lead_entity_indexes.sql'), 'utf8')
    .split(';')
    .map(s => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);
  for (const stmt of idx) {
    await runSql(stmt);
    console.log('ok:', stmt.split('\n')[0]);
  }
}

async function backfill() {
  const clients = await runSql(`
    select client_id::text as id, count(*)::int as n
    from events where lead_id is null
    group by client_id order by n desc
  `);
  console.log(`${clients.length} clients with unlinked events`);
  let total = 0;
  for (const c of clients) {
    let linked = 0;
    for (;;) {
      const [{ n }] = await runSql(`select public.backfill_event_leads('${c.id}'::uuid, 4000) as n`);
      linked += n;
      if (n < 4000) break;
    }
    total += linked;
    console.log(`  ${c.id}: ${linked} / ${c.n}`);
  }
  const [{ n: deals }] = await runSql('select public.backfill_loan_deal_leads() as n');
  console.log(`events linked: ${total}; loan_deals linked: ${deals}`);
}

async function verify() {
  const checks = await runSql(`
    select
      (select count(*)::int from events where lead_id is null) as events_unlinked,
      (select count(*)::int from loan_deals where lead_id is null) as loan_deals_unlinked,
      (select count(*)::int from leads) as leads,
      (select count(*)::int from leads where first_lead_event_id is not null) as leads_with_lead_event,
      (select count(*)::int from lead_identity_reviews where status = 'open') as open_reviews,
      (select count(*)::int from ${SNAPSHOT} s where s.tbl = 'events'
         and not exists (select 1 from events e where e.id = s.id)) as snapshot_events_missing,
      (select count(*)::int from ${SNAPSHOT} s where s.tbl = 'loan_deals'
         and not exists (select 1 from loan_deals d where d.id = s.id)) as snapshot_deals_missing,
      (select count(*)::int from ${SNAPSHOT} s join events e on e.id = s.id
         where s.tbl = 'events' and md5((to_jsonb(e) - 'lead_id')::text) <> s.h) as events_changed,
      (select count(*)::int from ${SNAPSHOT} s join loan_deals d on d.id = s.id
         where s.tbl = 'loan_deals' and md5((to_jsonb(d) - 'lead_id')::text) <> s.h) as deals_changed,
      (select count(*)::int from events e
         where not exists (select 1 from ${SNAPSHOT} s where s.tbl = 'events' and s.id = e.id)) as events_new_since_snapshot
  `);
  console.log(JSON.stringify(checks[0], null, 2));
}

const step = process.argv[2];
const steps = { snapshot, migrate, backfill, verify };
if (!steps[step]) {
  console.error('Usage: node scripts/apply-lead-entity.mjs snapshot|migrate|backfill|verify');
  process.exit(1);
}
await steps[step]();
