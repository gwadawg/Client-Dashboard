/**
 * Audit client roster for duplicates, orphans, and status inconsistencies.
 *
 *   node scripts/audit-client-roster.mjs
 *   node scripts/audit-client-roster.mjs --verify
 *   node scripts/audit-client-roster.mjs --out data/import/roster-audit-2026-06-16
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createServiceClient, fetchAllRows } from './lib/supabase-client.mjs';
import {
  UnionFind,
  FOOTPRINT_TABLES,
  clientNamesMatch,
  clientsLikelySameClient,
  clientNameStem,
  clientNeedsGhlMapping,
  normalizeEmail,
  normalizePhone,
  expectedIsLive,
  pickCanonical,
} from './lib/roster-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const verifyMode = args.includes('--verify');
const outArg = args.find((a, i) => args[i - 1] === '--out');
const dateStamp = new Date().toISOString().slice(0, 10);
const outBase =
  outArg ||
  resolve(__dirname, `../data/import/roster-audit-${dateStamp}`);

const supa = createServiceClient();

async function loadClients() {
  return fetchAllRows(supa, 'clients', {
    select:
      'id, name, primary_contact_name, email, billing_email, phone, ghl_location_id, clickup_task_id, lifecycle_status, is_live, mrr, billing_type, billing_day, launch_date, date_signed, created_at',
  });
}

async function loadFootprints() {
  const byClient = new Map();
  for (const table of FOOTPRINT_TABLES) {
    const rows = await fetchAllRows(supa, table, { select: 'client_id' });
    for (const row of rows) {
      const id = row.client_id;
      if (!id) continue;
      if (!byClient.has(id)) byClient.set(id, {});
      const fp = byClient.get(id);
      fp[table] = (fp[table] ?? 0) + 1;
    }
  }
  return byClient;
}

function totalFootprint(fp) {
  if (!fp) return 0;
  return Object.values(fp).reduce((s, n) => s + n, 0);
}

function conflictingIdentity(a, b) {
  if (a.ghl_location_id && b.ghl_location_id && a.ghl_location_id !== b.ghl_location_id) return true;
  if (a.clickup_task_id && b.clickup_task_id && a.clickup_task_id !== b.clickup_task_id) return true;
  return false;
}

function fuzzyNameLink(a, b) {
  if (conflictingIdentity(a, b)) return false;
  if (clientsLikelySameClient(a.name, b.name)) return true;
  if (
    a.primary_contact_name &&
    (clientNamesMatch(a.primary_contact_name, b.name) ||
      clientsLikelySameClient(a.primary_contact_name, b.name))
  ) {
    return true;
  }
  if (
    b.primary_contact_name &&
    (clientNamesMatch(b.primary_contact_name, a.name) ||
      clientsLikelySameClient(b.primary_contact_name, a.name))
  ) {
    return true;
  }
  if (
    a.primary_contact_name &&
    b.primary_contact_name &&
    clientNamesMatch(a.primary_contact_name, b.primary_contact_name)
  ) {
    return true;
  }
  return false;
}

function buildDuplicateClusters(clients) {
  const uf = new UnionFind(clients.map(c => c.id));
  const byGhl = new Map();
  const byClickup = new Map();
  const byEmail = new Map();
  const byPhone = new Map();

  for (const c of clients) {
    if (c.ghl_location_id) {
      if (byGhl.has(c.ghl_location_id)) uf.union(c.id, byGhl.get(c.ghl_location_id));
      else byGhl.set(c.ghl_location_id, c.id);
    }
    if (c.clickup_task_id) {
      if (byClickup.has(c.clickup_task_id)) uf.union(c.id, byClickup.get(c.clickup_task_id));
      else byClickup.set(c.clickup_task_id, c.id);
    }
    for (const em of [c.email, c.billing_email].map(normalizeEmail).filter(Boolean)) {
      if (byEmail.has(em)) {
        const otherId = byEmail.get(em);
        const other = clients.find(x => x.id === otherId);
        if (other && !conflictingIdentity(c, other)) uf.union(c.id, otherId);
      } else byEmail.set(em, c.id);
    }
    const ph = normalizePhone(c.phone);
    if (ph && ph.length >= 10) {
      if (byPhone.has(ph)) {
        const otherId = byPhone.get(ph);
        const other = clients.find(x => x.id === otherId);
        // Shared phone is weak — only link when at least one side lacks GHL mapping.
        if (other && !conflictingIdentity(c, other) && (!c.ghl_location_id || !other.ghl_location_id)) {
          uf.union(c.id, otherId);
        }
      } else byPhone.set(ph, c.id);
    }
  }

  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const a = clients[i];
      const b = clients[j];
      if (conflictingIdentity(a, b)) continue;

      let linked = false;
      if (a.ghl_location_id && a.ghl_location_id === b.ghl_location_id) {
        linked = true;
      } else if (a.clickup_task_id && a.clickup_task_id === b.clickup_task_id) {
        linked = true;
      } else {
        const emA = normalizeEmail(a.email);
        const emB = normalizeEmail(b.email);
        const bemA = normalizeEmail(a.billing_email);
        const bemB = normalizeEmail(b.billing_email);
        const emails = [emA, bemA].filter(Boolean);
        const otherEmails = [emB, bemB].filter(Boolean);
        if (emails.some(e => otherEmails.includes(e))) {
          linked = true;
        } else if (fuzzyNameLink(a, b)) {
          // Fuzzy name: at least one row should lack GHL (person-name dup vs sub-account).
          if (!a.ghl_location_id || !b.ghl_location_id) linked = true;
        }
      }

      if (linked) uf.union(a.id, b.id);
    }
  }

  const idToClient = new Map(clients.map(c => [c.id, c]));
  const rawClusters = uf.clusters();

  // Split clusters that contain multiple distinct GHL locations (not true duplicates).
  const splitClusters = [];
  for (const memberIds of rawClusters) {
    const members = memberIds.map(id => idToClient.get(id)).filter(Boolean);
    const ghlIds = [...new Set(members.map(m => m.ghl_location_id).filter(Boolean))];
    if (ghlIds.length <= 1) {
      splitClusters.push(members);
      continue;
    }
    // Group by ghl_location_id; rows without GHL stay in a separate weak group.
    const byGhl = new Map();
    const noGhl = [];
    for (const m of members) {
      if (m.ghl_location_id) {
        if (!byGhl.has(m.ghl_location_id)) byGhl.set(m.ghl_location_id, []);
        byGhl.get(m.ghl_location_id).push(m);
      } else noGhl.push(m);
    }
    for (const group of byGhl.values()) {
      if (group.length > 1) splitClusters.push(group);
    }
    if (noGhl.length > 1) splitClusters.push(noGhl);
    else if (noGhl.length === 1 && byGhl.size === 0) splitClusters.push(noGhl);
  }

  return splitClusters.map(members => {
    const canonical = pickCanonical(members, footprintsGlobal);
    const nonCanonical = members.filter(m => m.id !== canonical.id);
    const highConfidence = members.some(
      (m, i) =>
        members.slice(i + 1).some(
          n =>
            (m.ghl_location_id && m.ghl_location_id === n.ghl_location_id) ||
            (m.clickup_task_id && m.clickup_task_id === n.clickup_task_id) ||
            (normalizeEmail(m.email) &&
              [n.email, n.billing_email].map(normalizeEmail).includes(normalizeEmail(m.email))),
        ),
    );

    const memberDetails = members.map(m => ({
      id: m.id,
      name: m.name,
      primary_contact_name: m.primary_contact_name,
      lifecycle_status: m.lifecycle_status,
      is_live: m.is_live,
      ghl_location_id: m.ghl_location_id,
      clickup_task_id: m.clickup_task_id,
      email: m.email,
      footprint: footprintsGlobal.get(m.id) ?? {},
      total_rows: totalFootprint(footprintsGlobal.get(m.id)),
      is_canonical: m.id === canonical.id,
    }));

    const allNonCanonicalOrphans = nonCanonical.every(
      m => totalFootprint(footprintsGlobal.get(m.id)) === 0,
    );
    const canonicalRows = totalFootprint(footprintsGlobal.get(canonical.id));

    let suggested_action = 'manual_review';
    if (highConfidence && nonCanonical.length) {
      suggested_action = 'merge_into_canonical';
    } else if (nonCanonical.length && canonicalRows > 0 && allNonCanonicalOrphans) {
      suggested_action = 'merge_into_canonical';
    } else if (
      members.every(m => totalFootprint(footprintsGlobal.get(m.id)) === 0) &&
      !canonicalRows
    ) {
      suggested_action = 'delete_orphan';
    } else if (nonCanonical.length) {
      suggested_action = 'manual_review';
    }

    return {
      cluster_id: canonical.id,
      suggested_canonical_id: canonical.id,
      suggested_canonical_name: canonical.name,
      suggested_action,
      high_confidence: highConfidence,
      members: memberDetails,
      merge_pairs: nonCanonical.map(src => ({
        source_id: src.id,
        source_name: src.name,
        target_id: canonical.id,
        target_name: canonical.name,
      })),
      name_map_hints: nonCanonical
        .filter(
          src =>
            src.name !== canonical.name &&
            (clientsLikelySameClient(src.name, canonical.name) ||
              clientNameStem(src.name) === clientNameStem(canonical.name)),
        )
        .map(src => ({ csv_name: src.name, roster_name: canonical.name })),
    };
  });
}

let footprintsGlobal = new Map();

function findOrphans(clients, clusters) {
  const inCluster = new Set(clusters.flatMap(c => c.members.map(m => m.id)));
  const canonicalIds = new Set(clusters.map(c => c.suggested_canonical_id));

  return clients
    .filter(c => {
      const fp = totalFootprint(footprintsGlobal.get(c.id));
      if (fp > 0) return false;
      if (c.ghl_location_id || c.clickup_task_id) return false;
      if (inCluster.has(c.id) && canonicalIds.has(c.id)) return false;
      return true;
    })
    .map(c => ({
      id: c.id,
      name: c.name,
      primary_contact_name: c.primary_contact_name,
      lifecycle_status: c.lifecycle_status,
      created_at: c.created_at,
      in_duplicate_cluster: inCluster.has(c.id),
      suggested_action: 'delete_orphan',
    }));
}

function findStatusIssues(clients, clusters) {
  const issues = [];
  const clusterByMember = new Map();
  for (const cl of clusters) {
    for (const m of cl.members) clusterByMember.set(m.id, cl);
  }

  for (const c of clients) {
    const exp = expectedIsLive(c.lifecycle_status);
    if (exp !== null && c.is_live !== exp) {
      issues.push({
        client_id: c.id,
        name: c.name,
        type: 'is_live_mismatch',
        detail: `lifecycle=${c.lifecycle_status} but is_live=${c.is_live} (expected ${exp})`,
        suggested_fix: { lifecycle_status: c.lifecycle_status, is_live: exp },
      });
    }
    if (clientNeedsGhlMapping(c) && ['active', 'onboarding', 'new_account'].includes(c.lifecycle_status ?? '')) {
      issues.push({
        client_id: c.id,
        name: c.name,
        type: 'needs_ghl_mapping',
        detail: `Sub-account name "${c.name}" still matches person name "${c.primary_contact_name}"`,
      });
    }
    const fp = footprintsGlobal.get(c.id);
    const billingCount = fp?.client_billings ?? 0;
    if (billingCount > 0 && (!c.mrr || Number(c.mrr) === 0) && !c.billing_type) {
      issues.push({
        client_id: c.id,
        name: c.name,
        type: 'billing_config_missing',
        detail: `${billingCount} billing row(s) but mrr=0 and billing_type unset`,
      });
    }
  }

  for (const cl of clusters) {
    const statuses = new Set(cl.members.map(m => m.lifecycle_status));
    const mrrs = new Set(cl.members.map(m => m.mrr).filter(v => v != null && Number(v) > 0));
    if (statuses.size > 1) {
      issues.push({
        cluster_id: cl.cluster_id,
        type: 'cluster_lifecycle_conflict',
        detail: `Cluster "${cl.suggested_canonical_name}" has mixed lifecycle: ${[...statuses].join(', ')}`,
        members: cl.members.map(m => ({ id: m.id, name: m.name, lifecycle_status: m.lifecycle_status })),
      });
    }
    if (mrrs.size > 1) {
      issues.push({
        cluster_id: cl.cluster_id,
        type: 'cluster_mrr_conflict',
        detail: `Cluster "${cl.suggested_canonical_name}" has conflicting MRR values`,
        members: cl.members.map(m => ({ id: m.id, name: m.name, mrr: m.mrr })),
      });
    }
  }

  return issues;
}

function buildHtml(report) {
  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const clusterRows = report.duplicate_clusters
    .map(
      cl => `
    <section class="cluster">
      <h3>${esc(cl.suggested_canonical_name)} <span class="tag ${cl.suggested_action}">${esc(cl.suggested_action)}</span></h3>
      <p>Canonical: <code>${esc(cl.suggested_canonical_id)}</code> · ${cl.high_confidence ? 'high confidence' : 'review required'}</p>
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>GHL</th><th>Events</th><th>Total rows</th><th>Role</th></tr></thead>
        <tbody>
          ${cl.members
            .map(
              m => `<tr>
            <td>${esc(m.name)}</td>
            <td>${esc(m.primary_contact_name)}</td>
            <td>${esc(m.lifecycle_status)}</td>
            <td>${m.ghl_location_id ? '✓' : '—'}</td>
            <td>${m.footprint.events ?? 0}</td>
            <td>${m.total_rows}</td>
            <td>${m.is_canonical ? '<strong>keep</strong>' : 'merge/delete'}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Client Roster Audit ${esc(report.generated_at)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f172a; color: #e2e8f0; }
    h1, h2 { color: #f8fafc; }
    .summary { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .card { background: #1e293b; padding: 1rem 1.25rem; border-radius: 8px; min-width: 140px; }
    .card strong { font-size: 1.5rem; display: block; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.5rem; font-size: 0.875rem; }
    th, td { border: 1px solid #334155; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #334155; }
    .cluster { background: #1e293b; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .tag { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: #475569; }
    .tag.merge_into_canonical { background: #166534; }
    .tag.delete_orphan { background: #7f1d1d; }
    .tag.manual_review { background: #854d0e; }
    code { font-size: 0.8em; color: #94a3b8; }
    .verify-ok { color: #4ade80; }
    .verify-fail { color: #f87171; }
  </style>
</head>
<body>
  <h1>Client Roster Audit</h1>
  <p>Generated ${esc(report.generated_at)}${report.verify_mode ? ' · <strong>VERIFY MODE</strong>' : ''}</p>
  <div class="summary">
    <div class="card"><strong>${report.summary.total_clients}</strong> clients</div>
    <div class="card"><strong>${report.summary.duplicate_clusters}</strong> duplicate clusters</div>
    <div class="card"><strong>${report.summary.orphans}</strong> orphan accounts</div>
    <div class="card"><strong>${report.summary.status_issues}</strong> status issues</div>
  </div>
  ${report.verify_mode ? `<p class="${report.verify.passed ? 'verify-ok' : 'verify-fail'}">${report.verify.passed ? '✓ Verification passed' : '✗ Verification failed: ' + esc(report.verify.failures.join('; '))}</p>` : ''}
  <h2>Duplicate clusters (${report.duplicate_clusters.length})</h2>
  ${clusterRows || '<p>None found.</p>'}
  <h2>Orphan accounts (${report.orphans.length})</h2>
  <table>
    <thead><tr><th>Name</th><th>Status</th><th>Created</th><th>In cluster?</th></tr></thead>
    <tbody>
      ${report.orphans.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.lifecycle_status)}</td><td>${esc(o.created_at)}</td><td>${o.in_duplicate_cluster ? 'yes' : 'no'}</td></tr>`).join('')}
    </tbody>
  </table>
  <h2>Status issues (${report.status_issues.length})</h2>
  <table>
    <thead><tr><th>Client</th><th>Type</th><th>Detail</th></tr></thead>
    <tbody>
      ${report.status_issues.map(i => `<tr><td>${esc(i.name ?? i.cluster_id)}</td><td>${esc(i.type)}</td><td>${esc(i.detail)}</td></tr>`).join('')}
    </tbody>
  </table>
  <h2>Next steps</h2>
  <ol>
    <li>Review clusters marked <code>manual_review</code> carefully.</li>
    <li>Copy approved actions into <code>data/import/roster-cleanup-approved.json</code>.</li>
    <li>Run <code>node scripts/apply-roster-cleanup.mjs</code> (dry-run), then <code>--apply</code>.</li>
  </ol>
</body>
</html>`;
}

function buildApprovalTemplate(report) {
  const merges = [];
  const deletes = [];
  const nameMap = {};

  for (const cl of report.duplicate_clusters) {
    for (const pair of cl.merge_pairs ?? []) {
      merges.push({
        source_id: pair.source_id,
        target_id: pair.target_id,
        reason: cl.suggested_action,
        source_name: pair.source_name,
        target_name: pair.target_name,
        _review: cl.suggested_action === 'manual_review',
      });
    }
    for (const hint of cl.name_map_hints ?? []) {
      nameMap[hint.csv_name] = hint.roster_name;
    }
  }
  for (const o of report.orphans) {
    if (!o.in_duplicate_cluster) deletes.push(o.id);
  }

  const statusFixes = report.status_issues
    .filter(i => i.type === 'is_live_mismatch' && i.suggested_fix)
    .map(i => ({ client_id: i.client_id, ...i.suggested_fix }));

  return {
    merges,
    deletes,
    payment_moves: [],
    name_map_additions: nameMap,
    status_fixes: statusFixes,
    _note: 'Review and edit before running apply-roster-cleanup.mjs --apply',
  };
}

async function main() {
  console.log('Loading clients and footprints…');
  const clients = await loadClients();
  footprintsGlobal = await loadFootprints();

  const duplicate_clusters = buildDuplicateClusters(clients);
  const orphans = findOrphans(clients, duplicate_clusters);
  const status_issues = findStatusIssues(clients, duplicate_clusters);

  const report = {
    generated_at: new Date().toISOString(),
    verify_mode: verifyMode,
    summary: {
      total_clients: clients.length,
      duplicate_clusters: duplicate_clusters.length,
      orphans: orphans.length,
      status_issues: status_issues.length,
    },
    duplicate_clusters,
    orphans,
    status_issues,
    approval_template: buildApprovalTemplate({
      duplicate_clusters,
      orphans,
      status_issues,
    }),
  };

  if (verifyMode) {
    const failures = [];
    if (duplicate_clusters.length > 0) {
      failures.push(`${duplicate_clusters.length} duplicate cluster(s) remain`);
    }
    const trueOrphans = orphans.filter(o => !o.in_duplicate_cluster);
    if (trueOrphans.length > 0) {
      failures.push(`${trueOrphans.length} orphan account(s) remain`);
    }
    report.verify = { passed: failures.length === 0, failures };
    console.log(report.verify.passed ? 'VERIFY: PASSED' : `VERIFY: FAILED — ${failures.join('; ')}`);
  }

  mkdirSync(dirname(outBase + '.json'), { recursive: true });
  writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${outBase}.html`, buildHtml(report));

  const templatePath = resolve(__dirname, '../data/import/roster-cleanup-approved.template.json');
  writeFileSync(templatePath, JSON.stringify(report.approval_template, null, 2) + '\n');

  const approvedPath = resolve(__dirname, '../data/import/roster-cleanup-approved.json');
  if (!existsSync(approvedPath)) {
    writeFileSync(approvedPath, JSON.stringify(report.approval_template, null, 2) + '\n');
    console.log(`Wrote approval starter: ${approvedPath}`);
  } else {
    console.log(`Approval template: ${templatePath} (edit roster-cleanup-approved.json before apply)`);
  }

  console.log(`Clients: ${clients.length}`);
  console.log(`Duplicate clusters: ${duplicate_clusters.length}`);
  console.log(`Orphans: ${orphans.length}`);
  console.log(`Status issues: ${status_issues.length}`);
  console.log(`Report: ${outBase}.json`);
  console.log(`HTML:   ${outBase}.html`);

  if (verifyMode && !report.verify.passed) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
