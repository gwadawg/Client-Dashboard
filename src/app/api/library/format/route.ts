import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers } from "@/lib/api-auth";
import { formatLibraryDoc } from "@/lib/ai/library-formatter";

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

  try {
    const result = await formatLibraryDoc(text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Formatting failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
