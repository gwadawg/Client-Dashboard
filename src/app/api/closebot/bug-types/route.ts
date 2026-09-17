import { NextResponse } from "next/server";
import { getAuthContext, isAuthError } from "@/lib/api-auth";
import { requireClosebotLogView, requireClosebotLogWrite } from "@/lib/closebot-auth";
import {
  cleanString,
  isClosebotBugTypeSlug,
  shortCodeFromName,
  slugifyClosebotBugType,
} from "@/lib/closebot";

const SELECT = "slug, name, short_code, description, sort_order, is_active, created_at, updated_at";

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireClosebotLogView(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from("closebot_bug_types")
    .select(SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ types: data ?? [] });
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

  const slugRaw = cleanString(body.slug) ?? slugifyClosebotBugType(name);
  const slug = slugifyClosebotBugType(slugRaw);
  if (!isClosebotBugTypeSlug(slug)) {
    return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  }

  const shortCodeRaw = cleanString(body.short_code) ?? shortCodeFromName(name);
  const short_code = shortCodeRaw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
  if (short_code.length < 2) {
    return NextResponse.json({ error: "short_code must be 2–8 characters" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from("closebot_bug_types")
    .insert({
      slug,
      name,
      short_code,
      description: cleanString(body.description),
      sort_order:
        typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
          ? Math.trunc(body.sort_order)
          : 100,
      is_active: body.is_active === false ? false : true,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A type with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
