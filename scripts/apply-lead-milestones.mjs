/**
 * Apply add_lead_milestones.sql, refresh every lead, and prove events /
 * loan_deals rows were not touched.
 *
 *   node scripts/apply-lead-milestones.mjs
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

const SNAPSHOT = 'lead_milestone_snapshot_20261003';

await runSql(`
  drop table if exists ${SNAPSHOT};
  create table ${SNAPSHOT} as
    select 'events'::text as tbl, e.id, md5(to_jsonb(e)::text) as h from events e
    union all
    select 'loan_deals', d.id, md5(to_jsonb(d)::text) from loan_deals d;
  alter table ${SNAPSHOT} enable row level security;
`);
const [snap] = await runSql(`select count(*) as n from ${SNAPSHOT}`);
console.log('snapshot rows', snap.n);

await runSql(`begin;\n${migration}\ncommit;`);
console.log('migration applied');

let after = null;
let total = 0;
for (;;) {
  const [row] = await runSql(
    `select * from refresh_leads_batch(${after ? `'${after}'` : 'null'}, 4000)`,
  );
  if (!row.refreshed) break;
  total += row.refreshed;
  after = row.last_id;
  console.log(`refreshed ${total}`);
}

const [check] = await runSql(`
  select
    (select count(*) from ${SNAPSHOT} s join events e on e.id = s.id
      where s.tbl = 'events' and md5(to_jsonb(e)::text) <> s.h) as events_changed,
    (select count(*) from ${SNAPSHOT} s where s.tbl = 'events'
      and not exists (select 1 from events e where e.id = s.id)) as events_missing,
    (select count(*) from ${SNAPSHOT} s join loan_deals d on d.id = s.id
      where s.tbl = 'loan_deals' and md5(to_jsonb(d)::text) <> s.h) as deals_changed,
    (select count(*) from ${SNAPSHOT} s where s.tbl = 'loan_deals'
      and not exists (select 1 from loan_deals d where d.id = s.id)) as deals_missing
`);
console.log('verify', check);
