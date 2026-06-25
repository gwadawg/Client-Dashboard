import type { ReportingType } from '@/lib/reporting-types';

export type RosterClient = {
  id: string;
  name: string;
  account_group_id?: string | null;
  account_display_name?: string | null;
  account_primary_email?: string | null;
  primary_contact_name?: string | null;
  primary_contact?: string | null;
  reporting_type?: ReportingType | string | null;
  lifecycle_status?: string | null;
  engagement_kind?: string | null;
  mrr?: number | null;
  email?: string | null;
  [key: string]: unknown;
};

export type RosterAccountGroup = {
  accountGroupId: string;
  displayName: string;
  primaryEmail: string | null;
  offers: RosterClient[];
};

const LIFECYCLE_PRIORITY: Record<string, number> = {
  active: 5,
  onboarding: 4,
  new_account: 3,
  paused: 2,
  off_boarding: 1,
  churned: 0,
};

export function rosterAccountDisplayName(group: RosterAccountGroup): string {
  const first = group.offers[0];
  return (
    group.displayName ||
    first?.account_display_name ||
    first?.primary_contact_name ||
    first?.primary_contact ||
    first?.name ||
    'Unnamed client'
  );
}

export function rosterAccountSectionPriority(offers: RosterClient[]): number {
  let best = -1;
  for (const c of offers) {
    const status = c.lifecycle_status ?? 'active';
    best = Math.max(best, LIFECYCLE_PRIORITY[status] ?? 0);
  }
  return best;
}

/** Group filtered offer rows into one roster entry per LO account. */
export function groupClientsIntoAccounts(clients: RosterClient[]): RosterAccountGroup[] {
  const buckets = new Map<string, RosterClient[]>();

  for (const c of clients) {
    const key = c.account_group_id ?? `singleton:${c.id}`;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const groups: RosterAccountGroup[] = [];
  for (const [accountGroupId, offers] of buckets) {
    const sorted = [...offers].sort((a, b) => {
      const aInitial = a.engagement_kind === 'initial' ? 0 : 1;
      const bInitial = b.engagement_kind === 'initial' ? 0 : 1;
      if (aInitial !== bInitial) return aInitial - bInitial;
      return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
    });
    const first = sorted[0];
    groups.push({
      accountGroupId: first.account_group_id ?? accountGroupId.replace(/^singleton:/, ''),
      displayName:
        first.account_display_name ||
        first.primary_contact_name ||
        first.primary_contact ||
        first.name ||
        'Unnamed client',
      primaryEmail: first.account_primary_email ?? first.email ?? null,
      offers: sorted,
    });
  }

  return groups.sort((a, b) =>
    rosterAccountDisplayName(a).localeCompare(rosterAccountDisplayName(b), undefined, {
      sensitivity: 'base',
    }),
  );
}

export function countRosterAccounts(clients: RosterClient[]): number {
  return groupClientsIntoAccounts(clients).length;
}
