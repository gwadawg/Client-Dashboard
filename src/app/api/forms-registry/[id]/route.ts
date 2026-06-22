import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers } from "@/lib/api-auth";

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

function cleanTags(v: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(v)) raw = v.filter((t): t is string => typeof t === "string");
  else if (typeof v === "string") raw = v.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  if ("title" in body) {
    const title = cleanString(body.title);
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    updates.title = title;
  }
  if ("slug" in body) {
    const slug = cleanString(body.slug);
    if (!slug) return NextResponse.json({ error: "slug cannot be empty" }, { status: 400 });
    updates.slug = slug;
  }
  if ("href" in body) {
    const href = cleanString(body.href);
    if (!href) return NextResponse.json({ error: "href cannot be empty" }, { status: 400 });
    updates.href = href;
  }
  if ("description" in body) updates.description = cleanString(body.description) ?? "";
  if ("audience" in body) updates.audience = cleanString(body.audience) ?? "";
  if ("tags" in body) updates.tags = cleanTags(body.tags);
  if ("sort_order" in body && typeof body.sort_order === "number") {
    updates.sort_order = body.sort_order;
  }

  const { data, error } = await ctx.service
    .from("form_registry")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A form with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from("form_registry").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
