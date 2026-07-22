import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers } from "@/lib/api-auth";
import { formatLibraryDoc, type LibraryDocCatalogEntry } from "@/lib/ai/library-formatter";
import { LIBRARY_DOCS } from "@/lib/library-manifest";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const excludeSlug =
    typeof (body as { exclude_slug?: unknown }).exclude_slug === "string"
      ? (body as { exclude_slug: string }).exclude_slug.trim()
      : "";

  try {
    const { data } = await ctx.service
      .from("library_documents")
      .select("slug, title, artifact_type")
      .order("title", { ascending: true })
      .limit(80);

    const bySlug = new Map<string, LibraryDocCatalogEntry>();
    for (const d of LIBRARY_DOCS) {
      bySlug.set(d.slug, {
        slug: d.slug,
        title: d.title,
        artifact_type: d.artifact_type,
      });
    }
    for (const d of data ?? []) {
      bySlug.set(d.slug as string, {
        slug: d.slug as string,
        title: d.title as string,
        artifact_type: (d.artifact_type as string) ?? undefined,
      });
    }
    bySlug.delete(excludeSlug);

    const catalog = Array.from(bySlug.values())
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 80);

    const result = await formatLibraryDoc(text, catalog);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Formatting failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
