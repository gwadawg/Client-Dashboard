import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers, requirePermission } from "@/lib/api-auth";

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

export type FormRegistryRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  audience: string;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, "resources");
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from("form_registry")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = cleanString(body.title);
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const slug = cleanString(body.slug);
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const href = cleanString(body.href);
  if (!href) return NextResponse.json({ error: "href is required" }, { status: 400 });

  const row = {
    slug,
    title,
    href,
    description: cleanString(body.description) ?? "",
    audience: cleanString(body.audience) ?? "",
    tags: cleanTags(body.tags),
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from("form_registry")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A form with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
