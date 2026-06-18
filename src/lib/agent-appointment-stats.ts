import type { createServiceClient } from './supabase';
import {
  OUTCOME_EVENT_TYPES,
  buildOutcomeIndex,
  matchOutcome,
  type BookingKey,
  type OutcomeRecord,
} from './appointments';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type AppointmentDisposition =
  | 'pending'
  | 'show'
  | 'no_show'
  | 'appointment_cancelled'
  | 'lo_bailed';

export type AgentBookingRow = BookingKey & {
  agent_name: string | null;
  client_id?: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  external_id: string | null;
  calendar_name: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  ghl_contact_id: string | null;
  clients?: { name?: string; ghl_location_id?: string | null } | null;
};

export type EnrichedAgentBooking = AgentBookingRow & {
  status: AppointmentDisposition;
  outcome_id: string | null;
};

export type AgentAppointmentOutcomeCounts = {
  appointments: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancelled: number;
  pending: number;
};

export type FetchBookingsOptions = {
  startDate: string | null;
  endDate: string | null;
  /** Narrow bookings at the DB layer (roster name + phone). In-memory roster match still applied downstream. */
  agentNameAliases?: string[];
  hardCap?: number;
};

export const AGENT_BOOKING_SELECT =
  'id, client_id, occurred_at, scheduled_at, external_id, calendar_name, calendar_id, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, stage_booked, clients(name, ghl_location_id)';

const BOOKING_PAGE = 1000;
const OUTCOME_CONTACT_CHUNK = 200;
const DEFAULT_HARD_CAP = 25000;

export function emptyOutcomeCounts(): AgentAppointmentOutcomeCounts {
  return {
    appointments: 0,
    shows: 0,
    no_shows: 0,
    lo_bailed: 0,
    cancelled: 0,
    pending: 0,
  };
}

export function incrementOutcomeCount(
  counts: AgentAppointmentOutcomeCounts,
  status: AppointmentDisposition,
): void {
  counts.appointments++;
  switch (status) {
    case 'show':
      counts.shows++;
      break;
    case 'no_show':
      counts.no_shows++;
      break;
    case 'lo_bailed':
      counts.lo_bailed++;
      break;
    case 'appointment_cancelled':
      counts.cancelled++;
      break;
    default:
      counts.pending++;
  }
}

/** Gross show rate: shows ÷ (shows + no-shows + LO bailed) for dispositioned appts. */
export function grossShowRate(counts: AgentAppointmentOutcomeCounts): number {
  const dispositioned = counts.shows + counts.no_shows + counts.lo_bailed;
  return dispositioned > 0 ? Math.round((counts.shows / dispositioned) * 100) : 0;
}

/** Net show rate: shows ÷ (shows + no-shows), excludes cancel/LO bail/pending. */
export function netShowRate(counts: AgentAppointmentOutcomeCounts): number {
  const attended = counts.shows + counts.no_shows;
  return attended > 0 ? Math.round((counts.shows / attended) * 100) : 0;
}

export function enrichBookingsWithOutcomes(
  bookings: AgentBookingRow[],
  outcomes: OutcomeRecord[],
): EnrichedAgentBooking[] {
  const index = buildOutcomeIndex(outcomes);
  return bookings.map(b => {
    const outcome = matchOutcome(b, index);
    const status = (outcome?.event_type ?? 'pending') as AppointmentDisposition;
    return {
      ...b,
      status,
      outcome_id: outcome?.id ?? null,
    };
  });
}

export function summarizeOutcomesByAgent(
  enriched: EnrichedAgentBooking[],
  resolveAgent: (raw: string | null | undefined) => string | null,
): Map<string, AgentAppointmentOutcomeCounts> {
  const byAgent = new Map<string, AgentAppointmentOutcomeCounts>();
  for (const row of enriched) {
    const agent = resolveAgent(row.agent_name);
    if (!agent) continue;
    const counts = byAgent.get(agent) ?? emptyOutcomeCounts();
    incrementOutcomeCount(counts, row.status);
    byAgent.set(agent, counts);
  }
  return byAgent;
}

/** Every disposition bucket should sum to total appointments. */
export function countsAreConsistent(counts: AgentAppointmentOutcomeCounts): boolean {
  const parts =
    counts.shows +
    counts.no_shows +
    counts.lo_bailed +
    counts.cancelled +
    counts.pending;
  return parts === counts.appointments;
}

async function fetchAllBookings(
  service: ServiceClient,
  options: FetchBookingsOptions,
): Promise<AgentBookingRow[]> {
  const hardCap = options.hardCap ?? DEFAULT_HARD_CAP;
  const rows: AgentBookingRow[] = [];

  for (let offset = 0; offset < hardCap; offset += BOOKING_PAGE) {
    let q = service
      .from('events')
      .select(AGENT_BOOKING_SELECT)
      .eq('event_type', 'appointment_booked')
      .order('occurred_at', { ascending: false })
      .range(offset, offset + BOOKING_PAGE - 1);

    if (options.startDate) q = q.gte('occurred_at', `${options.startDate}T00:00:00.000Z`);
    if (options.endDate) q = q.lte('occurred_at', `${options.endDate}T23:59:59.999Z`);

    if (options.agentNameAliases?.length) {
      q = q.in('agent_name', options.agentNameAliases);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...(data as AgentBookingRow[]));
    if (data.length < BOOKING_PAGE) break;
  }

  return rows;
}

export async function fetchOutcomesForBookings(
  service: ServiceClient,
  bookings: AgentBookingRow[],
): Promise<OutcomeRecord[]> {
  const contactIds = Array.from(
    new Set(bookings.map(b => b.ghl_contact_id).filter((v): v is string => !!v)),
  );
  if (contactIds.length === 0) return [];

  const outcomes: OutcomeRecord[] = [];
  for (let i = 0; i < contactIds.length; i += OUTCOME_CONTACT_CHUNK) {
    const chunk = contactIds.slice(i, i + OUTCOME_CONTACT_CHUNK);
    const { data, error } = await service
      .from('events')
      .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .in('ghl_contact_id', chunk);

    if (error) throw new Error(error.message);
    outcomes.push(...((data ?? []) as OutcomeRecord[]));
  }

  return outcomes;
}

export async function fetchEnrichedBookingsInRange(
  service: ServiceClient,
  startDate: string | null,
  endDate: string | null,
  options: Omit<FetchBookingsOptions, 'startDate' | 'endDate'> = {},
): Promise<EnrichedAgentBooking[]> {
  const bookings = await fetchAllBookings(service, {
    startDate,
    endDate,
    ...options,
  });
  const outcomes = await fetchOutcomesForBookings(service, bookings);
  return enrichBookingsWithOutcomes(bookings, outcomes);
}

export function outcomeSummaryFromRows(rows: EnrichedAgentBooking[]): AgentAppointmentOutcomeCounts {
  const summary = emptyOutcomeCounts();
  for (const row of rows) {
    incrementOutcomeCount(summary, row.status);
  }
  return summary;
}

/** Legacy KPI path: count raw show/no_show events by occurred_at in range. */
export function countLegacyOutcomeEvents(
  events: { event_type: string; agent_name: string | null }[],
  resolveAgent: (raw: string | null | undefined) => string | null,
): Map<string, { shows: number; no_shows: number }> {
  const map = new Map<string, { shows: number; no_shows: number }>();
  for (const row of events) {
    const agent = resolveAgent(row.agent_name);
    if (!agent) continue;
    const acc = map.get(agent) ?? { shows: 0, no_shows: 0 };
    if (row.event_type === 'show') acc.shows++;
    else if (row.event_type === 'no_show') acc.no_shows++;
    map.set(agent, acc);
  }
  return map;
}
