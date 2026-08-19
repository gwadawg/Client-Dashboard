import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import {
  requireClosebotAgentsRead,
  requireClosebotLogWrite,
} from "@/lib/closebot-auth";
import {
  parsePersonaBody,
  slugifyClosebotName,
  uniqueClosebotSlug,
} from "@/lib/closebot";

const PERSONA_SELECT =
  "id, name, slug, description, how_to_respond, tone, custom_delay_enabled, typo_frequency, custom_delay_seconds, is_active, sort_order, created_at, updated_at";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotAgentsRead(ctx);
  if (denied) return denied;

  const url = new URL(req.url);
  const activeOnly =
    url.searchParams.get("active") === "1" || url.searchParams.get("active") === "true";

  let query = ctx.service
    .from("closebot_personas")
    .select(PERSONA_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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

  const parsed = parsePersonaBody(body, true);
  if (parsed.error || !parsed.fields) {
    return NextResponse.json({ error: parsed.error || "Invalid persona" }, { status: 400 });
  }

  const baseSlug = slugifyClosebotName(String(parsed.fields.name));
  const slug = await uniqueClosebotSlug(async (candidate) => {
    const { data } = await ctx.service
      .from("closebot_personas")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    return Boolean(data);
  }, baseSlug);

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from("closebot_personas")
    .insert({ ...parsed.fields, slug, created_at: now, updated_at: now })
    .select(PERSONA_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
