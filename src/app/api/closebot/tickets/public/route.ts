import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { coveringFixFromTicket, createClosebotTicket } from "@/lib/closebot-store";
import type { ClosebotTicket } from "@/lib/closebot";

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
  return NextResponse.json({
    ok: true,
    coverage: ticket?.coverage === "pre_fix" ? "pre_fix" : "actionable",
    covering_fix: ticket ? coveringFixFromTicket(ticket) : null,
  });
}
