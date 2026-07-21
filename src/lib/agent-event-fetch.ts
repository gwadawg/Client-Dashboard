import type { createServiceClient } from './supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type AgentEventRow = {
  agent_name: string | null;
  client_id: string | null;
  event_type: string;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  speed_to_lead_seconds: number | null;
  occurred_at: string;
  occurred_at_has_time: boolean | null;
  lead_created_at: string | null;
  ghl_contact_id: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_name: string | null;
  phone_number_used: string | null;
};

export const AGENT_EVENT_SELECT =
  'agent_name, client_id, event_type, is_pickup, is_conversation, speed_to_lead_seconds, occurred_at, occurred_at_has_time, lead_created_at, ghl_contact_id, lead_phone, lead_email, lead_name, phone_number_used';

const PAGE_SIZE = 1000;
const HARD_CAP = 100_000;

/** Event types agent-stats / ops actually aggregate (skip leads/shows/etc.). */
export const AGENT_STATS_EVENT_TYPES = [
  'dial',
  'appointment_booked',
  'callback_booked',
  'live_transfer',
] as const;

/** Paginated fetch for agent-stats — avoids PostgREST default 1k row cap. */
export async function fetchAgentEventsInRange(
  service: ServiceClient,
  startDate: string | null,
  endDate: string | null,
): Promise<AgentEventRow[]> {
  const rows: AgentEventRow[] = [];

  for (let offset = 0; offset < HARD_CAP; offset += PAGE_SIZE) {
    let q = service
      .from('events')
      .select(AGENT_EVENT_SELECT)
      .in('event_type', [...AGENT_STATS_EVENT_TYPES])
      .order('occurred_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (startDate) q = q.gte('occurred_at', `${startDate}T00:00:00.000Z`);
    if (endDate) q = q.lte('occurred_at', `${endDate}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...(data as AgentEventRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}
