#!/usr/bin/env node
/**
 * Manually link acquisition leads to GHL contacts after fuzzy name/roster matching.
 *
 * Usage: node scripts/link-acquisition-leads-ghl-manual.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

/** Verified GHL matches for company-report leads missing linkage. */
const LINKS = [
  {
    lead_id: '6a7fddbd-b66a-4bae-9486-818a185d6b1d',
    lead_name: 'Shain Urwin',
    ghl_contact_id: 'EYNINbFtso1T6IqsfADt',
    ghl_name: 'shain edmond urwin',
    email: 'surwin@c2financial.com',
    phone: '+12085775500',
    created_at: '2024-10-28T17:37:05.671Z',
    source: 'Referral',
    match_note: 'GHL full name match: shain edmond urwin',
  },
  {
    lead_id: '1ef7e4e4-cc4f-4378-a71f-b3e09ef3fdfd',
    lead_name: 'Amir S',
    ghl_contact_id: 'O4ags4GQbfLc2g3NlOwD',
    ghl_name: 'amir abuhalimeh',
    email: 'aabu@westcapitallending.com',
    phone: '+17325678898',
    created_at: '2024-11-14T23:11:06.390Z',
    source: 'Referral',
    match_note: 'Roster Amir Abuhalimeh → GHL amir abuhalimeh',
  },
  {
    lead_id: 'f8696e9d-35f9-4227-90f9-4a7f5b3c2a12',
    lead_name: 'Tony Gaglione',
    ghl_contact_id: 'b3u6kZWaMdNkbITTp9rH',
    ghl_name: 'anthony gaglione',
    email: 'tgags1976@gmail.com',
    phone: '+17025915585',
    created_at: '2024-09-09T16:37:31.426Z',
    source: 'Referral',
    match_note: 'GHL anthony gaglione (tgags1976@gmail.com) → Tony Gaglione roster',
  },
  {
    lead_id: '1f24927e-5a9b-4260-b975-d859389b4ea1',
    lead_name: 'Dave Bartel',
    ghl_contact_id: 'eYZEzUY8Pla0rU5Pbrp9',
    ghl_name: 'daniel bartel',
    email: 'barteldm@gmail.com',
    phone: '+12063105766',
    created_at: '2024-10-02T20:41:21.105Z',
    source: 'Referral',
    match_note: 'GHL daniel bartel → Dave Bartel roster (fuzzy — verify if needed)',
  },
];

async function patchLead(link) {
  const { data: existing } = await supabaseRequest(
    'GET',
    `/rest/v1/acquisition_leads?id=eq.${link.lead_id}&select=id,raw,source`,
  );
  const lead = JSON.parse(existing)[0];
  if (!lead) return { status: 404, error: 'lead not found' };

  const raw =
    lead.raw && typeof lead.raw === 'object' && !Array.isArray(lead.raw)
      ? { ...lead.raw }
      : {};
  raw.ghl_sync_at = new Date().toISOString();
  raw.ghl_date_added = link.created_at;
  raw.ghl_contact_id_synced = link.ghl_contact_id;
  raw.ghl_match_note = link.match_note;
  raw.ghl_name = link.ghl_name;

  const body = {
    ghl_contact_id: link.ghl_contact_id,
    email: link.email,
    phone: link.phone,
    created_at: link.created_at,
    source: lead.source ?? link.source,
    raw,
    updated_at: new Date().toISOString(),
  };

  if (DRY_RUN) return { status: 200, body };
  return supabaseRequest('PATCH', `/rest/v1/acquisition_leads?id=eq.${link.lead_id}`, body);
}

async function main() {
  const report = { at: new Date().toISOString(), dry_run: DRY_RUN, linked: 0, errors: [], rows: [] };

  for (const link of LINKS) {
    const res = await patchLead(link);
    const row = { ...link, status: res.status < 300 ? 'linked' : 'error' };
    if (res.status >= 300) {
      report.errors.push(`${link.lead_name}: ${res.status} ${res.data ?? res.error}`);
      row.error = res.data ?? res.error;
    } else {
      report.linked++;
    }
    report.rows.push(row);
  }

  const out = resolve(ROOT, `data/import/acquisition/ghl-manual-link-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log(`Report: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
