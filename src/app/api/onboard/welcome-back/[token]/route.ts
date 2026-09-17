import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  applyWelcomeBackSubmission,
  hasWelcomeBackAlreadySubmitted,
  parseWelcomeBackFormFields,
  resolveWelcomeBackToken,
  toWelcomeBackPrefill,
  welcomeBackInvalidMessage,
} from '@/lib/welcome-back-onboarding';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

const RATE_LIMIT_MS = 30_000;
const recentSubmits = new Map<string, number>();

function decodeToken(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  try {
    return decodeURIComponent(trimmed).trim() || null;
  } catch {
    return trimmed;
  }
}

function rateLimitKey(req: Request, token: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${forwarded ?? 'local'}:${token}`;
}

// GET /api/onboard/welcome-back/[token] — public prefill for reinstated clients.
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    const { token: raw } = await params;
    const token = decodeToken(raw);
    if (!token) {
      return NextResponse.json({ error: welcomeBackInvalidMessage() }, { status: 404 });
    }

    const service = createServiceClient();
    const client = await resolveWelcomeBackToken(service, token);
    if (!client) {
      return NextResponse.json({ error: welcomeBackInvalidMessage() }, { status: 404 });
    }

    const already_submitted = await hasWelcomeBackAlreadySubmitted(service, client.id);
    return NextResponse.json({
      ...toWelcomeBackPrefill(client),
      already_submitted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/onboard/welcome-back/[token] — allowlisted patch + reinstate_onboarding.
// Keeps welcome_back_token on the client (does not null it out).
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { token: raw } = await params;
    const token = decodeToken(raw);
    if (!token) {
      return NextResponse.json({ error: welcomeBackInvalidMessage() }, { status: 404 });
    }

    const key = rateLimitKey(req, token);
    const last = recentSubmits.get(key);
    if (last && Date.now() - last < RATE_LIMIT_MS) {
      return NextResponse.json({ error: 'Please wait before submitting again' }, { status: 429 });
    }

    const service = createServiceClient();
    const client = await resolveWelcomeBackToken(service, token);
    if (!client) {
      return NextResponse.json({ error: welcomeBackInvalidMessage() }, { status: 404 });
    }

    if (await hasWelcomeBackAlreadySubmitted(service, client.id)) {
      return NextResponse.json({ error: 'already_submitted' }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input = parseWelcomeBackFormFields(body);
    recentSubmits.set(key, Date.now());
    const result = await applyWelcomeBackSubmission(service, client.id, input, body);

    return NextResponse.json({
      success: true,
      submission_id: result.submission_id,
      message: 'Thank you — we received your updated information.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /required|valid|must start|licensed/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
