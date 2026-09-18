/**
 * Backfill media-buying account fields from the Client Accounts CSV.
 *
 * Every sheet row is expected to already exist in `clients`. Unmatched or
 * ambiguous names abort `--apply` so you can supply the correct roster name.
 *
 *   npx tsx scripts/backfill-media-account-fields.ts
 *   npx tsx scripts/backfill-media-account-fields.ts --apply
 *   npx tsx scripts/backfill-media-account-fields.ts --force   # overwrite non-empty fields
 *   npx tsx scripts/backfill-media-account-fields.ts --csv "/path/to/file.csv"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const applyMode = process.argv.includes('--apply');
const forceMode = process.argv.includes('--force');

const DEFAULT_CSV = '/Users/gwadawg/Downloads/Client Accounts - Accounts.csv';

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const csvPath = resolve(argValue('--csv') ?? DEFAULT_CSV);

const MEDIA_FIELDS = [
  'facebook_page_name',
  'instagram_handle',
  'ad_account_name',
  'ad_account_url',
  'daily_adspend',
  'nmls',
  'brokerage_name',
  'landing_page_url',
  'funnel_url',
  'thank_you_page_url',
  'second_landing_page_url',
] as const;

type MediaField = (typeof MEDIA_FIELDS)[number];

type ClientRow = {
  id: string;
  name: string;
  primary_contact_name: string | null;
  legal_business_name: string | null;
  brokerage_name: string | null;
  lifecycle_status: string | null;
  facebook_page_name: string | null;
  instagram_handle: string | null;
  ad_account_name: string | null;
  ad_account_url: string | null;
  daily_adspend: number | null;
  nmls: string | null;
  funnel_url: string | null;
  landing_page_url: string | null;
  thank_you_page_url: string | null;
  second_landing_page_url: string | null;
};

type CsvRow = {
  client: string;
  facebook_page: string;
  instagram: string;
  ad_account_name: string;
  ad_account_link: string;
  daily_adspend: string;
  company_nmls: string;
  company_broker: string;
  landing_page: string;
  thank_you_page: string;
  second_landing_page: string;
};

type MatchKind = 'exact' | 'normalized' | 'unmatched' | 'ambiguous' | 'multi';

type RowReport = {
  sheet_name: string;
  match_kind: MatchKind;
  client_id: string | null;
  client_name: string | null;
  client_ids?: string[];
  client_names?: string[];
  candidates?: string[];
  patch: Partial<Record<MediaField, unknown>>;
  skipped_existing: MediaField[];
};

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
      .split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function createService(): SupabaseClient {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env in .env.local');
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Minimal CSV parser that respects quoted fields with commas/newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(c => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function cellText(raw: string | undefined): string {
  const t = (raw ?? '').trim();
  if (!t || /^n\/?a$/i.test(t)) return '';
  return t;
}

function parseDailyAdspend(raw: string): number | null {
  const t = cellText(raw).replace(/[$,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function loadCsvRows(path: string): CsvRow[] {
  if (!existsSync(path)) throw new Error(`CSV not found: ${path}`);
  const rows = parseCsv(readFileSync(path, 'utf-8'));
  if (rows.length < 2) throw new Error('CSV has no data rows');
  const header = rows[0]!.map(h => h.trim().toLowerCase());
  const idx = (label: string) => {
    const i = header.indexOf(label.toLowerCase());
    if (i === -1) throw new Error(`CSV missing column: ${label}`);
    return i;
  };
  const iClient = idx('Client');
  const iFb = idx('Facebook Page');
  const iIg = idx('Instagram page');
  const iAdName = idx('Ad Account Name');
  const iAdLink = idx('Ad account link');
  const iSpend = idx('Daily Adspend');
  const iNmls = idx('Company NMLS');
  const iBroker = idx('Company/Broker Name');
  const iLand = idx('Landing Page');
  const iThanks = idx('Thank you page');
  const iSecond = idx('Second landing page');

  return rows.slice(1).map(r => ({
    client: cellText(r[iClient]),
    facebook_page: cellText(r[iFb]),
    instagram: cellText(r[iIg]),
    ad_account_name: cellText(r[iAdName]),
    ad_account_link: cellText(r[iAdLink]),
    daily_adspend: cellText(r[iSpend]),
    company_nmls: cellText(r[iNmls]),
    company_broker: cellText(r[iBroker]),
    landing_page: cellText(r[iLand]),
    thank_you_page: cellText(r[iThanks]),
    second_landing_page: cellText(r[iSecond]),
  })).filter(r => r.client);
}

function csvToDesired(row: CsvRow): Partial<Record<MediaField, unknown>> {
  const out: Partial<Record<MediaField, unknown>> = {};
  if (row.facebook_page) out.facebook_page_name = row.facebook_page;
  if (row.instagram) out.instagram_handle = row.instagram;
  if (row.ad_account_name) out.ad_account_name = row.ad_account_name;
  if (row.ad_account_link) out.ad_account_url = row.ad_account_link;
  const spend = parseDailyAdspend(row.daily_adspend);
  if (spend !== null) out.daily_adspend = spend;
  if (row.company_nmls) out.nmls = row.company_nmls;
  if (row.company_broker) out.brokerage_name = row.company_broker;
  if (row.landing_page) out.landing_page_url = row.landing_page;
  if (row.thank_you_page) out.thank_you_page_url = row.thank_you_page;
  if (row.second_landing_page) out.second_landing_page_url = row.second_landing_page;
  return out;
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function buildPatch(
  client: ClientRow,
  desired: Partial<Record<MediaField, unknown>>,
): { patch: Partial<Record<MediaField, unknown>>; skipped: MediaField[] } {
  const patch: Partial<Record<MediaField, unknown>> = {};
  const skipped: MediaField[] = [];
  for (const key of MEDIA_FIELDS) {
    if (!(key in desired)) continue;
    const next = desired[key];
    const current = client[key];
    if (!forceMode && !isEmpty(current)) {
      skipped.push(key);
      continue;
    }
    if (current === next) continue;
    patch[key] = next;
  }
  return { patch, skipped };
}

function stripParenSuffix(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function sheetNameVariants(sheetName: string): string[] {
  const variants = new Set<string>();
  variants.add(sheetName);
  const stripped = stripParenSuffix(sheetName);
  if (stripped) variants.add(stripped);
  // "Amir - Team Westside" → try left of dash
  const dash = sheetName.split(/\s+[-–—]\s+/)[0]?.trim();
  if (dash) variants.add(dash);
  return [...variants];
}

function matchClient(
  sheetName: string,
  clients: ClientRow[],
  byExact: Map<string, ClientRow[]>,
  byNorm: Map<string, ClientRow[]>,
  byContactNorm: Map<string, ClientRow[]>,
  byBrokerNorm: Map<string, ClientRow[]>,
): { kind: MatchKind; client: ClientRow | null; candidates: ClientRow[] } {
  const tryUnique = (
    kind: 'exact' | 'normalized',
    list: ClientRow[],
  ): { kind: MatchKind; client: ClientRow | null; candidates: ClientRow[] } | null => {
    if (list.length === 1) return { kind, client: list[0]!, candidates: list };
    if (list.length > 1) {
      const active = list.filter(c => c.lifecycle_status === 'active');
      if (active.length === 1) return { kind, client: active[0]!, candidates: list };
      return { kind: 'ambiguous', client: null, candidates: list };
    }
    return null;
  };

  for (const variant of sheetNameVariants(sheetName)) {
    const exact = tryUnique('exact', byExact.get(variant) ?? []);
    if (exact) return exact;
  }

  for (const variant of sheetNameVariants(sheetName)) {
    const fuzzy = tryUnique('normalized', byNorm.get(normalizeName(variant)) ?? []);
    if (fuzzy) return fuzzy;
  }

  for (const variant of sheetNameVariants(sheetName)) {
    const byContact = tryUnique('normalized', byContactNorm.get(normalizeName(variant)) ?? []);
    if (byContact) return byContact;
  }

  for (const variant of sheetNameVariants(sheetName)) {
    const byBroker = tryUnique('normalized', byBrokerNorm.get(normalizeName(variant)) ?? []);
    if (byBroker) return byBroker;
  }

  // Containment fallback: sheet token(s) appear in name/contact/broker (unique only)
  const needle = normalizeName(stripParenSuffix(sheetName));
  if (needle.length >= 3) {
    const hits = clients.filter(c => {
      const hay = normalizeName(
        [c.name, c.primary_contact_name, c.brokerage_name, c.legal_business_name]
          .filter(Boolean)
          .join(' '),
      );
      return hay.includes(needle) || needle.split(' ').every(t => t.length < 2 || hay.includes(t));
    });
    const unique = tryUnique('normalized', hits);
    if (unique) return unique;
  }

  return { kind: 'unmatched', client: null, candidates: [] };
}

async function loadClients(sb: SupabaseClient): Promise<ClientRow[]> {
  const select =
    'id, name, primary_contact_name, legal_business_name, brokerage_name, lifecycle_status, ' +
    'facebook_page_name, instagram_handle, ad_account_name, ad_account_url, ' +
    'daily_adspend, nmls, brokerage_name, funnel_url, landing_page_url, thank_you_page_url, second_landing_page_url';
  const { data, error } = await sb.from('clients').select(select).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientRow[];
}

async function main() {
  console.log(`CSV: ${csvPath}`);
  console.log(`Mode: ${applyMode ? 'APPLY' : 'dry-run'}${forceMode ? ' (force overwrite)' : ' (fill empty only)'}`);

  const csvRows = loadCsvRows(csvPath);
  const sb = createService();
  let clients: ClientRow[];
  try {
    clients = await loadClients(sb);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/instagram_handle|ad_account|thank_you|second_landing|landing_page_url/i.test(msg)) {
      console.error('\nMigration not applied yet. Run supabase/migrations/add_client_media_account_fields.sql in the Supabase SQL editor, then re-run this script.\n');
    }
    throw err;
  }

  const byExact = new Map<string, ClientRow[]>();
  const byNorm = new Map<string, ClientRow[]>();
  const byContactNorm = new Map<string, ClientRow[]>();
  const byBrokerNorm = new Map<string, ClientRow[]>();
  const push = (map: Map<string, ClientRow[]>, key: string, row: ClientRow) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key)!;
    if (!list.some(c => c.id === row.id)) list.push(row);
  };
  for (const c of clients) {
    push(byExact, c.name, c);
    push(byNorm, normalizeName(c.name), c);
    if (c.primary_contact_name) push(byContactNorm, normalizeName(c.primary_contact_name), c);
    if (c.brokerage_name) push(byBrokerNorm, normalizeName(c.brokerage_name), c);
    if (c.legal_business_name) push(byBrokerNorm, normalizeName(c.legal_business_name), c);
    if (c.nmls) push(byExact, c.nmls.trim(), c);
    if (c.nmls) push(byNorm, normalizeName(c.nmls), c);
  }

  const reports: RowReport[] = [];
  for (const row of csvRows) {
    // Prefer NMLS when the sheet company NMLS uniquely identifies a client.
    let match = matchClient(row.client, clients, byExact, byNorm, byContactNorm, byBrokerNorm);
    if (match.kind !== 'exact' && match.kind !== 'normalized' && row.company_nmls) {
      const byNmls = clients.filter(c => (c.nmls ?? '').trim() === row.company_nmls.trim());
      if (byNmls.length === 1) {
        match = { kind: 'exact', client: byNmls[0]!, candidates: byNmls };
      } else if (byNmls.length > 1) {
        const active = byNmls.filter(c => c.lifecycle_status === 'active');
        if (active.length === 1) match = { kind: 'normalized', client: active[0]!, candidates: byNmls };
        else match = { kind: 'ambiguous', client: null, candidates: byNmls };
      }
    }
    // Landing-page slug hint (e.g. /amir-abuhalimeh/)
    if ((match.kind === 'unmatched' || match.kind === 'ambiguous') && row.landing_page) {
      const slugMatch = row.landing_page.match(/homequityhacks\.com\/([^/\s?]+)/i);
      const slug = slugMatch?.[1] ? normalizeName(slugMatch[1].replace(/-/g, ' ')) : '';
      if (slug) {
        const hits = clients.filter(c => {
          const hay = normalizeName([c.name, c.primary_contact_name, c.funnel_url].filter(Boolean).join(' '));
          return hay.includes(slug) || normalizeName(c.funnel_url ?? '').includes(slug.replace(/\s+/g, ''));
        });
        const active = hits.filter(c => c.lifecycle_status === 'active');
        const pool = active.length === 1 ? active : hits.length === 1 ? hits : active.length > 1 ? active : hits;
        if (pool.length === 1) {
          match = { kind: 'normalized', client: pool[0]!, candidates: hits };
        } else if (pool.length > 1 && match.kind === 'unmatched') {
          match = { kind: 'ambiguous', client: null, candidates: pool };
        }
      }
    }
    if (!match.client && match.kind === 'ambiguous') {
      const contacts = [...new Set(
        match.candidates
          .map(c => normalizeName(c.primary_contact_name ?? ''))
          .filter(Boolean),
      )];
      // Same LO, multiple offer rows — sheet row applies to all of them.
      if (contacts.length === 1 && match.candidates.length > 1) {
        const desired = csvToDesired(row);
        // Build a union patch from empty fields across candidates (per-row apply later).
        reports.push({
          sheet_name: row.client,
          match_kind: 'multi',
          client_id: null,
          client_name: null,
          client_ids: match.candidates.map(c => c.id),
          client_names: match.candidates.map(c => c.name),
          candidates: match.candidates.map(c => c.name),
          patch: desired,
          skipped_existing: [],
        });
        continue;
      }
      reports.push({
        sheet_name: row.client,
        match_kind: match.kind,
        client_id: null,
        client_name: null,
        candidates: match.candidates.map(c => c.name),
        patch: {},
        skipped_existing: [],
      });
      continue;
    }
    if (!match.client) {
      reports.push({
        sheet_name: row.client,
        match_kind: match.kind,
        client_id: null,
        client_name: null,
        candidates: match.candidates.map(c => c.name),
        patch: {},
        skipped_existing: [],
      });
      continue;
    }
    const desired = csvToDesired(row);
    const { patch, skipped } = buildPatch(match.client, desired);
    reports.push({
      sheet_name: row.client,
      match_kind: match.kind,
      client_id: match.client.id,
      client_name: match.client.name,
      patch,
      skipped_existing: skipped,
    });
  }

  const unmatched = reports.filter(r => r.match_kind === 'unmatched');
  const ambiguous = reports.filter(r => r.match_kind === 'ambiguous');
  const multi = reports.filter(r => r.match_kind === 'multi');
  const wouldWrite = reports.filter(r =>
    r.match_kind === 'multi'
      ? Object.keys(r.patch).length > 0
      : Object.keys(r.patch).length > 0,
  );
  const matchedOk = reports.filter(r =>
    r.match_kind === 'exact' || r.match_kind === 'normalized' || r.match_kind === 'multi',
  );

  console.log(`\nSheet rows: ${csvRows.length}`);
  console.log(`Matched: ${matchedOk.length}`);
  console.log(`Would write: ${wouldWrite.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Ambiguous: ${ambiguous.length}`);
  console.log(`Multi-offer: ${multi.length}`);

  if (unmatched.length) {
    console.log('\n=== UNMATCHED (tell me the roster name for each) ===');
    for (const r of unmatched) console.log(`  - "${r.sheet_name}"`);
  }
  if (ambiguous.length) {
    console.log('\n=== AMBIGUOUS ===');
    for (const r of ambiguous) {
      console.log(`  - "${r.sheet_name}" → ${r.candidates?.join(' | ') ?? '(none)'}`);
    }
  }
  if (multi.length) {
    console.log('\n=== MULTI-OFFER (same LO — will write to all) ===');
    for (const r of multi) {
      console.log(`  - "${r.sheet_name}" → ${r.client_names?.join(' | ')}`);
      console.log(`    ${JSON.stringify(r.patch)}`);
    }
  }

  if (wouldWrite.length) {
    console.log('\n=== PATCHES ===');
    for (const r of wouldWrite.filter(x => x.match_kind !== 'multi')) {
      console.log(`  ${r.sheet_name} → ${r.client_name} (${r.match_kind})`);
      console.log(`    ${JSON.stringify(r.patch)}`);
      if (r.skipped_existing.length) {
        console.log(`    skipped existing: ${r.skipped_existing.join(', ')}`);
      }
    }
  }

  const outDir = resolve(__dirname, '../tmp');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `media-account-backfill-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify({ csvPath, applyMode, forceMode, reports }, null, 2));
  console.log(`\nReport written: ${outPath}`);

  if (unmatched.length || ambiguous.length) {
    console.error('\nRefusing to apply until every sheet row has a unique match.');
    if (applyMode) process.exit(1);
    return;
  }

  if (!applyMode) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  let updated = 0;
  for (const r of reports) {
    if (r.match_kind === 'multi' && r.client_ids?.length) {
      for (const id of r.client_ids) {
        const client = clients.find(c => c.id === id);
        if (!client) continue;
        const { patch } = buildPatch(client, r.patch);
        if (!Object.keys(patch).length) continue;
        const { error } = await sb.from('clients').update(patch).eq('id', id);
        if (error) throw new Error(`${client.name}: ${error.message}`);
        updated++;
        console.log(`Updated ${client.name} (multi)`);
      }
      continue;
    }
    if (!r.client_id || !Object.keys(r.patch).length) continue;
    const { error } = await sb.from('clients').update(r.patch).eq('id', r.client_id);
    if (error) throw new Error(`${r.client_name}: ${error.message}`);
    updated++;
    console.log(`Updated ${r.client_name}`);
  }
  console.log(`\nApplied ${updated} update(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
