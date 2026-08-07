import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import { requireClosebotLogWrite } from "@/lib/closebot-auth";
import { cleanString } from "@/lib/closebot";

type Params = { params: Promise<{ id: string }> };

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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in body) {
    const name = cleanString(body.name);
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = name;
  }

  if ("description" in body) {
    patch.description =
      body.description === null || body.description === ""
        ? null
        : cleanString(body.description);
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
    }
    patch.is_active = body.is_active;
  }

  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return NextResponse.json({ error: "sort_order must be a number" }, { status: 400 });
    }
    patch.sort_order = Math.trunc(body.sort_order);
  }

  // Slug is intentionally not editable after create (stable FK references / deep links).

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from("closebot_agents")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(data);
}
