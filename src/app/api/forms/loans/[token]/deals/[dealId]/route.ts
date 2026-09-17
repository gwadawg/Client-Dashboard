import { NextResponse } from 'next/server';
import { resolveLoanLogToken } from '@/lib/loan-log-form';
import { setLoanDealFellOut } from '@/lib/loan-deals';
import { createServiceClient } from '@/lib/supabase';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; dealId: string }> },
) {
  const { token, dealId } = await params;
  const service = createServiceClient();
  const client = await resolveLoanLogToken(service, decodeURIComponent(token));
  if (!client) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.fell_out !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  try {
    const result = await setLoanDealFellOut(
      service,
      dealId,
      client.client_id,
      body.fell_out,
    );
    if (!('ok' in result)) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, fell_out: body.fell_out });
  } catch {
    return NextResponse.json({ error: "Couldn't update this loan." }, { status: 500 });
  }
}
