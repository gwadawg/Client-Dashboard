/** Mirrors src/lib/client-name-match.ts and client-ghl-mapping.ts for scripts. */

export function normalizeClientNameForMatch(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clientNamesMatch(a, b) {
  return normalizeClientNameForMatch(a) === normalizeClientNameForMatch(b);
}

export function clientNameStem(name) {
  return normalizeClientNameForMatch(name).replace(/\s*(s office|office)\s*$/i, '').trim();
}

export function clientsLikelySameClient(a, b) {
  if (clientNamesMatch(a, b)) return true;
  const stemA = clientNameStem(a);
  const stemB = clientNameStem(b);
  if (stemA.length < 3 || stemB.length < 3) return false;
  return stemA === stemB;
}

export function clientNeedsGhlMapping(client) {
  const sub = client.name?.trim() ?? '';
  const person = client.primary_contact_name?.trim() ?? '';
  if (!sub) return true;
  if (!person) return false;
  return clientNamesMatch(sub, person);
}

export function normalizeEmail(email) {
  const s = email?.trim().toLowerCase();
  return s || null;
}

export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/** Union-find for duplicate clustering. */
export class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map(id => [id, id]));
  }

  find(id) {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur);
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  clusters() {
    const map = new Map();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!map.has(root)) map.set(root, []);
      map.get(root).push(id);
    }
    return [...map.values()].filter(c => c.length > 1);
  }
}

export const FOOTPRINT_TABLES = [
  'events',
  'client_billings',
  'client_calls',
  'client_notes',
  'ad_spend',
  'meta_ad_insights',
  'client_action_logs',
  'client_status_history',
  'client_attributes',
  'client_health_snapshots',
  'client_monthly_snapshots',
  'client_calling_windows',
  'client_mrr_history',
  'billing_reminder_log',
  'pd_schedule',
  'client_contacts',
  'client_form_submissions',
];

export const LIVE_LIFECYCLES = new Set(['new_account', 'onboarding', 'active']);
export const OFFLINE_LIFECYCLES = new Set(['paused', 'off_boarding', 'churned']);

export function expectedIsLive(lifecycle) {
  if (LIVE_LIFECYCLES.has(lifecycle)) return true;
  if (OFFLINE_LIFECYCLES.has(lifecycle)) return false;
  return null;
}

export function pickCanonical(members, footprints) {
  const scored = members.map(c => {
    const fp = footprints.get(c.id) ?? {};
    const eventCount = fp.events ?? 0;
    const totalRows = Object.values(fp).reduce((s, n) => s + n, 0);
    const dateSigned = c.date_signed ? new Date(c.date_signed).getTime() : 0;
    const launchDate = c.launch_date ? new Date(c.launch_date).getTime() : 0;
    return {
      client: c,
      score: [
        c.ghl_location_id ? 1000 : 0,
        c.clickup_task_id ? 500 : 0,
        eventCount,
        totalRows,
        launchDate,
        dateSigned,
      ],
    };
  });
  scored.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      if (b.score[i] !== a.score[i]) return b.score[i] - a.score[i];
    }
    return a.client.name.localeCompare(b.client.name);
  });
  return scored[0].client;
}
