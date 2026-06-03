import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requirePermission } from "@/lib/api-auth";
import { getLiveClientIds, liveClientFilter } from "@/lib/db-helpers";
import { computeDialAnalytics } from "@/lib/dial-analytics";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, "dial_analytics");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get("client_id");
  const live_only = searchParams.get("live_only") === "true";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service
    .from("events")
    .select(
      "agent_name, client_id, event_type, is_pickup, is_conversation, is_qualified, speed_to_lead_seconds, occurred_at, occurred_at_has_time, lead_created_at, dial_source, ghl_contact_id, lead_phone, phone_number_used",
    );

  if (client_id) eventsQuery = eventsQuery.eq("client_id", client_id);
  else if (liveClientIds) eventsQuery = eventsQuery.in("client_id", liveClientFilter(liveClientIds));
  if (startDate) eventsQuery = eventsQuery.gte("occurred_at", `${startDate}T00:00:00.000Z`);
  if (endDate) eventsQuery = eventsQuery.lte("occurred_at", `${endDate}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(100000);

  const [
    { data: roster, error: rosterError },
    { data: clients, error: clientsError },
    { data: events, error: eventsError },
    { data: availability, error: availabilityError },
  ] = await Promise.all([
    ctx.service.from("agents").select("name, phone").order("name"),
    ctx.service.from("clients").select("id, name, is_live").order("name"),
    eventsQuery,
    ctx.service.from("setter_availability").select("weekday, time_start, time_end, is_live"),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });

  const result = computeDialAnalytics(
    events ?? [],
    clients ?? [],
    roster ?? [],
    startDate,
    endDate,
    availability ?? [],
  );
  return NextResponse.json(result);
}
