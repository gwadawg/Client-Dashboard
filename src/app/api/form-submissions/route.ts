import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  FORM_STATUSES,
  FORM_TYPES,
  listFormSubmissions,
  type FormStatus,
  type FormType,
} from '@/lib/form-submissions';

function parseFormType(v: string | null): FormType | undefined {
  if (!v) return undefined;
  return FORM_TYPES.includes(v as FormType) ? (v as FormType) : undefined;
}

function parseFormStatus(v: string | null): FormStatus | undefined {
  if (!v) return undefined;
  return FORM_STATUSES.includes(v as FormStatus) ? (v as FormStatus) : undefined;
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const form_type = parseFormType(searchParams.get('form_type'));
  const status = parseFormStatus(searchParams.get('status'));
  const include_dismissed = searchParams.get('include_dismissed') === '1';
  const limitRaw = Number(searchParams.get('limit') ?? 300);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 300;

  try {
    const submissions = await listFormSubmissions(ctx.service, {
      form_type,
      status,
      include_dismissed,
      limit,
    });
    return NextResponse.json({ submissions, total: submissions.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
