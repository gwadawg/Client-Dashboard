import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import { requireClosebotLogWrite } from "@/lib/closebot-auth";
import { parsePersonaBody } from "@/lib/closebot";

type Params = { params: Promise<{ id: string }> };

const PERSONA_SELECT =
  "id, name, slug, description, how_to_respond, tone, custom_delay_enabled, typo_frequency, custom_delay_seconds, is_active, sort_order, created_at, updated_at";

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogWrite(ctx);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parsePersonaBody(body, false);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const fields = parsed.fields ?? {};
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from("closebot_personas")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(PERSONA_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  return NextResponse.json(data);
}
