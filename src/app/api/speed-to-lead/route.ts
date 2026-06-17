import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requirePermission } from "@/lib/api-auth";
import { getLiveClientIds, liveClientFilter } from "@/lib/db-helpers";
import {
  computeSpeedToLead,
  parseSpeedToLeadParams,
  type SpeedToLeadReading,
} from "@/lib/speed-to-lead";

const EVENT_SELECT =
  "agent_name, client_id, event_type, is_pickup, is_conversation, occurred_at, occurred_at_has_time, lead_created_at, ghl_contact_id, lead_phone, lead_name, phone_number_used";

const EXCLUSION_LABELS: Record<string, string> = {
  no_time: "Missing precise timestamp",
  off_hours: "Off-hours (outside setter schedule)",
  before_cutoff: "Before time cutoff",
  after_cutoff: "After time cutoff",
};

function readingToRow(
  r: SpeedToLeadReading,
  clientName: string | null,
): Record<string, unknown> {
  return {
    client: clientName,
    client_id: r.client_id,
    lead_name: r.lead_name,
    lead_phone: r.lead_phone,
    lead_at: r.lead_at,
    dial_at: r.dial_at,
    response_min: Math.round((r.seconds / 60) * 10) / 10,
    agent_name: r.agent,
    is_pickup: r.is_pickup,
    is_conversation: r.is_conversation,
    counted: r.counted,
    excluded_reason: r.excluded_reason ?? null,
    excluded_label: r.excluded_reason ? EXCLUSION_LABELS[r.excluded_reason] ?? r.excluded_reason : null,
  };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, "speed_to_lead");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get("client_id");
  const live_only = searchParams.get("live_only") === "true";
  const start_date = searchParams.get("start_date");
  const end_date = searchParams.get("end_date");
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));
  const speedToLeadOptions = parseSpeedToLeadParams(searchParams);

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service.from("events").select(EVENT_SELECT);
  if (client_id) eventsQuery = eventsQuery.eq("client_id", client_id);
  else if (liveClientIds) eventsQuery = eventsQuery.in("client_id", liveClientFilter(liveClientIds));
  if (start_date) eventsQuery = eventsQuery.gte("occurred_at", `${start_date}T00:00:00.000Z`);
  if (end_date) eventsQuery = eventsQuery.lte("occurred_at", `${end_date}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(100000);

  const [{ data: events, error: eventsError }, { data: availability, error: availabilityError }, { data: clients }] =
    await Promise.all([
      eventsQuery,
      ctx.service.from("setter_availability").select("weekday, time_start, time_end, is_live"),
      ctx.service.from("clients").select("id, name"),
    ]);

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });

  const clientNames = new Map((clients ?? []).map(c => [c.id, c.name]));
  const result = computeSpeedToLead(events ?? [], availability ?? [], undefined, undefined, speedToLeadOptions);

  let readings = [...result.readings].sort((a, b) => b.dial_at.localeCompare(a.dial_at));

  if (search) {
    readings = readings.filter(r => {
      const name = (r.lead_name ?? "").toLowerCase();
      const phone = (r.lead_phone ?? "").toLowerCase();
      return name.includes(search) || phone.includes(search);
    });
  }

  const total = readings.length;
  const offset = (page - 1) * limit;
  const pageRows = readings.slice(offset, offset + limit).map(r =>
    readingToRow(r, r.client_id ? clientNames.get(r.client_id) ?? null : null),
  );

  return NextResponse.json({
    rows: pageRows,
    total,
    page,
    limit,
    summary: {
      median_min: result.median_min,
      sample_size: result.sample_size,
      excluded_out_of_window: result.excluded_out_of_window,
      excluded_no_time: result.excluded_no_time,
      excluded_before_cutoff: result.excluded_before_cutoff,
      excluded_after_cutoff: result.excluded_after_cutoff,
      time_zone: result.time_zone,
      live_window_count: result.live_window_count,
    },
    by_hour: result.by_hour,
  });
}
