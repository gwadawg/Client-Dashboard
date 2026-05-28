/**
 * Build 01_clients.csv from Project Info + unique Account names in Leads CSV.
 * Client names match Leads "Account" exactly so event import resolves client_id.
 *
 * Usage:
 *   node scripts/transform-clients.mjs \
 *     "/path/to/Project Info.csv" \
 *     "/path/to/New Leads.csv"
 *
 * Project Info only (no Leads file — every Project Name becomes a client row):
 *   node scripts/transform-clients.mjs "/path/to/Project Info.csv"
 *   # or explicit:
 *   node scripts/transform-clients.mjs --project-only "/path/to/Project Info.csv"
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');

const argv = process.argv.slice(2).filter((a) => a !== '--project-only');
const forceProjectOnly = process.argv.includes('--project-only');

const PROJECT_INFO =
  argv[0] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Project Info.csv');
const LEADS_CSV =
  argv[1] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - New Leads.csv');

/** One CSV path only → treat as Project Info and skip Leads (all projects become clients). */
const projectOnly = forceProjectOnly || (argv.length === 1 && argv[0]);

function normKey(name) {
  return (name ?? '').trim().toLowerCase();
}

function parseActive(val) {
  return (val ?? '').trim().toLowerCase() === 'yes';
}

function collectLeadAccounts(table) {
  const headers = table[0].map((h) => h.trim());
  const accountIdx = headers.findIndex((h) => h.toLowerCase() === 'account');
  const set = new Set();
  for (let i = 1; i < table.length; i++) {
    const name = (table[i][accountIdx] ?? '').trim();
    if (name) set.add(name);
  }
  return [...set].sort();
}

const projectTable = parseCsv(readFileSync(PROJECT_INFO, 'utf-8'));

let leadsTable;
if (projectOnly || !existsSync(LEADS_CSV)) {
  if (!projectOnly && !existsSync(LEADS_CSV)) {
    console.warn(`Leads CSV not found: ${LEADS_CSV}`);
    console.warn('Building 01_clients.csv from Project Info only.\n');
  }
  leadsTable = [['Account']];
} else {
  leadsTable = parseCsv(readFileSync(LEADS_CSV, 'utf-8'));
}

const pHeaders = projectTable[0].map((h) => h.trim());
const col = (name) => pHeaders.findIndex((h) => h.toLowerCase() === name.toLowerCase());

const PI = {
  locationId: col('Location ID'),
  projectName: col('Project Name'),
  reportingActive: col('Reporting Active'),
  calendarV1: col('Booked Appointment Calendar Name V1'),
  calendarV3: col('Booked Appointment Calendar Name V3'),
  callbackCal: col('Call Back Request Calendar Name'),
  adAccountName: col('Ad Account Name'),
  adAccountId: col('AD Account ID'),
  dateLaunched: col('Date Launched'),
};

const projectByKey = new Map();
const locationIdOwners = new Map();
const warnings = [];

for (let i = 1; i < projectTable.length; i++) {
  const cells = projectTable[i];
  const get = (idx) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');
  const projectName = get(PI.projectName);
  if (!projectName) continue;

  const row = {
    project_name: projectName,
    ghl_location_id: get(PI.locationId),
    is_live: parseActive(get(PI.reportingActive)),
    calendar_v1: get(PI.calendarV1),
    calendar_v3: get(PI.calendarV3),
    callback_calendar: get(PI.callbackCal),
    ad_account_name: get(PI.adAccountName),
    ad_account_id: get(PI.adAccountId),
    date_launched: get(PI.dateLaunched),
  };

  projectByKey.set(normKey(projectName), row);

  if (row.ghl_location_id) {
    const prev = locationIdOwners.get(row.ghl_location_id);
    if (prev && prev !== projectName) {
      warnings.push(
        `Duplicate GHL Location ID "${row.ghl_location_id}": "${prev}" and "${projectName}"`,
      );
    }
    locationIdOwners.set(row.ghl_location_id, projectName);
  }

  if (!row.ghl_location_id) {
    warnings.push(`No Location ID for project: "${projectName}"`);
  }
}

const leadAccounts = collectLeadAccounts(leadsTable);
const clientsMap = new Map();

for (const accountName of leadAccounts) {
  const project = projectByKey.get(normKey(accountName));
  clientsMap.set(accountName, {
    name: accountName,
    is_live: project?.is_live ?? false,
    ghl_location_id: project?.ghl_location_id ?? '',
    source: project ? 'leads+project_info' : 'leads_only',
    matched_project_name: project?.project_name ?? '',
  });
  if (!project) {
    warnings.push(`Lead Account not in Project Info: "${accountName}"`);
  }
}

for (const [key, project] of projectByKey) {
  const already = [...clientsMap.values()].some((c) => normKey(c.name) === key);
  if (!already) {
    clientsMap.set(project.project_name, {
      name: project.project_name,
      is_live: project.is_live,
      ghl_location_id: project.ghl_location_id,
      source: 'project_info_only',
      matched_project_name: project.project_name,
    });
  }
}

const clientRows = [...clientsMap.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((c) => ({
    name: c.name,
    is_live: c.is_live ? 'true' : 'false',
    ghl_location_id: c.ghl_location_id,
    source: c.source,
    matched_project_name: c.matched_project_name,
  }));

const configRows = [...projectByKey.values()].map((p) => ({
  project_name: p.project_name,
  ghl_location_id: p.ghl_location_id,
  is_live: p.is_live ? 'true' : 'false',
  calendar_v1: p.calendar_v1,
  calendar_v3: p.calendar_v3,
  callback_calendar: p.callback_calendar,
  ad_account_name: p.ad_account_name,
  ad_account_id: p.ad_account_id,
  date_launched: p.date_launched,
}));

mkdirSync(OUT_DIR, { recursive: true });

writeCsv(resolve(OUT_DIR, '01_clients.csv'), ['name', 'is_live', 'ghl_location_id', 'source', 'matched_project_name'], clientRows);

writeCsv(
  resolve(OUT_DIR, '00_client_config.csv'),
  [
    'project_name',
    'ghl_location_id',
    'is_live',
    'calendar_v1',
    'calendar_v3',
    'callback_calendar',
    'ad_account_name',
    'ad_account_id',
    'date_launched',
  ],
  configRows,
);

writeFileSync(
  resolve(OUT_DIR, '06_import_warnings.txt'),
  warnings.length ? warnings.join('\n') + '\n' : 'No warnings.\n',
  'utf-8',
);

console.log(`Project Info rows:  ${projectTable.length - 1}`);
console.log(`Lead accounts:      ${leadAccounts.length}`);
console.log(`Clients to import:  ${clientRows.length}`);
console.log(`Live clients:       ${clientRows.filter((c) => c.is_live === 'true').length}`);
console.log(`Warnings:           ${warnings.length} (see 06_import_warnings.txt)`);
console.log(`\nWrote: ${OUT_DIR}/01_clients.csv`);
