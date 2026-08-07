import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/api-auth";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

/** View timeline / list logs. */
export function requireClosebotLogView(ctx: AuthContext): NextResponse | null {
  return requirePermission(ctx, "closebot_log");
}

/**
 * Create/edit logs and manage agents.
 * Anyone granted the Closebot Log tab (or unrestricted / owner) may write.
 * Admins also pass so roster managers can seed agents without a special grant.
 */
export function requireClosebotLogWrite(ctx: AuthContext): NextResponse | null {
  if (ctx.isOwner || ctx.isAdmin) return null;
  if (
    hasPermission("closebot_log", {
      isOwner: ctx.isOwner,
      allowedPermissions: ctx.allowedPermissions,
    })
  ) {
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** List agents from Library (resources) or Ops log form. */
export function requireClosebotAgentsRead(ctx: AuthContext): NextResponse | null {
  return requireAnyPermission(ctx, ["closebot_log", "resources"]);
}
