import { normalizeStatesLicensed } from '@/lib/us-states';

export type StateLookerClient = {
  id: string;
  name: string;
  reporting_type: string | null;
  sales_package: string | null;
  states_licensed: string[];
  lifecycle_status: string | null;
  is_live: boolean;
  account_display_name: string | null;
};

export type StateLookerResult = {
  clients: StateLookerClient[];
  by_state: Record<string, string[]>;
  summary: {
    total_clients: number;
    states_covered: number;
  };
};

type RawClientRow = {
  id: string;
  name: string;
  reporting_type: string | null;
  sales_package: string | null;
  states_licensed: string[] | null;
  lifecycle_status: string | null;
  is_live: boolean | null;
  account_group_id: string | null;
};

export function buildStateLookerResult(
  rows: RawClientRow[],
  accountGroups: Record<string, { display_name: string }>,
): StateLookerResult {
  const clients: StateLookerClient[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    reporting_type: row.reporting_type,
    sales_package: row.sales_package,
    states_licensed: normalizeStatesLicensed(row.states_licensed) ?? [],
    lifecycle_status: row.lifecycle_status,
    is_live: row.is_live === true,
    account_display_name: row.account_group_id
      ? accountGroups[row.account_group_id]?.display_name ?? null
      : null,
  }));

  const by_state: Record<string, string[]> = {};
  for (const client of clients) {
    for (const code of client.states_licensed) {
      if (!by_state[code]) by_state[code] = [];
      by_state[code].push(client.id);
    }
  }

  for (const code of Object.keys(by_state)) {
    by_state[code].sort();
  }

  const states_covered = Object.keys(by_state).length;

  return {
    clients,
    by_state,
    summary: {
      total_clients: clients.length,
      states_covered,
    },
  };
}
