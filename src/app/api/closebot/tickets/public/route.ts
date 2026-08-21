import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { coveringFixFromTicket, createClosebotTicket } from "@/lib/closebot-store";
import type { ClosebotTicket } from "@/lib/closebot";
import {
  closebotStatusLabel,
  notifyMrWaizActivity,
} from "@/lib/mr-waiz-activity-notify";

function nestedName(row: unknown, key: "client" | "agent"): string | null {
  if (!row || typeof row !== "object") return null;
  const nested = (row as Record<string, unknown>)[key];
  if (!nested || typeof nested !== "object") return null;
  const name = (nested as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

const RATE_LIMIT_MS = 15_000;
const recentSubmits = new Map<string, number>();

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const honeypot = typeof body.fax_number === "string" ? body.fax_number.trim() : "";
  if (honeypot) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req);
  const last = recentSubmits.get(ip);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return NextResponse.json({ error: "Please wait before submitting again" }, { status: 429 });
  }
  recentSubmits.set(ip, Date.now());

  const db = createServiceClient();
  const created = await createClosebotTicket(db, body, {
    defaultStatus: "new",
    allowStatus: false,
  });
  if (created.error) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }
  const ticket = created.ticket as ClosebotTicket | undefined;
  if (ticket) {
    void notifyMrWaizActivity(db, {
      eventKey: "closebot.ticket_created",
      actor: { label: ticket.reporter_name },
      fields: {
        reporter_name: ticket.reporter_name,
        client_name: nestedName(ticket, "client"),
        agent_name: nestedName(ticket, "agent"),
        bug_type: ticket.bug_type,
        status: ticket.status,
        status_label: closebotStatusLabel(ticket.status),
        description: ticket.description,
        contact_url: ticket.contact_url,
      },
    });
  }
  return NextResponse.json({
    ok: true,
    coverage: ticket?.coverage === "pre_fix" ? "pre_fix" : "actionable",
    covering_fix: ticket ? coveringFixFromTicket(ticket) : null,
  });
}
