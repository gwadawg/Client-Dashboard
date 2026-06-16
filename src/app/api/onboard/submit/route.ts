import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { applyOnboardingSubmission, uploadClientHeadshot } from '@/lib/apply-onboarding';
import { parseOnboardingFormFields } from '@/lib/onboarding-form';

const RATE_LIMIT_MS = 30_000;
const recentSubmits = new Map<string, number>();

function rateLimitKey(req: Request, email: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${forwarded ?? 'local'}:${email.toLowerCase()}`;
}

// POST /api/onboard/submit — public client onboarding form (multipart or JSON).
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let body: Record<string, unknown> = {};
    let headshotFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (key === 'headshot' && value instanceof File && value.size > 0) {
          headshotFile = value;
          continue;
        }
        if (key === 'states_licensed' || key === 'company_states_licensed' || key === 'additional_members') {
          try {
            body[key] = JSON.parse(String(value));
          } catch {
            if (key === 'additional_members') {
              body[key] = [];
            } else {
              body[key] = String(value).split(',').map(s => s.trim()).filter(Boolean);
            }
          }
          continue;
        }
        body[key] = typeof value === 'string' ? value : String(value);
      }
    } else {
      body = await req.json();
    }

    const input = parseOnboardingFormFields(body);
    const key = rateLimitKey(req, input.email);
    const last = recentSubmits.get(key);
    if (last && Date.now() - last < RATE_LIMIT_MS) {
      return NextResponse.json({ error: 'Please wait before submitting again' }, { status: 429 });
    }
    recentSubmits.set(key, Date.now());

    const service = createServiceClient();

    if (headshotFile) {
      input.headshot_url = await uploadClientHeadshot(service, headshotFile);
      body.headshot_url = input.headshot_url;
    }

    const result = await applyOnboardingSubmission(service, input, body);

    return NextResponse.json({
      success: true,
      matched: result.matched,
      message: result.matched
        ? 'Thank you — we received your information and will be in touch about your onboarding call.'
        : 'Thank you — we received your information. Our team will match it to your account shortly.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
