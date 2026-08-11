import type {
  VerticalBucket,
  VerticalClientDialRow,
  VerticalEffort,
} from "@/lib/agent-performance-types";
import {
  normalizeReportingType,
  REPORTING_TYPES,
  type ReportingType,
} from "@/lib/reporting-types";

export type VerticalDialEvent = {
  event_type: string;
  client_id: string | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
};

export type ClientReportingRef = {
  id: string;
  name: string | null;
  reporting_type?: string | null;
};

const TOP_CLIENTS = 8;

function emptyBucket(): VerticalBucket {
  return {
    dials: 0,
    pickups: 0,
    conversations: 0,
    pickup_rate: 0,
    clients: [],
  };
}

function emptyEffort(): VerticalEffort {
  const by_type = Object.fromEntries(
    REPORTING_TYPES.map(t => [t, emptyBucket()]),
  ) as Record<ReportingType, VerticalBucket>;
  return {
    by_type,
    unattributed: { dials: 0 },
    total_attributed_dials: 0,
  };
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

/**
 * Aggregate dial effort by client reporting vertical (RM / DSCR / CALL_CENTER).
 * Only dial events contribute. Missing client_id → unattributed.
 */
export function computeVerticalEffort(
  events: VerticalDialEvent[],
  clients: ClientReportingRef[],
  topClientsPerVertical: number = TOP_CLIENTS,
): VerticalEffort {
  const result = emptyEffort();
  const clientById = new Map(clients.map(c => [c.id, c]));

  type ClientAcc = {
    client_id: string;
    client_name: string;
    reporting_type: ReportingType;
    dials: number;
    pickups: number;
    conversations: number;
  };
  const clientAcc = new Map<string, ClientAcc>();

  for (const row of events) {
    if (row.event_type !== "dial") continue;

    const clientId = row.client_id?.trim() || null;
    if (!clientId) {
      result.unattributed.dials++;
      continue;
    }

    const ref = clientById.get(clientId);
    const reporting_type = normalizeReportingType(ref?.reporting_type);
    const bucket = result.by_type[reporting_type];
    bucket.dials++;
    if (row.is_pickup) bucket.pickups++;
    if (row.is_conversation) bucket.conversations++;

    let acc = clientAcc.get(clientId);
    if (!acc) {
      acc = {
        client_id: clientId,
        client_name: ref?.name?.trim() || "Unknown client",
        reporting_type,
        dials: 0,
        pickups: 0,
        conversations: 0,
      };
      clientAcc.set(clientId, acc);
    }
    acc.dials++;
    if (row.is_pickup) acc.pickups++;
    if (row.is_conversation) acc.conversations++;
  }

  for (const t of REPORTING_TYPES) {
    const bucket = result.by_type[t];
    bucket.pickup_rate = pct(bucket.pickups, bucket.dials);
    result.total_attributed_dials += bucket.dials;
  }

  const byTypeClients = new Map<ReportingType, VerticalClientDialRow[]>();
  for (const t of REPORTING_TYPES) byTypeClients.set(t, []);

  for (const acc of clientAcc.values()) {
    byTypeClients.get(acc.reporting_type)!.push({
      client_id: acc.client_id,
      client_name: acc.client_name,
      dials: acc.dials,
      pickups: acc.pickups,
      conversations: acc.conversations,
    });
  }

  for (const t of REPORTING_TYPES) {
    const rows = byTypeClients.get(t)!;
    rows.sort((a, b) => b.dials - a.dials || a.client_name.localeCompare(b.client_name));
    result.by_type[t].clients = rows.slice(0, topClientsPerVertical);
  }

  return result;
}
