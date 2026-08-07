import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotAgentsRead,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import { cleanString, slugifyClosebotName } from "@/lib/closebot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uniqueSlug(service: { from: (t: string) => any }, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    const { data } = await service
      .from("closebot_agents")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotAgentsRead(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const activeOnly =
    url.searchParams.get("active") === "1" || url.searchParams.get("active") === "true";
  const withCounts =
    url.searchParams.get("counts") === "1" || url.searchParams.get("counts") === "true";

  let query = ctx.service
    .from("closebot_agents")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  if (withCounts && rows.length > 0) {
    const ids = rows.map((r: { id: string }) => r.id);
    const { data: logRows, error: logErr } = await ctx.service
      .from("closebot_prompt_log")
      .select("agent_id")
      .in("agent_id", ids);
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });
    const counts = new Map<string, number>();
    for (const row of logRows ?? []) {
      const id = (row as { agent_id: string }).agent_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    rows = rows.map((r: { id: string }) => ({
      ...r,
      log_count: counts.get(r.id) ?? 0,
    }));
  }

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogWrite(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanString(body.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const description = cleanString(body.description);
  const sortOrder =
    typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0;

  const baseSlug = slugifyClosebotName(
    typeof body.slug === "string" && body.slug.trim() ? body.slug : name,
  );
  const slug = await uniqueSlug(ctx.service, baseSlug);

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from("closebot_agents")
    .insert({
      name,
      slug,
      description,
      is_active: body.is_active === false ? false : true,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
