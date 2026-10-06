/**
 * Assert every event and loan deal is linked to a lead, and lead identity is
 * consistent. Exit 1 on any failure. Safe to run in cron / before deploys.
 *
 *   node scripts/assert-lead-integrity.mjs
 *
 * Fix unlinked rows (re-runnable): node scripts/apply-lead-entity.mjs backfill
 */
import { runSql } from './lib/supabase-sql.mjs';

const [r] = await runSql(`
  select
    (select count(*)::int from events where lead_id is null) as events_unlinked,
    (select count(*)::int from loan_deals where lead_id is null) as loan_deals_unlinked,
    (select count(*)::int from events e join leads l on l.id = e.lead_id
       where l.client_id <> e.client_id) as events_cross_client,
    (select count(*)::int from loan_deals d join leads l on l.id = d.lead_id
       where l.client_id <> d.client_id) as loan_deals_cross_client,
    (select count(*)::int from leads l join leads m on m.id = l.merged_into_id
       where m.merged_into_id is not null) as merge_chains,
    (select count(*)::int from events e join leads l on l.id = e.lead_id
       where l.merged_into_id is not null) as events_on_merged_lead,
    (select count(*)::int from lead_identity_reviews where status = 'open') as open_identity_reviews
`);

const failures = Object.entries(r).filter(
  ([k, v]) => k !== 'open_identity_reviews' && v > 0,
);

console.log(JSON.stringify(r, null, 2));
if (failures.length) {
  console.error(`FAIL: ${failures.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  process.exit(1);
}
console.log('OK: every event and loan deal is linked to a lead on its own client.');
